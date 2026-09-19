import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { assertTextLength, MAX_TTS_CHARS } from "@sarupak/dubbing-core";
import { promises as fs } from "node:fs";
import path from "node:path";
import { FfmpegService } from "../ffmpeg/ffmpeg.service";
import {
  SotakaGradioClient,
  type FetchLike,
} from "../sotaka/sotaka-gradio.client";
import type { TTSCapabilities, TTSInput, TTSProvider, TTSResult } from "./tts.types";

/** ~5 chunks × 280 chars — one ZeroGPU Speak session on SOTAKA. */
export const SOTAKA_BATCH_CHARS = 1400;

export const SOTAKA_VOICES = [
  {
    id: "sotaka_male",
    name: "SOTAKA Male (KM clone)",
    genderLabel: "male",
    instruct: "A calm adult Khmer male voice, clear and natural",
  },
  {
    id: "sotaka_female",
    name: "SOTAKA Female (KM clone)",
    genderLabel: "female",
    instruct: "A calm adult Khmer female voice, clear and natural",
  },
] as const;

export type SotakaVoiceId = (typeof SOTAKA_VOICES)[number]["id"];

function splitForSotaka(text: string, maxChars = SOTAKA_BATCH_CHARS): string[] {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length <= maxChars) return [cleaned];
  const pieces = cleaned.split(/(?<=[។!?.…])\s+|\n+/);
  const chunks: string[] = [];
  let buf = "";
  for (const raw of pieces) {
    const p = raw.trim();
    if (!p) continue;
    if (p.length > maxChars) {
      if (buf) {
        chunks.push(buf.trim());
        buf = "";
      }
      for (let i = 0; i < p.length; i += maxChars) {
        chunks.push(p.slice(i, i + maxChars).trim());
      }
      continue;
    }
    if (!buf) buf = p;
    else if (buf.length + 1 + p.length <= maxChars) buf = `${buf} ${p}`;
    else {
      chunks.push(buf.trim());
      buf = p;
    }
  }
  if (buf.trim()) chunks.push(buf.trim());
  return chunks.filter(Boolean);
}

/**
 * Khmer (and multilingual) TTS via SOTAKA HF Space (VoxCPM2 Speak).
 * Optional ≤12s reference wav for voice clone.
 */
@Injectable()
export class SotakaTtsProvider implements TTSProvider {
  readonly name = "sotaka-tts";
  private readonly logger = new Logger(SotakaTtsProvider.name);
  private fetchImpl: FetchLike;

  constructor(
    private readonly config: ConfigService,
    private readonly ffmpeg: FfmpegService,
  ) {
    this.fetchImpl = fetch;
  }

  setFetch(fetchImpl: FetchLike) {
    this.fetchImpl = fetchImpl;
  }

  spaceUrl(): string | undefined {
    const url = (
      this.config.get<string>("SOTAKA_VOICE_URL") ??
      this.config.get<string>("SOTAKA_SPACE_URL") ??
      ""
    ).trim();
    return url || undefined;
  }

  async isAvailable(): Promise<boolean> {
    return Boolean(this.spaceUrl());
  }

  private client(): SotakaGradioClient {
    const base = this.spaceUrl();
    if (!base) {
      throw new Error(
        "not_configured: SOTAKA_VOICE_URL is missing. Set it to your SOTAKA HF Space URL.",
      );
    }
    const token =
      this.config.get<string>("HF_TOKEN") ??
      this.config.get<string>("HUGGINGFACE_TOKEN");
    return new SotakaGradioClient({
      baseUrl: base,
      token: token?.trim() || undefined,
      fetchImpl: this.fetchImpl,
      timeoutMs: Number(this.config.get("SOTAKA_TIMEOUT_MS") ?? 600_000),
    });
  }

  async getCapabilities(language?: string): Promise<TTSCapabilities> {
    const available = await this.isAvailable();
    const lang = (language ?? "km").toLowerCase();
    let state: TTSCapabilities["state"] = available
      ? "configured"
      : "not_configured";
    // Prefer km; still allow en text through the same clone path.
    if (available && lang !== "km" && lang !== "en") {
      state = "unsupported_language";
    }
    return {
      provider: this.name,
      available,
      state,
      languages: ["km", "en"],
      voices: SOTAKA_VOICES.map((v) => v.id),
      voiceDetails: SOTAKA_VOICES.map((v) => ({
        id: v.id,
        name: v.name,
        genderLabel: v.genderLabel,
        languages: ["km", "en"],
      })),
      outputFormats: ["wav"],
      isMock: false,
      maxChars: MAX_TTS_CHARS,
      notes: available
        ? [
            "SOTAKA Speak (VoxCPM2) via Hugging Face Space.",
            "Reference clone: clear speech ≤12s (not a full song).",
            "Long cues are split into ZeroGPU-sized batches (~1400 chars).",
          ]
        : [
            "SOTAKA_VOICE_URL not set — SOTAKA TTS is not configured.",
            "Example: https://kalapak-sotaka-voice-ai.hf.space",
          ],
      apiKeyConfigured: available,
    };
  }

  private resolveInstruct(voiceId: string, override?: string): string {
    if (override?.trim()) return override.trim();
    const found = SOTAKA_VOICES.find((v) => v.id === voiceId);
    return found?.instruct ?? "A clear natural Khmer voice";
  }

  async synthesize(input: TTSInput): Promise<TTSResult> {
    assertTextLength(input.text);
    if (!(await this.isAvailable())) {
      throw new Error(
        "not_configured: SOTAKA_VOICE_URL is missing. Select another provider or configure SOTAKA.",
      );
    }

    const lang = input.language.toLowerCase();
    if (lang !== "km" && lang !== "en") {
      throw new Error(
        `unsupported_language: SOTAKA TTS allows "km" or "en" (got "${input.language}").`,
      );
    }

    const voiceOk = SOTAKA_VOICES.some((v) => v.id === input.voiceId);
    if (!voiceOk) {
      throw new Error(
        `Invalid SOTAKA voice id "${input.voiceId}". Allowed: ${SOTAKA_VOICES.map((v) => v.id).join(", ")}`,
      );
    }

    if (!path.isAbsolute(input.outputPath) || input.outputPath.includes("\0")) {
      throw new Error("Invalid TTS output path.");
    }

    if (input.referenceAudioPath) {
      try {
        const st = await fs.stat(input.referenceAudioPath);
        if (!st.isFile() || st.size < 64) {
          throw new Error("Reference audio missing or empty.");
        }
      } catch (err) {
        throw new Error(
          `provider_error: Invalid SOTAKA reference audio (${err instanceof Error ? err.message : "stat failed"}).`,
        );
      }
    }

    const client = this.client();
    const instruct = this.resolveInstruct(input.voiceId, input.instruct);
    const batches = splitForSotaka(input.text);
    const warnings: string[] = [];
    if (batches.length > 1) {
      warnings.push(
        `Text split into ${batches.length} SOTAKA Speak batches (ZeroGPU session limit).`,
      );
    }

    const workDir = path.dirname(input.outputPath);
    await fs.mkdir(workDir, { recursive: true });
    const partPaths: string[] = [];

    try {
      for (let i = 0; i < batches.length; i++) {
        const part = path.join(workDir, `sotaka_part_${i}.wav`);
        this.logger.log(
          `SOTAKA Speak batch ${i + 1}/${batches.length} (${batches[i]!.length} chars)`,
        );
        const result = await client.speak({
          text: batches[i]!,
          instruct,
          refAudioLocalPath: input.referenceAudioPath,
          refText: input.referenceText,
          outputPath: part,
        });
        if (result.log) warnings.push(result.log.split("\n")[0]!.slice(0, 200));
        partPaths.push(part);
      }

      if (partPaths.length === 1) {
        await fs.copyFile(partPaths[0]!, input.outputPath);
      } else {
        await this.ffmpeg.concatAudioWavs(partPaths, input.outputPath, 48000);
      }

      const probe = await this.ffmpeg.probeAudio(input.outputPath);
      if (!probe.hasAudio || !probe.durationMs || probe.durationMs < 20) {
        throw new Error(
          "provider_error: SOTAKA Speak output failed ffprobe validation.",
        );
      }

      return {
        provider: this.name,
        outputPath: input.outputPath,
        durationMs: probe.durationMs,
        sampleRate: probe.sampleRate,
        channels: probe.channels,
        codec: probe.codec,
        isMock: false,
        warnings,
      };
    } catch (err) {
      if (
        err instanceof Error &&
        (err.message.startsWith("not_configured") ||
          err.message.startsWith("unsupported_language") ||
          err.message.startsWith("provider_error") ||
          err.message.startsWith("Invalid"))
      ) {
        throw err;
      }
      this.logger.warn(
        `SOTAKA Speak failed: ${err instanceof Error ? err.message : "error"}`,
      );
      throw new Error(
        `provider_error: SOTAKA Speak failed (${err instanceof Error ? err.message : "unknown"}).`,
      );
    } finally {
      for (const p of partPaths) {
        await fs.unlink(p).catch(() => undefined);
      }
    }
  }

}
