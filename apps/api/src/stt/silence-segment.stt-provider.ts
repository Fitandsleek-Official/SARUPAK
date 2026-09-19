import { Injectable } from "@nestjs/common";
import { newSegmentId } from "@sarupak/subtitle-utils";
import { FfmpegService } from "../ffmpeg/ffmpeg.service";
import type {
  SpeechToTextProvider,
  SttTranscribeInput,
  SttTranscribeResult,
} from "./stt.types";

/**
 * Timing-only fallback using FFmpeg silencedetect.
 * Creates empty/placeholder cues for manual editing — NOT speech recognition.
 */
@Injectable()
export class SilenceSegmentSttProvider implements SpeechToTextProvider {
  readonly name = "silence-segments";

  constructor(private readonly ffmpeg: FfmpegService) {}

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async transcribe(input: SttTranscribeInput): Promise<SttTranscribeResult> {
    const regions = await this.ffmpeg.detectSpeechRegions(input.audioPath);
    const language = input.language ?? "und";
    const segments = regions.map((r) => ({
      id: newSegmentId(),
      startMs: r.startMs,
      endMs: r.endMs,
      text: "",
    }));

    return {
      provider: this.name,
      language,
      segments,
      transcribed: false,
      warnings: [
        "No ASR model configured. Speech regions were detected via silence analysis only.",
        "Edit cue text manually, or set OPENAI_API_KEY / install whisper CLI / STT_PROVIDER=mock for tests.",
        "Khmer (and other) recognition quality is unverified until a real ASR provider is configured and tested.",
      ],
    };
  }
}
