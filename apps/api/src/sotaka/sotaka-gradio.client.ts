import { Logger } from "@nestjs/common";
import { promises as fs } from "node:fs";
import path from "node:path";

export type FetchLike = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

export interface SotakaSpeakResult {
  audioPath: string;
  log: string;
}

export interface SotakaSeparateResult {
  vocalsPath: string | null;
  instrumentalPath: string | null;
  log: string;
}

/**
 * Minimal Gradio 5/6 client for SOTAKA HF Space
 * (Speak + Vocal Remover). No @gradio/client dependency.
 */
export class SotakaGradioClient {
  private readonly logger = new Logger(SotakaGradioClient.name);
  private readonly baseUrl: string;
  private readonly token?: string;
  private readonly fetchImpl: FetchLike;
  private readonly timeoutMs: number;

  constructor(opts: {
    baseUrl: string;
    token?: string;
    fetchImpl?: FetchLike;
    timeoutMs?: number;
  }) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, "");
    this.token = opts.token?.trim() || undefined;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.timeoutMs = opts.timeoutMs ?? 600_000;
  }

  private headers(extra?: Record<string, string>): Record<string, string> {
    const h: Record<string, string> = { ...(extra ?? {}) };
    if (this.token) h.Authorization = `Bearer ${this.token}`;
    return h;
  }

  async uploadFile(localPath: string): Promise<string> {
    const buf = await fs.readFile(localPath);
    const name = path.basename(localPath) || "audio.wav";
    const form = new FormData();
    form.append(
      "files",
      new Blob([new Uint8Array(buf)], { type: "audio/wav" }),
      name,
    );
    const res = await this.fetchImpl(`${this.baseUrl}/gradio_api/upload`, {
      method: "POST",
      headers: this.headers(),
      body: form,
    });
    if (!res.ok) {
      throw new Error(`SOTAKA upload failed (HTTP ${res.status}).`);
    }
    const json = (await res.json()) as unknown;
    const remote = Array.isArray(json) ? json[0] : null;
    if (typeof remote !== "string" || !remote) {
      throw new Error("SOTAKA upload returned no path.");
    }
    return remote;
  }

  private fileData(remotePath: string) {
    return {
      path: remotePath,
      meta: { _type: "gradio.FileData" as const },
    };
  }

  async predict(apiName: string, data: unknown[]): Promise<unknown[]> {
    const name = apiName.replace(/^\//, "");
    const callRes = await this.fetchImpl(
      `${this.baseUrl}/gradio_api/call/${name}`,
      {
        method: "POST",
        headers: this.headers({ "Content-Type": "application/json" }),
        body: JSON.stringify({ data }),
      },
    );
    if (!callRes.ok) {
      throw new Error(`SOTAKA call /${name} failed (HTTP ${callRes.status}).`);
    }
    const { event_id: eventId } = (await callRes.json()) as {
      event_id?: string;
    };
    if (!eventId) {
      throw new Error(`SOTAKA call /${name} returned no event_id.`);
    }
    return this.pollResult(name, eventId);
  }

  private async pollResult(
    apiName: string,
    eventId: string,
  ): Promise<unknown[]> {
    const url = `${this.baseUrl}/gradio_api/call/${apiName}/${eventId}`;
    const started = Date.now();
    while (Date.now() - started < this.timeoutMs) {
      const res = await this.fetchImpl(url, {
        method: "GET",
        headers: this.headers({ Accept: "text/event-stream" }),
      });
      if (!res.ok) {
        throw new Error(
          `SOTAKA poll /${apiName} failed (HTTP ${res.status}).`,
        );
      }
      const text = await res.text();
      const parsed = this.parseSse(text);
      if (parsed.error) {
        throw new Error(`SOTAKA /${apiName}: ${parsed.error}`);
      }
      if (parsed.data) return parsed.data;
      await new Promise((r) => setTimeout(r, 1500));
    }
    throw new Error(`SOTAKA /${apiName} timed out after ${this.timeoutMs}ms.`);
  }

  private parseSse(text: string): { data?: unknown[]; error?: string } {
    const lines = text.split(/\r?\n/);
    let event = "message";
    for (const line of lines) {
      if (line.startsWith("event:")) {
        event = line.slice(6).trim();
        continue;
      }
      if (!line.startsWith("data:")) continue;
      const raw = line.slice(5).trim();
      if (!raw) continue;
      let payload: unknown;
      try {
        payload = JSON.parse(raw);
      } catch {
        continue;
      }
      if (event === "error") {
        return {
          error:
            typeof payload === "string"
              ? payload
              : JSON.stringify(payload).slice(0, 400),
        };
      }
      if (event === "complete") {
        if (Array.isArray(payload)) return { data: payload };
        if (
          payload &&
          typeof payload === "object" &&
          Array.isArray((payload as { data?: unknown }).data)
        ) {
          return { data: (payload as { data: unknown[] }).data };
        }
      }
    }
    return {};
  }

  async downloadToFile(
    fileRef: unknown,
    destPath: string,
  ): Promise<string | null> {
    if (fileRef == null) return null;
    let url: string | null = null;
    if (typeof fileRef === "string") {
      url = fileRef.startsWith("http")
        ? fileRef
        : `${this.baseUrl}/gradio_api/file=${fileRef}`;
    } else if (typeof fileRef === "object") {
      const obj = fileRef as { url?: string | null; path?: string };
      if (obj.url) {
        url = obj.url.startsWith("http")
          ? obj.url
          : `${this.baseUrl}${obj.url.startsWith("/") ? "" : "/"}${obj.url}`;
      } else if (obj.path) {
        url = `${this.baseUrl}/gradio_api/file=${obj.path}`;
      }
    }
    if (!url) return null;

    const res = await this.fetchImpl(url, { headers: this.headers() });
    if (!res.ok) {
      this.logger.warn(`SOTAKA download failed HTTP ${res.status}`);
      return null;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 64) return null;
    await fs.mkdir(path.dirname(destPath), { recursive: true });
    await fs.writeFile(destPath, buf);
    return destPath;
  }

  /**
   * Speak one batch (SOTAKA splits internally; Continue is not public for State).
   * Caller should keep text ≤ ~1400 chars per call for ZeroGPU.
   */
  async speak(opts: {
    text: string;
    instruct?: string;
    refAudioLocalPath?: string;
    refText?: string;
    timesteps?: number;
    cfg?: number;
    outputPath: string;
  }): Promise<SotakaSpeakResult> {
    let refRemote: unknown = null;
    if (opts.refAudioLocalPath) {
      const uploaded = await this.uploadFile(opts.refAudioLocalPath);
      refRemote = this.fileData(uploaded);
    }
    const data = [
      opts.text,
      opts.instruct ?? "",
      refRemote,
      opts.refText ?? "",
      opts.timesteps ?? 5,
      opts.cfg ?? 2.0,
    ];
    const out = await this.predict("synthesize", data);
    const audioRef = out[0];
    const log = typeof out[1] === "string" ? out[1] : "";
    const saved = await this.downloadToFile(audioRef, opts.outputPath);
    if (!saved) {
      throw new Error(
        `SOTAKA Speak produced no audio. ${log.slice(0, 240) || "Empty output."}`,
      );
    }
    return { audioPath: saved, log };
  }

  async separateVocals(opts: {
    audioLocalPath: string;
    modelName?: "htdemucs" | "htdemucs_ft";
    vocalsOutPath: string;
    instrumentalOutPath: string;
  }): Promise<SotakaSeparateResult> {
    const uploaded = await this.uploadFile(opts.audioLocalPath);
    const out = await this.predict("separate_ui", [
      this.fileData(uploaded),
      opts.modelName ?? "htdemucs",
    ]);
    const log = typeof out[2] === "string" ? out[2] : "";
    const vocals = await this.downloadToFile(out[0], opts.vocalsOutPath);
    const instrumental = await this.downloadToFile(
      out[1],
      opts.instrumentalOutPath,
    );
    if (!vocals && !instrumental) {
      throw new Error(
        `SOTAKA Vocal Remover failed. ${log.slice(0, 240) || "No stems."}`,
      );
    }
    return {
      vocalsPath: vocals,
      instrumentalPath: instrumental,
      log,
    };
  }
}
