import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { newSegmentId } from "@sarupak/subtitle-utils";
import type {
  SpeechToTextProvider,
  SttTranscribeInput,
  SttTranscribeResult,
} from "./stt.types";

/**
 * Deterministic provider for tests. Does not claim real ASR.
 * Enabled when STT_PROVIDER=mock.
 */
@Injectable()
export class MockSttProvider implements SpeechToTextProvider {
  readonly name = "mock";

  constructor(private readonly config: ConfigService) {}

  async isAvailable(): Promise<boolean> {
    return (this.config.get<string>("STT_PROVIDER") ?? "").toLowerCase() === "mock";
  }

  async transcribe(input: SttTranscribeInput): Promise<SttTranscribeResult> {
    const language = input.language ?? "en";
    return {
      provider: this.name,
      language,
      transcribed: true,
      warnings: ["Mock STT provider — for automated tests only."],
      segments: [
        {
          id: newSegmentId(),
          startMs: 0,
          endMs: 1000,
          text: language.startsWith("km") ? "សួស្តី" : "Hello",
        },
        {
          id: newSegmentId(),
          startMs: 1100,
          endMs: 2200,
          text: language.startsWith("km") ? "នេះជាការសាកល្បង" : "This is a test",
        },
      ],
    };
  }
}
