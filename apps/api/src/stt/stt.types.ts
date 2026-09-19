import type { SubtitleSegment } from "@sarupak/subtitle-utils";

export interface SttTranscribeInput {
  audioPath: string;
  language?: string;
}

export interface SttTranscribeResult {
  provider: string;
  language: string;
  segments: SubtitleSegment[];
  /** True when text is real ASR; false for timing-only / mock. */
  transcribed: boolean;
  warnings: string[];
}

export interface SpeechToTextProvider {
  readonly name: string;
  isAvailable(): Promise<boolean>;
  transcribe(input: SttTranscribeInput): Promise<SttTranscribeResult>;
}
