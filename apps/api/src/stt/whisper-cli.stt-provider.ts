import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { newSegmentId, parseSrt } from "@sarupak/subtitle-utils";
import type {
  SpeechToTextProvider,
  SttTranscribeInput,
  SttTranscribeResult,
} from "./stt.types";

/**
 * Local OpenAI-whisper Python CLI adapter (`whisper` command).
 * Optional — only used when binary is present.
 */
@Injectable()
export class WhisperCliSttProvider implements SpeechToTextProvider {
  readonly name = "whisper-cli";
  private readonly logger = new Logger(WhisperCliSttProvider.name);
  private readonly bin: string;

  constructor(private readonly config: ConfigService) {
    this.bin = config.get<string>("WHISPER_CLI_PATH") ?? "whisper";
  }

  async isAvailable(): Promise<boolean> {
    return new Promise((resolve) => {
      const child = spawn(this.bin, ["--help"], {
        stdio: ["ignore", "ignore", "ignore"],
      });
      child.on("error", () => resolve(false));
      child.on("close", (code) => resolve(code === 0 || code === 1));
    });
  }

  async transcribe(input: SttTranscribeInput): Promise<SttTranscribeResult> {
    const outDir = path.join(
      path.dirname(input.audioPath),
      `whisper_${Date.now()}`,
    );
    await fs.mkdir(outDir, { recursive: true });
    const args = [
      input.audioPath,
      "--model",
      this.config.get<string>("WHISPER_MODEL") ?? "base",
      "--output_format",
      "srt",
      "--output_dir",
      outDir,
    ];
    if (input.language) {
      args.push("--language", input.language);
    }

    await new Promise<void>((resolve, reject) => {
      const child = spawn(this.bin, args, { stdio: ["ignore", "ignore", "pipe"] });
      let stderr = "";
      child.stderr.on("data", (c: Buffer) => {
        stderr += c.toString();
      });
      child.on("error", reject);
      child.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`whisper CLI failed: ${stderr.slice(-400)}`));
      });
    });

    const files = await fs.readdir(outDir);
    const srtName = files.find((f) => f.endsWith(".srt"));
    if (!srtName) {
      await fs.rm(outDir, { recursive: true, force: true });
      return {
        provider: this.name,
        language: input.language ?? "unknown",
        segments: [],
        transcribed: true,
        warnings: ["Whisper CLI produced no SRT (no speech?)."],
      };
    }
    const srt = await fs.readFile(path.join(outDir, srtName), "utf8");
    await fs.rm(outDir, { recursive: true, force: true });
    const segments = parseSrt(srt).map((s) => ({
      ...s,
      id: newSegmentId(),
    }));
    this.logger.log(`Whisper CLI returned ${segments.length} segments`);
    return {
      provider: this.name,
      language: input.language ?? "unknown",
      segments,
      transcribed: true,
      warnings: [],
    };
  }
}
