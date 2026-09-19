import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type {
  DiarizationInput,
  DiarizationProvider,
  DiarizationResult,
} from "./diarization.types";

/** Tests only — assigns a single speaker. Not accurate identification. */
@Injectable()
export class MockDiarizationProvider implements DiarizationProvider {
  readonly name = "mock";

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async diarize(input: DiarizationInput): Promise<DiarizationResult> {
    const segments =
      input.cues?.map((c) => ({
        startMs: c.startMs,
        endMs: c.endMs,
        speakerId: "speaker_1",
      })) ?? [];
    return {
      provider: this.name,
      available: true,
      isMock: true,
      speakers: [{ speakerId: "speaker_1", displayName: "Speaker 1 (mock)" }],
      segments,
      warning:
        "Mock diarization assigns a single speaker. Not accurate speaker identification.",
    };
  }
}

@Injectable()
export class ManualDiarizationProvider implements DiarizationProvider {
  readonly name = "manual";

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async diarize(input: DiarizationInput): Promise<DiarizationResult> {
    return {
      provider: this.name,
      available: true,
      isMock: false,
      speakers: [{ speakerId: "speaker_1", displayName: "Speaker 1" }],
      segments:
        input.cues?.map((c) => ({
          startMs: c.startMs,
          endMs: c.endMs,
          speakerId: "speaker_1",
        })) ?? [],
      warning: "Manual mode — assign speakers in the UI. No auto diarization ran.",
    };
  }
}

@Injectable()
export class UnavailableDiarizationProvider implements DiarizationProvider {
  readonly name = "unavailable";

  async isAvailable(): Promise<boolean> {
    return false;
  }

  async diarize(_input: DiarizationInput): Promise<DiarizationResult> {
    return {
      provider: this.name,
      available: false,
      isMock: false,
      speakers: [],
      segments: [],
      warning: "Diarization provider unavailable.",
    };
  }
}

@Injectable()
export class DiarizationService {
  constructor(
    private readonly config: ConfigService,
    private readonly mock: MockDiarizationProvider,
    private readonly manual: ManualDiarizationProvider,
    private readonly unavailable: UnavailableDiarizationProvider,
  ) {}

  async resolve(): Promise<DiarizationProvider> {
    const forced = (this.config.get<string>("DIARIZATION_PROVIDER") ?? "")
      .trim()
      .toLowerCase();
    if (forced === "mock") return this.mock;
    if (forced === "unavailable") return this.unavailable;
    return this.manual;
  }

  async diarize(input: DiarizationInput): Promise<DiarizationResult> {
    return (await this.resolve()).diarize(input);
  }
}
