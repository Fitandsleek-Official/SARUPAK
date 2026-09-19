import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { promises as fs } from "node:fs";
import { newSegmentId } from "@sarupak/subtitle-utils";
import type {
  SpeechToTextProvider,
  SttTranscribeInput,
  SttTranscribeResult,
} from "./stt.types";

/**
 * OpenAI Whisper API adapter (integration boundary).
 * Requires OPENAI_API_KEY. Does not invent Khmer quality claims.
 */
@Injectable()
export class OpenAiWhisperSttProvider implements SpeechToTextProvider {
  readonly name = "openai-whisper";
  private readonly logger = new Logger(OpenAiWhisperSttProvider.name);

  constructor(private readonly config: ConfigService) {}

  async isAvailable(): Promise<boolean> {
    const key = this.config.get<string>("OPENAI_API_KEY");
    return Boolean(key && key.trim().length > 0);
  }

  async transcribe(input: SttTranscribeInput): Promise<SttTranscribeResult> {
    const apiKey = this.config.get<string>("OPENAI_API_KEY");
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY is not configured.");
    }
    const base =
      this.config.get<string>("OPENAI_BASE_URL")?.replace(/\/$/, "") ??
      "https://api.openai.com/v1";
    const model =
      this.config.get<string>("OPENAI_WHISPER_MODEL") ?? "whisper-1";

    const audio = await fs.readFile(input.audioPath);
    const form = new FormData();
    form.append(
      "file",
      new Blob([new Uint8Array(audio)], { type: "audio/wav" }),
      "audio.wav",
    );
    form.append("model", model);
    form.append("response_format", "verbose_json");
    if (input.language) {
      form.append("language", input.language);
    }

    const res = await fetch(`${base}/audio/transcriptions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });
    if (!res.ok) {
      const body = await res.text();
      this.logger.error(`OpenAI Whisper failed: ${res.status} ${body}`);
      throw new Error(`OpenAI Whisper failed (${res.status}).`);
    }

    const json = (await res.json()) as {
      text?: string;
      language?: string;
      segments?: Array<{ start?: number; end?: number; text?: string }>;
    };

    const segments =
      json.segments?.map((s) => ({
        id: newSegmentId(),
        startMs: Math.round((s.start ?? 0) * 1000),
        endMs: Math.round((s.end ?? 0) * 1000),
        text: (s.text ?? "").trim(),
      })) ??
      (json.text
        ? [
            {
              id: newSegmentId(),
              startMs: 0,
              endMs: 3000,
              text: json.text.trim(),
            },
          ]
        : []);

    const usable = segments.filter((s) => s.endMs > s.startMs && s.text);
    return {
      provider: this.name,
      language: json.language ?? input.language ?? "unknown",
      segments: usable,
      transcribed: true,
      warnings:
        usable.length === 0
          ? ["No speech detected by OpenAI Whisper."]
          : [],
    };
  }
}
