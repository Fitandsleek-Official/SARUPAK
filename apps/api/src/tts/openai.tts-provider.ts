import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { assertTextLength, MAX_TTS_CHARS } from "@sarupak/dubbing-core";
import { promises as fs } from "node:fs";
import path from "node:path";
import { FfmpegService } from "../ffmpeg/ffmpeg.service";
import type { TTSCapabilities, TTSInput, TTSProvider, TTSResult } from "./tts.types";

const OPENAI_VOICES = [
  "alloy",
  "echo",
  "fable",
  "onyx",
  "nova",
  "shimmer",
] as const;

export type FetchLike = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

/**
 * Real OpenAI TTS adapter. Only available when OPENAI_API_KEY is set.
 * Khmer is intentionally unsupported until live-verified.
 */
@Injectable()
export class OpenAiTtsProvider implements TTSProvider {
  readonly name = "openai-tts";
  private readonly logger = new Logger(OpenAiTtsProvider.name);
  private fetchImpl: FetchLike;

  constructor(
    private readonly config: ConfigService,
    private readonly ffmpeg: FfmpegService,
    fetchImpl?: FetchLike,
  ) {
    this.fetchImpl = fetchImpl ?? fetch;
  }

  /** Test-only: swap fetch implementation. */
  setFetch(fetchImpl: FetchLike) {
    this.fetchImpl = fetchImpl;
  }

  private apiKey(): string | undefined {
    const key = this.config.get<string>("OPENAI_API_KEY");
    return key?.trim() || undefined;
  }

  async isAvailable(): Promise<boolean> {
    return Boolean(this.apiKey());
  }

  async getCapabilities(language?: string): Promise<TTSCapabilities> {
    const available = await this.isAvailable();
    const lang = (language ?? "en").toLowerCase();
    let state: TTSCapabilities["state"] = available
      ? "configured"
      : "not_configured";
    if (available && lang === "km") {
      state = "unsupported_language";
    }
    return {
      provider: this.name,
      available,
      state,
      // Only claim languages we are willing to serve. Khmer omitted until verified.
      languages: ["en"],
      voices: [...OPENAI_VOICES],
      voiceDetails: OPENAI_VOICES.map((id) => ({
        id,
        name: id.charAt(0).toUpperCase() + id.slice(1),
        languages: ["en"],
      })),
      outputFormats: ["wav", "mp3"],
      isMock: false,
      maxChars: MAX_TTS_CHARS,
      notes: available
        ? [
            "OpenAI TTS is configured (API key present; key never exposed to clients).",
            "Khmer is not claimed supported until live-tested with Khmer text/audio.",
          ]
        : [
            "OPENAI_API_KEY not set — OpenAI TTS is not configured.",
            "Set OPENAI_API_KEY and select provider openai-tts explicitly.",
          ],
      apiKeyConfigured: available,
    };
  }

  async synthesize(input: TTSInput): Promise<TTSResult> {
    assertTextLength(input.text);
    const key = this.apiKey();
    if (!key) {
      throw new Error(
        "OpenAI TTS not_configured: OPENAI_API_KEY is missing. Select mock explicitly for tests, or configure a key.",
      );
    }

    const lang = input.language.toLowerCase();
    if (lang === "km") {
      throw new Error(
        "unsupported_language: Khmer TTS is not verified with OpenAI TTS in this project. Do not claim Khmer support.",
      );
    }
    if (lang !== "en") {
      throw new Error(
        `unsupported_language: OpenAI TTS adapter currently allows "en" only (got "${input.language}").`,
      );
    }

    if (!(OPENAI_VOICES as readonly string[]).includes(input.voiceId)) {
      throw new Error(
        `Invalid OpenAI voice id "${input.voiceId}". Allowed: ${OPENAI_VOICES.join(", ")}`,
      );
    }

    if (!path.isAbsolute(input.outputPath) || input.outputPath.includes("\0")) {
      throw new Error("Invalid TTS output path.");
    }

    const baseUrl = (
      this.config.get<string>("OPENAI_BASE_URL") ?? "https://api.openai.com/v1"
    ).replace(/\/$/, "");
    const model =
      this.config.get<string>("OPENAI_TTS_MODEL") ?? "gpt-4o-mini-tts";
    const format = input.outputFormat === "mp3" ? "mp3" : "wav";
    const warnings: string[] = [];

    let res: Response;
    try {
      res = await this.fetchImpl(`${baseUrl}/audio/speech`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          voice: input.voiceId,
          input: input.text,
          response_format: format,
          speed: Math.min(1.35, Math.max(0.75, input.speakingRate)),
        }),
      });
    } catch (err) {
      this.logger.warn("OpenAI TTS network error");
      throw new Error(
        `provider_error: OpenAI TTS request failed (${err instanceof Error ? err.message : "network"})`,
      );
    }

    if (!res.ok) {
      // Do not log response bodies that might echo secrets; keep message short.
      this.logger.warn(`OpenAI TTS HTTP ${res.status}`);
      throw new Error(`provider_error: OpenAI TTS failed (HTTP ${res.status}).`);
    }

    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 64) {
      throw new Error("provider_error: OpenAI TTS returned empty audio.");
    }

    await fs.mkdir(path.dirname(input.outputPath), { recursive: true });
    const rawPath =
      format === "wav"
        ? input.outputPath
        : input.outputPath.replace(/\.wav$/i, "") + ".mp3";
    await fs.writeFile(rawPath, buf);

    if (rawPath !== input.outputPath) {
      await this.ffmpeg.reencodeToWav(rawPath, input.outputPath, 24000);
      await fs.unlink(rawPath).catch(() => undefined);
    }

    const probe = await this.ffmpeg.probeAudio(input.outputPath);
    if (!probe.hasAudio || !probe.durationMs || probe.durationMs < 20) {
      throw new Error(
        "provider_error: OpenAI TTS output failed ffprobe validation.",
      );
    }

    if (Math.abs(input.pitch) > 0.01) {
      warnings.push(
        "Pitch metadata noted; OpenAI TTS pitch shaping is limited.",
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
  }
}
