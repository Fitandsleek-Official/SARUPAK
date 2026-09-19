import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  SotakaGradioClient,
  type FetchLike,
} from "../sotaka/sotaka-gradio.client";
import type {
  AudioSeparationProvider,
  SeparationInput,
  SeparationResult,
} from "./separation.types";

/**
 * SOTAKA Vocal Remover (Demucs on HF ZeroGPU) —
 * vocals = dialogue stem, instrumental = music/BGM stem.
 */
@Injectable()
export class SotakaSeparationProvider implements AudioSeparationProvider {
  readonly name = "sotaka";
  private readonly logger = new Logger(SotakaSeparationProvider.name);
  private fetchImpl: FetchLike;

  constructor(private readonly config: ConfigService) {
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
      throw new Error("SOTAKA_VOICE_URL is not configured.");
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

  async separate(input: SeparationInput): Promise<SeparationResult> {
    if (!(await this.isAvailable())) {
      return {
        provider: this.name,
        available: false,
        stems: [],
        warning: "SOTAKA Vocal Remover is not configured (SOTAKA_VOICE_URL).",
      };
    }

    const vocalsOut = path.join(input.workDir, "sotaka_vocals.wav");
    const instOut = path.join(input.workDir, "sotaka_instrumental.wav");

    try {
      const result = await this.client().separateVocals({
        audioLocalPath: input.audioPath,
        vocalsOutPath: vocalsOut,
        instrumentalOutPath: instOut,
      });

      const hasVocals = Boolean(
        result.vocalsPath && (await fs.stat(result.vocalsPath)).size > 64,
      );
      const hasInst = Boolean(
        result.instrumentalPath &&
          (await fs.stat(result.instrumentalPath)).size > 64,
      );

      if (!hasVocals && !hasInst) {
        return {
          provider: this.name,
          available: false,
          stems: [],
          warning: result.log || "SOTAKA Vocal Remover returned empty stems.",
        };
      }

      return {
        provider: this.name,
        available: true,
        stems: [
          {
            kind: "dialogue",
            path: hasVocals ? result.vocalsPath! : undefined,
            available: hasVocals,
            note: hasVocals
              ? "SOTAKA vocals stem (original dialogue)."
              : "Vocals stem missing.",
          },
          {
            kind: "music",
            path: hasInst ? result.instrumentalPath! : undefined,
            available: hasInst,
            note: hasInst
              ? "SOTAKA instrumental stem (BGM / keep for mix)."
              : "Instrumental stem missing.",
          },
          {
            kind: "sfx",
            available: false,
            note: "Not isolated separately (folded into instrumental).",
          },
          {
            kind: "ambient",
            available: false,
          },
        ],
        warning: hasInst
          ? undefined
          : "Instrumental stem unavailable — mix may keep full original audio.",
      };
    } catch (err) {
      this.logger.warn(
        `SOTAKA separate failed: ${err instanceof Error ? err.message : "error"}`,
      );
      return {
        provider: this.name,
        available: false,
        stems: [],
        warning: `SOTAKA Vocal Remover failed: ${err instanceof Error ? err.message : "unknown"}`,
      };
    }
  }
}
