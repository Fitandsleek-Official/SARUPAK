import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { promises as fs } from "node:fs";
import path from "node:path";
import type {
  AudioSeparationProvider,
  SeparationInput,
  SeparationResult,
} from "./separation.types";
import { SotakaSeparationProvider } from "./sotaka.separation-provider";

/** Copies full mix as background — does NOT isolate dialogue. */
@Injectable()
export class PassthroughSeparationProvider implements AudioSeparationProvider {
  readonly name = "passthrough";

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async separate(input: SeparationInput): Promise<SeparationResult> {
    const dest = path.join(input.workDir, "full_passthrough.wav");
    await fs.copyFile(input.audioPath, dest);
    return {
      provider: this.name,
      available: false,
      stems: [
        {
          kind: "full",
          path: dest,
          available: true,
          note: "Full original audio (no stem isolation).",
        },
        {
          kind: "dialogue",
          available: false,
          note: "Dialogue stem unavailable without a real separation model.",
        },
        {
          kind: "music",
          available: false,
          note: "Music stem unavailable without a real separation model.",
        },
        {
          kind: "sfx",
          available: false,
        },
        {
          kind: "ambient",
          available: false,
        },
      ],
      warning:
        "True voice isolation is unavailable. Original audio preserved as background; dialogue is not removed.",
    };
  }
}

@Injectable()
export class UnavailableSeparationProvider implements AudioSeparationProvider {
  readonly name = "unavailable";

  async isAvailable(): Promise<boolean> {
    return false;
  }

  async separate(_input: SeparationInput): Promise<SeparationResult> {
    return {
      provider: this.name,
      available: false,
      stems: [],
      warning: "Audio separation provider is unavailable.",
    };
  }
}

/**
 * Optional Demucs CLI adapter — only used when SEPARATION_PROVIDER=demucs
 * and the binary succeeds. Otherwise callers should fall back.
 */
@Injectable()
export class DemucsSeparationProvider implements AudioSeparationProvider {
  readonly name = "demucs";

  constructor(private readonly config: ConfigService) {}

  async isAvailable(): Promise<boolean> {
    const forced = (this.config.get<string>("SEPARATION_PROVIDER") ?? "")
      .trim()
      .toLowerCase();
    return forced === "demucs";
  }

  async separate(_input: SeparationInput): Promise<SeparationResult> {
    return {
      provider: this.name,
      available: false,
      stems: [],
      warning:
        "Demucs provider selected but not verified in this environment. Falling back recommended.",
    };
  }
}

@Injectable()
export class SeparationService {
  constructor(
    private readonly config: ConfigService,
    private readonly passthrough: PassthroughSeparationProvider,
    private readonly unavailable: UnavailableSeparationProvider,
    private readonly demucs: DemucsSeparationProvider,
    private readonly sotaka: SotakaSeparationProvider,
  ) {}

  async resolve(): Promise<AudioSeparationProvider> {
    const forced = (this.config.get<string>("SEPARATION_PROVIDER") ?? "")
      .trim()
      .toLowerCase();
    if (forced === "unavailable") return this.unavailable;
    if (forced === "passthrough") return this.passthrough;
    if (forced === "demucs") {
      if (await this.demucs.isAvailable()) return this.demucs;
      return this.passthrough;
    }
    if (
      forced === "sotaka" ||
      forced === "sotaka-vocal-remover" ||
      forced === "auto" ||
      !forced
    ) {
      if (await this.sotaka.isAvailable()) return this.sotaka;
      if (forced === "sotaka" || forced === "sotaka-vocal-remover") {
        return this.passthrough;
      }
    }
    return this.passthrough;
  }

  async separate(input: SeparationInput): Promise<SeparationResult> {
    const provider = await this.resolve();
    const result = await provider.separate(input);
    if (
      (provider.name === "demucs" || provider.name === "sotaka") &&
      !result.available
    ) {
      return this.passthrough.separate(input);
    }
    return result;
  }
}
