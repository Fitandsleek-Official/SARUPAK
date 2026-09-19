import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { TimelineDocumentV1 } from "@sarupak/shared-types";
import { computeTimelineDurationMs } from "@sarupak/editor-core";

export interface ProbeResult {
  durationMs: number | null;
  width: number | null;
  height: number | null;
}

export interface AudioProbeResult {
  hasAudio: boolean;
  durationMs: number | null;
  sampleRate: number | null;
  channels: number | null;
  codec: string | null;
}

export interface RenderInput {
  timeline: TimelineDocumentV1;
  width: number;
  height: number;
  frameRate: number;
  /** Map mediaAssetId -> absolute file path */
  mediaPaths: Record<string, string>;
  outputPath: string;
  onProgress?: (ratio: number) => void;
}

export interface DubMixSegment {
  path: string;
  startMs: number;
  volume?: number;
}

export interface DubMixInput {
  videoPath: string;
  /** Full original / background audio (optional for dialogue_only). */
  backgroundAudioPath?: string;
  dialogueSegments: DubMixSegment[];
  mode: "replace_dialogue" | "mix" | "dialogue_only" | "original_only";
  dialogueVolume: number;
  backgroundVolume: number;
  outputPath: string;
  /** Total timeline duration for padding (ms). */
  durationMs: number;
}

@Injectable()
export class FfmpegService {
  private readonly logger = new Logger(FfmpegService.name);
  private readonly ffmpegBin: string;
  private readonly ffprobeBin: string;

  constructor(config: ConfigService) {
    this.ffmpegBin = this.assertBinaryName(
      config.get<string>("FFMPEG_PATH") ?? "ffmpeg",
    );
    this.ffprobeBin = this.assertBinaryName(
      config.get<string>("FFPROBE_PATH") ?? "ffprobe",
    );
  }

  /** Reject shell metacharacters / path tricks in binary names. */
  private assertBinaryName(bin: string): string {
    if (!/^[A-Za-z0-9._/\\-]+$/.test(bin)) {
      throw new Error(`Unsafe FFmpeg binary path: ${bin}`);
    }
    return bin;
  }

  /** Paths are passed as spawn argv entries — never shell-interpolated. */
  private assertSafeMediaPath(filePath: string): string {
    if (!filePath || filePath.includes("\0")) {
      throw new Error("Invalid media path.");
    }
    if (!path.isAbsolute(filePath)) {
      throw new Error("Media path must be absolute.");
    }
    return filePath;
  }

  private assertPositiveNumber(value: number, label: string, max = 1_000_000): number {
    if (!Number.isFinite(value) || value <= 0 || value > max) {
      throw new Error(`Invalid ${label}: ${value}`);
    }
    return value;
  }

  async probe(filePath: string): Promise<ProbeResult> {
    const safePath = this.assertSafeMediaPath(filePath);
    const args = [
      "-v",
      "quiet",
      "-print_format",
      "json",
      "-show_format",
      "-show_streams",
      safePath,
    ];
    const raw = await this.runCapture(this.ffprobeBin, args);
    const json = JSON.parse(raw) as {
      format?: { duration?: string };
      streams?: Array<{
        codec_type?: string;
        width?: number;
        height?: number;
        duration?: string;
      }>;
    };

    const video = json.streams?.find((s) => s.codec_type === "video");
    const durationSec = Number(
      json.format?.duration ?? video?.duration ?? NaN,
    );
    return {
      durationMs: Number.isFinite(durationSec)
        ? Math.round(durationSec * 1000)
        : null,
      width: video?.width ?? null,
      height: video?.height ?? null,
    };
  }

  async probeAudio(filePath: string): Promise<AudioProbeResult> {
    const safePath = this.assertSafeMediaPath(filePath);
    const raw = await this.runCapture(this.ffprobeBin, [
      "-v",
      "quiet",
      "-print_format",
      "json",
      "-show_format",
      "-show_streams",
      safePath,
    ]);
    const json = JSON.parse(raw) as {
      format?: { duration?: string };
      streams?: Array<{
        codec_type?: string;
        codec_name?: string;
        sample_rate?: string;
        channels?: number;
        duration?: string;
      }>;
    };
    const audio = json.streams?.find((s) => s.codec_type === "audio");
    if (!audio) {
      return {
        hasAudio: false,
        durationMs: null,
        sampleRate: null,
        channels: null,
        codec: null,
      };
    }
    const durationSec = Number(
      json.format?.duration ?? audio.duration ?? NaN,
    );
    return {
      hasAudio: true,
      durationMs: Number.isFinite(durationSec)
        ? Math.round(durationSec * 1000)
        : null,
      sampleRate: audio.sample_rate ? Number(audio.sample_rate) : null,
      channels: audio.channels ?? null,
      codec: audio.codec_name ?? null,
    };
  }

  /**
   * Extract mono 16kHz PCM WAV. Throws if source has no audio stream.
   * Never trusts user-supplied FFmpeg filter strings.
   */
  async extractAudioValidated(
    inputPath: string,
    outputWavPath: string,
    options?: { expectDurationMs?: number; toleranceMs?: number },
  ): Promise<AudioProbeResult> {
    const safeIn = this.assertSafeMediaPath(inputPath);
    const probe = await this.probeAudio(safeIn);
    if (!probe.hasAudio) {
      throw new Error("Source media has no audio stream.");
    }
    await fs.mkdir(path.dirname(outputWavPath), { recursive: true });
    await this.run(this.ffmpegBin, [
      "-y",
      "-i",
      safeIn,
      "-vn",
      "-ac",
      "1",
      "-ar",
      "16000",
      "-c:a",
      "pcm_s16le",
      outputWavPath,
    ]);
    this.assertSafeMediaPath(outputWavPath);
    const out = await this.probeAudio(outputWavPath);
    if (!out.hasAudio || !out.durationMs) {
      throw new Error("Extracted audio is missing or empty.");
    }
    if (out.sampleRate !== 16000) {
      throw new Error(`Unexpected sample rate: ${out.sampleRate}`);
    }
    if (out.channels !== 1) {
      throw new Error(`Unexpected channel count: ${out.channels}`);
    }
    if (options?.expectDurationMs != null) {
      const tol = options.toleranceMs ?? 500;
      if (Math.abs(out.durationMs - options.expectDurationMs) > tol) {
        throw new Error(
          `Duration mismatch: extracted ${out.durationMs}ms vs expected ${options.expectDurationMs}ms`,
        );
      }
    }
    return out;
  }

  /**
   * Generate a playable tone WAV for mock TTS (not speech).
   * Duration is clamped; frequency derived from voice id hash.
   */
  async synthesizeToneWav(input: {
    outputPath: string;
    durationMs: number;
    frequencyHz: number;
  }): Promise<AudioProbeResult> {
    const durSec = Math.max(0.05, Math.min(60, input.durationMs / 1000));
    const freq = Math.max(110, Math.min(880, Math.round(input.frequencyHz)));
    await fs.mkdir(path.dirname(input.outputPath), { recursive: true });
    await this.run(this.ffmpegBin, [
      "-y",
      "-f",
      "lavfi",
      "-i",
      `sine=frequency=${freq}:sample_rate=24000:duration=${durSec.toFixed(3)}`,
      "-ac",
      "1",
      "-c:a",
      "pcm_s16le",
      input.outputPath,
    ]);
    return this.probeAudio(input.outputPath);
  }

  /** Time-stretch audio within safe bounds using atempo (0.5–2.0 chained). */
  async adjustAudioTempo(
    inputPath: string,
    outputPath: string,
    rate: number,
  ): Promise<void> {
    const safeIn = this.assertSafeMediaPath(inputPath);
    let r = Math.min(2, Math.max(0.5, rate));
    const filters: string[] = [];
    // atempo only accepts 0.5–2.0; chain if needed
    while (r > 2.0 + 1e-6) {
      filters.push("atempo=2.0");
      r /= 2;
    }
    while (r < 0.5 - 1e-6) {
      filters.push("atempo=0.5");
      r /= 0.5;
    }
    filters.push(`atempo=${r.toFixed(4)}`);
    await this.run(this.ffmpegBin, [
      "-y",
      "-i",
      safeIn,
      "-filter:a",
      filters.join(","),
      "-c:a",
      "pcm_s16le",
      outputPath,
    ]);
  }

  /**
   * Mix dubbed dialogue onto video with background/original according to mode.
   * All paths via argv; volumes clamped.
   */
  async mixDubbing(input: DubMixInput): Promise<void> {
    const videoPath = this.assertSafeMediaPath(input.videoPath);
    this.assertSafeMediaPath(input.outputPath);
    const dialogueVol = Math.min(2, Math.max(0, input.dialogueVolume));
    const bgVol = Math.min(2, Math.max(0, input.backgroundVolume));
    const durationSec = Math.max(0.1, input.durationMs / 1000);

    if (input.mode === "original_only") {
      await this.run(this.ffmpegBin, [
        "-y",
        "-i",
        videoPath,
        "-c",
        "copy",
        "-movflags",
        "+faststart",
        input.outputPath,
      ]);
      return;
    }

    const workDir = path.join(
      path.dirname(input.outputPath),
      `dubmix_${Date.now()}`,
    );
    await fs.mkdir(workDir, { recursive: true });

    try {
      const dialogueTrack = path.join(workDir, "dialogue.wav");
      await this.buildDialogueBed(
        input.dialogueSegments,
        input.durationMs,
        dialogueVol,
        dialogueTrack,
      );

      if (input.mode === "dialogue_only") {
        await this.run(this.ffmpegBin, [
          "-y",
          "-i",
          videoPath,
          "-i",
          dialogueTrack,
          "-map",
          "0:v:0",
          "-map",
          "1:a:0",
          "-c:v",
          "copy",
          "-c:a",
          "aac",
          "-shortest",
          "-movflags",
          "+faststart",
          input.outputPath,
        ]);
        return;
      }

      const bgPath =
        input.backgroundAudioPath ??
        (await this.extractTempAudio(videoPath, workDir));
      this.assertSafeMediaPath(bgPath);

      // Mix background + dialogue with soft limiter
      const mixed = path.join(workDir, "mixed.wav");
      const bgGain =
        input.mode === "replace_dialogue"
          ? bgVol * 0.35
          : bgVol;
      await this.run(this.ffmpegBin, [
        "-y",
        "-i",
        bgPath,
        "-i",
        dialogueTrack,
        "-filter_complex",
        `[0:a]volume=${bgGain.toFixed(3)}[bg];[1:a]volume=1[dlg];[bg][dlg]amix=inputs=2:duration=longest:dropout_transition=0,alimiter=limit=0.95[aout]`,
        "-map",
        "[aout]",
        "-t",
        durationSec.toFixed(3),
        "-c:a",
        "pcm_s16le",
        mixed,
      ]);

      await this.run(this.ffmpegBin, [
        "-y",
        "-i",
        videoPath,
        "-i",
        mixed,
        "-map",
        "0:v:0",
        "-map",
        "1:a:0",
        "-c:v",
        "copy",
        "-c:a",
        "aac",
        "-shortest",
        "-movflags",
        "+faststart",
        input.outputPath,
      ]);
    } finally {
      await fs.rm(workDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  private async extractTempAudio(
    videoPath: string,
    workDir: string,
  ): Promise<string> {
    const out = path.join(workDir, "bg_from_video.wav");
    await this.run(this.ffmpegBin, [
      "-y",
      "-i",
      videoPath,
      "-vn",
      "-ac",
      "2",
      "-ar",
      "48000",
      "-c:a",
      "pcm_s16le",
      out,
    ]);
    return out;
  }

  private async buildDialogueBed(
    segments: DubMixSegment[],
    durationMs: number,
    dialogueVol: number,
    outputPath: string,
  ): Promise<void> {
    const durationSec = Math.max(0.1, durationMs / 1000);
    if (segments.length === 0) {
      await this.run(this.ffmpegBin, [
        "-y",
        "-f",
        "lavfi",
        "-i",
        `anullsrc=channel_layout=mono:sample_rate=24000`,
        "-t",
        durationSec.toFixed(3),
        "-c:a",
        "pcm_s16le",
        outputPath,
      ]);
      return;
    }

    const args: string[] = ["-y"];
    const filters: string[] = [];
    let idx = 0;
    for (const seg of segments) {
      const p = this.assertSafeMediaPath(seg.path);
      args.push("-i", p);
      const delay = Math.max(0, Math.round(seg.startMs));
      const vol = Math.min(2, Math.max(0, (seg.volume ?? 1) * dialogueVol));
      filters.push(
        `[${idx}:a]volume=${vol.toFixed(3)},adelay=${delay}|${delay},apad,atrim=0:${durationSec.toFixed(3)},asetpts=PTS-STARTPTS[a${idx}]`,
      );
      idx += 1;
    }
    const labels = segments.map((_, i) => `[a${i}]`).join("");
    const filterComplex = `${filters.join(";")};${labels}amix=inputs=${segments.length}:duration=longest:dropout_transition=0,alimiter=limit=0.95[aout]`;
    await this.run(this.ffmpegBin, [
      ...args,
      "-filter_complex",
      filterComplex,
      "-map",
      "[aout]",
      "-t",
      durationSec.toFixed(3),
      "-c:a",
      "pcm_s16le",
      outputPath,
    ]);
  }

  async renderTimeline(input: RenderInput): Promise<void> {
    const width = Math.round(this.assertPositiveNumber(input.width, "width", 7680));
    const height = Math.round(this.assertPositiveNumber(input.height, "height", 4320));
    const frameRate = this.assertPositiveNumber(input.frameRate, "frameRate", 240);
    this.assertSafeMediaPath(input.outputPath);
    for (const p of Object.values(input.mediaPaths)) {
      this.assertSafeMediaPath(p);
    }

    const durationMs = Math.max(
      1000,
      computeTimelineDurationMs(input.timeline),
    );
    const durationSec = durationMs / 1000;
    const workDir = path.join(
      path.dirname(input.outputPath),
      `work_${Date.now()}`,
    );
    await fs.mkdir(workDir, { recursive: true });

    try {
      const videoTrack = input.timeline.tracks.find(
        (t) => t.kind === "video" && !t.muted,
      );
      const audioTrack = input.timeline.tracks.find(
        (t) => t.kind === "audio" && !t.muted,
      );

      const videoClips = (videoTrack?.clips ?? [])
        .slice()
        .sort((a, b) => a.startMs - b.startMs);
      const audioClips = (audioTrack?.clips ?? [])
        .slice()
        .sort((a, b) => a.startMs - b.startMs);

      const segmentPaths: string[] = [];
      let cursorMs = 0;
      let segIndex = 0;

      const pushBlack = async (ms: number) => {
        if (ms < 40) return;
        const out = path.join(workDir, `seg_${segIndex++}_black.mp4`);
        await this.run(this.ffmpegBin, [
          "-y",
          "-f",
          "lavfi",
          "-i",
          `color=c=black:s=${width}x${height}:r=${frameRate}`,
          "-f",
          "lavfi",
          "-i",
          "anullsrc=channel_layout=stereo:sample_rate=48000",
          "-t",
          (ms / 1000).toFixed(3),
          "-c:v",
          "libx264",
          "-pix_fmt",
          "yuv420p",
          "-c:a",
          "aac",
          "-shortest",
          out,
        ]);
        segmentPaths.push(out);
      };

      for (const clip of videoClips) {
        if (clip.startMs > cursorMs) {
          await pushBlack(clip.startMs - cursorMs);
          cursorMs = clip.startMs;
        }
        const mediaPath = clip.mediaAssetId
          ? input.mediaPaths[clip.mediaAssetId]
          : undefined;
        if (!mediaPath) {
          await pushBlack(clip.durationMs);
          cursorMs = clip.startMs + clip.durationMs;
          continue;
        }

        const out = path.join(workDir, `seg_${segIndex++}_clip.mp4`);
        const trimStart = (Math.max(0, clip.trimInMs) / 1000).toFixed(3);
        const trimDur = (Math.max(1, clip.durationMs) / 1000).toFixed(3);
        const scaleFilter = `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,fps=${frameRate}`;
        await this.run(this.ffmpegBin, [
          "-y",
          "-ss",
          trimStart,
          "-t",
          trimDur,
          "-i",
          mediaPath,
          "-f",
          "lavfi",
          "-t",
          trimDur,
          "-i",
          "anullsrc=channel_layout=stereo:sample_rate=48000",
          "-filter_complex",
          `[0:v]${scaleFilter},format=yuv420p[v];[0:a]aresample=48000[a0];[a0][1:a]amix=inputs=2:duration=first:dropout_transition=0[a]`,
          "-map",
          "[v]",
          "-map",
          "[a]",
          "-c:v",
          "libx264",
          "-c:a",
          "aac",
          "-ar",
          "48000",
          "-ac",
          "2",
          out,
        ]).catch(async () => {
          await this.run(this.ffmpegBin, [
            "-y",
            "-ss",
            trimStart,
            "-t",
            trimDur,
            "-i",
            mediaPath,
            "-f",
            "lavfi",
            "-t",
            trimDur,
            "-i",
            "anullsrc=channel_layout=stereo:sample_rate=48000",
            "-vf",
            scaleFilter,
            "-map",
            "0:v:0",
            "-map",
            "1:a:0",
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
            "-shortest",
            out,
          ]);
        });
        segmentPaths.push(out);
        cursorMs = clip.startMs + clip.durationMs;
        input.onProgress?.(Math.min(0.7, cursorMs / durationMs));
      }

      if (cursorMs < durationMs) {
        await pushBlack(durationMs - cursorMs);
      }

      if (segmentPaths.length === 0) {
        await pushBlack(durationMs);
      }
      if (segmentPaths.length === 0) {
        throw new Error("Render produced no segments.");
      }

      const listFile = path.join(workDir, "concat.txt");
      // concat demuxer: quote paths; escape single quotes. Never shell-exec this file.
      await fs.writeFile(
        listFile,
        segmentPaths
          .map((p) => `file '${p.replace(/'/g, "'\\''")}'`)
          .join("\n"),
        "utf8",
      );

      const concatOut = path.join(workDir, "concat.mp4");
      await this.run(this.ffmpegBin, [
        "-y",
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        listFile,
        "-c",
        "copy",
        concatOut,
      ]);
      input.onProgress?.(0.85);

      if (audioClips.length > 0) {
        const audioInputs: string[] = ["-i", concatOut];
        const filters: string[] = [];
        let aIdx = 1;
        for (const clip of audioClips) {
          const mediaPath = clip.mediaAssetId
            ? input.mediaPaths[clip.mediaAssetId]
            : undefined;
          if (!mediaPath) continue;
          audioInputs.push("-i", mediaPath);
          const delay = Math.max(0, Math.round(clip.startMs));
          const start = (Math.max(0, clip.trimInMs) / 1000).toFixed(3);
          const dur = (Math.max(1, clip.durationMs) / 1000).toFixed(3);
          const vol = Math.min(2, Math.max(0, clip.volume ?? 1));
          filters.push(
            `[${aIdx}:a]atrim=start=${start}:duration=${dur},asetpts=PTS-STARTPTS,volume=${vol},adelay=${delay}|${delay}[a${aIdx}]`,
          );
          aIdx += 1;
        }
        if (filters.length > 0) {
          const labels = filters.map((_, i) => `[a${i + 1}]`);
          const filterComplex = [
            ...filters,
            `[0:a]${labels.join("")}amix=inputs=${labels.length + 1}:duration=first:dropout_transition=0[aout]`,
          ].join(";");

          await this.run(this.ffmpegBin, [
            "-y",
            ...audioInputs,
            "-filter_complex",
            filterComplex,
            "-map",
            "0:v",
            "-map",
            "[aout]",
            "-c:v",
            "copy",
            "-c:a",
            "aac",
            "-t",
            durationSec.toFixed(3),
            "-movflags",
            "+faststart",
            input.outputPath,
          ]);
        } else {
          await fs.copyFile(concatOut, input.outputPath);
        }
      } else {
        await this.run(this.ffmpegBin, [
          "-y",
          "-i",
          concatOut,
          "-c",
          "copy",
          "-movflags",
          "+faststart",
          input.outputPath,
        ]);
      }

      input.onProgress?.(1);
    } finally {
      await fs.rm(workDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  async extractAudio(inputPath: string, outputWavPath: string): Promise<void> {
    const safeIn = this.assertSafeMediaPath(inputPath);
    await fs.mkdir(path.dirname(outputWavPath), { recursive: true });
    await this.run(this.ffmpegBin, [
      "-y",
      "-i",
      safeIn,
      "-vn",
      "-ac",
      "1",
      "-ar",
      "16000",
      "-c:a",
      "pcm_s16le",
      outputWavPath,
    ]);
  }

  /** Re-encode any audio/container to mono PCM WAV (e.g. OpenAI mp3 → wav). */
  async reencodeToWav(
    inputPath: string,
    outputWavPath: string,
    sampleRate = 24000,
  ): Promise<AudioProbeResult> {
    const safeIn = this.assertSafeMediaPath(inputPath);
    await fs.mkdir(path.dirname(outputWavPath), { recursive: true });
    await this.run(this.ffmpegBin, [
      "-y",
      "-i",
      safeIn,
      "-vn",
      "-ac",
      "1",
      "-ar",
      String(Math.round(this.assertPositiveNumber(sampleRate, "sampleRate", 192000))),
      "-c:a",
      "pcm_s16le",
      outputWavPath,
    ]);
    return this.probeAudio(outputWavPath);
  }

  /**
   * Detect non-silent regions using FFmpeg silencedetect.
   * Returns speech-ish intervals in milliseconds (not transcription).
   */
  async detectSpeechRegions(
    audioPath: string,
    options?: { silenceDb?: number; minSilenceSec?: number },
  ): Promise<Array<{ startMs: number; endMs: number }>> {
    const silenceDb = options?.silenceDb ?? -30;
    const minSilenceSec = options?.minSilenceSec ?? 0.35;
    const args = [
      "-i",
      audioPath,
      "-af",
      `silencedetect=noise=${silenceDb}dB:d=${minSilenceSec}`,
      "-f",
      "null",
      "-",
    ];
    let stderr = "";
    await new Promise<void>((resolve, reject) => {
      const child = spawn(this.ffmpegBin, args, {
        stdio: ["ignore", "ignore", "pipe"],
      });
      child.stderr.on("data", (c: Buffer) => {
        stderr += c.toString();
      });
      child.on("error", reject);
      child.on("close", () => resolve());
    });

    const probe = await this.probe(audioPath);
    const durationMs = probe.durationMs ?? 0;
    if (durationMs <= 0) return [];

    const silenceStarts: number[] = [];
    const silenceEnds: number[] = [];
    for (const line of stderr.split("\n")) {
      const start = line.match(/silence_start:\s*([0-9.]+)/);
      const end = line.match(/silence_end:\s*([0-9.]+)/);
      if (start) silenceStarts.push(Number(start[1]) * 1000);
      if (end) silenceEnds.push(Number(end[1]) * 1000);
    }

    const silences: Array<{ startMs: number; endMs: number }> = [];
    for (let i = 0; i < Math.min(silenceStarts.length, silenceEnds.length); i++) {
      silences.push({
        startMs: Math.round(silenceStarts[i]!),
        endMs: Math.round(silenceEnds[i]!),
      });
    }
    if (silenceStarts.length > silenceEnds.length) {
      silences.push({
        startMs: Math.round(silenceStarts[silenceEnds.length]!),
        endMs: durationMs,
      });
    }

    const regions: Array<{ startMs: number; endMs: number }> = [];
    let cursor = 0;
    for (const sil of silences.sort((a, b) => a.startMs - b.startMs)) {
      if (sil.startMs - cursor >= 200) {
        regions.push({ startMs: cursor, endMs: sil.startMs });
      }
      cursor = Math.max(cursor, sil.endMs);
    }
    if (durationMs - cursor >= 200) {
      regions.push({ startMs: cursor, endMs: durationMs });
    }

    if (regions.length === 0 && durationMs > 0) {
      regions.push({ startMs: 0, endMs: durationMs });
    }

    return regions;
  }

  async burnInSubtitles(input: {
    videoPath: string;
    outputPath: string;
    overlayPaths: Array<{ path: string; startSec: number; endSec: number }>;
    width: number;
    height: number;
  }): Promise<void> {
    if (input.overlayPaths.length === 0) {
      await this.run(this.ffmpegBin, [
        "-y",
        "-i",
        input.videoPath,
        "-c",
        "copy",
        input.outputPath,
      ]);
      return;
    }

    const args: string[] = ["-y", "-i", input.videoPath];
    for (const overlay of input.overlayPaths) {
      args.push("-i", overlay.path);
    }

    const filters: string[] = [];
    let last = "[0:v]";
    input.overlayPaths.forEach((overlay, i) => {
      const idx = i + 1;
      const out = i === input.overlayPaths.length - 1 ? "[vout]" : `[v${idx}]`;
      const enable = `between(t,${overlay.startSec.toFixed(3)},${overlay.endSec.toFixed(3)})`;
      filters.push(
        `${last}[${idx}:v]overlay=(W-w)/2:H-h-40:enable='${enable}'${out}`,
      );
      last = out;
    });

    await this.run(this.ffmpegBin, [
      ...args,
      "-filter_complex",
      filters.join(";"),
      "-map",
      "[vout]",
      "-map",
      "0:a?",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-movflags",
      "+faststart",
      input.outputPath,
    ]);
  }

  async hasFilter(name: string): Promise<boolean> {
    try {
      const out = await this.runCapture(this.ffmpegBin, [
        "-hide_banner",
        "-filters",
      ]);
      return out.includes(` ${name} `) || out.includes(` ${name}\n`);
    } catch {
      return false;
    }
  }

  private run(bin: string, args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      this.logger.debug(`${bin} ${args.join(" ")}`);
      const child = spawn(bin, args, { stdio: ["ignore", "ignore", "pipe"] });
      let stderr = "";
      child.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString();
        if (stderr.length > 8000) stderr = stderr.slice(-8000);
      });
      child.on("error", (err) => reject(err));
      child.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`${bin} failed (${code}): ${stderr.slice(-500)}`));
      });
    });
  }

  private runCapture(bin: string, args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (c: Buffer) => {
        stdout += c.toString();
      });
      child.stderr.on("data", (c: Buffer) => {
        stderr += c.toString();
      });
      child.on("error", reject);
      child.on("close", (code) => {
        if (code === 0) resolve(stdout);
        else reject(new Error(`${bin} failed (${code}): ${stderr.slice(-500)}`));
      });
    });
  }
}
