import { Injectable } from "@nestjs/common";
import { assertTextLength } from "@sarupak/dubbing-core";
import { FfmpegService } from "../ffmpeg/ffmpeg.service";
import type { TTSCapabilities, TTSInput, TTSProvider, TTSResult } from "./tts.types";

/** Test/dev only — generates playable tones, not speech. Requires explicit selection. */
@Injectable()
export class MockTtsProvider implements TTSProvider {
  readonly name = "mock";

  constructor(private readonly ffmpeg: FfmpegService) {}

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async getCapabilities(language?: string): Promise<TTSCapabilities> {
    const lang = (language ?? "en").toLowerCase();
    // Mock can run for test pipelines on any language code, but never claims Khmer speech quality.
    return {
      provider: this.name,
      available: true,
      state: "mock_mode",
      languages: ["en"],
      voices: ["tone_a", "tone_b"],
      voiceDetails: [
        { id: "tone_a", name: "Mock Tone A", languages: ["en"] },
        { id: "tone_b", name: "Mock Tone B", languages: ["en"] },
      ],
      outputFormats: ["wav"],
      isMock: true,
      maxChars: 4000,
      notes: [
        "Mock TTS produces sine tones sized to text length — not speech.",
        "Must be selected explicitly. Never used as a silent fallback from real TTS.",
        "Never present as production-quality audio.",
        lang === "km"
          ? "Khmer selected: mock still emits tones only — not Khmer speech."
          : "English mock tones for automated tests.",
      ],
      apiKeyConfigured: false,
    };
  }

  async synthesize(input: TTSInput): Promise<TTSResult> {
    assertTextLength(input.text);
    if (input.language.toLowerCase() === "km") {
      throw new Error(
        "Mock TTS does not support Khmer. Khmer TTS is unverified.",
      );
    }
    const allowed = ["tone_a", "tone_b"];
    if (!allowed.includes(input.voiceId) && !input.voiceId.startsWith("tone_")) {
      throw new Error(`Unknown mock voice id: ${input.voiceId}`);
    }
    const msPerChar = 55;
    const durationMs = Math.min(
      30000,
      Math.max(200, input.text.trim().length * msPerChar),
    );
    const adjusted = Math.round(durationMs / Math.max(0.5, input.speakingRate));
    const freq =
      input.voiceId.includes("b") || input.voiceId.includes("tone_b")
        ? 330
        : 440;
    const probe = await this.ffmpeg.synthesizeToneWav({
      outputPath: input.outputPath,
      durationMs: adjusted,
      frequencyHz: freq + input.pitch * 20,
    });
    if (!probe.hasAudio || !probe.durationMs) {
      throw new Error("Mock TTS failed to produce playable audio.");
    }
    return {
      provider: this.name,
      outputPath: input.outputPath,
      durationMs: probe.durationMs,
      sampleRate: probe.sampleRate,
      channels: probe.channels,
      codec: probe.codec,
      isMock: true,
      warnings: [
        "Generated with mock TTS (tone). Not production speech.",
      ],
    };
  }
}
