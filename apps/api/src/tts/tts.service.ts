import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { FfmpegService } from "../ffmpeg/ffmpeg.service";
import { MockTtsProvider } from "./mock.tts-provider";
import { OpenAiTtsProvider } from "./openai.tts-provider";
import { SotakaTtsProvider } from "./sotaka.tts-provider";
import type {
  TTSCapabilities,
  TTSInput,
  TTSProvider,
  TTSProviderState,
  TTSResult,
  TTSSynthesizeOptions,
} from "./tts.types";

@Injectable()
export class UnavailableTtsProvider implements TTSProvider {
  readonly name = "unavailable";

  async isAvailable(): Promise<boolean> {
    return false;
  }

  async getCapabilities(_language?: string): Promise<TTSCapabilities> {
    return {
      provider: this.name,
      available: false,
      state: "unavailable",
      languages: [],
      voices: [],
      voiceDetails: [],
      outputFormats: [],
      isMock: false,
      maxChars: 0,
      notes: ["No TTS provider is available."],
      apiKeyConfigured: false,
    };
  }

  async synthesize(_input: TTSInput): Promise<TTSResult> {
    throw new Error("TTS provider unavailable.");
  }
}

export interface TTSStatusReport {
  /** Suggested real provider when configured; never auto-suggests mock. */
  suggestedProvider: string | null;
  /** Env TTS_PROVIDER if set (explicit). */
  envProvider: string | null;
  /** True when OPENAI_API_KEY is present (boolean only — no secret). */
  openaiConfigured: boolean;
  /** True when SOTAKA_VOICE_URL is present. */
  sotakaConfigured: boolean;
  providers: TTSCapabilities[];
  states: Record<string, TTSProviderState>;
  policy: {
    silentMockFallback: false;
    mockRequiresExplicitSelection: true;
    /** True when SOTAKA is configured — Khmer speech path exists. */
    khmerClaimed: boolean;
  };
}

@Injectable()
export class TtsService {
  private readonly mock: MockTtsProvider;
  private readonly openai: OpenAiTtsProvider;
  private readonly sotaka: SotakaTtsProvider;
  private readonly unavailable = new UnavailableTtsProvider();

  constructor(
    private readonly config: ConfigService,
    ffmpeg: FfmpegService,
  ) {
    this.mock = new MockTtsProvider(ffmpeg);
    this.openai = new OpenAiTtsProvider(config, ffmpeg);
    this.sotaka = new SotakaTtsProvider(config, ffmpeg);
  }

  /** Exposed for unit tests that inject a fake fetch. */
  getOpenAiProvider(): OpenAiTtsProvider {
    return this.openai;
  }

  getSotakaProvider(): SotakaTtsProvider {
    return this.sotaka;
  }

  private envProvider(): string | null {
    const forced = (this.config.get<string>("TTS_PROVIDER") ?? "")
      .trim()
      .toLowerCase();
    return forced || null;
  }

  async status(language = "en"): Promise<TTSStatusReport> {
    const providers = [
      await this.sotaka.getCapabilities(language),
      await this.mock.getCapabilities(language),
      await this.openai.getCapabilities(language),
      await this.unavailable.getCapabilities(language),
    ];
    const openaiConfigured = await this.openai.isAvailable();
    const sotakaConfigured = await this.sotaka.isAvailable();
    const states: Record<string, TTSProviderState> = {};
    for (const p of providers) states[p.provider] = p.state;

    let suggested: string | null = null;
    const lang = language.toLowerCase();
    if (lang === "km" && sotakaConfigured) suggested = "sotaka-tts";
    else if (sotakaConfigured && lang === "km") suggested = "sotaka-tts";
    else if (openaiConfigured && lang !== "km") suggested = "openai-tts";
    else if (sotakaConfigured) suggested = "sotaka-tts";

    return {
      suggestedProvider: suggested,
      envProvider: this.envProvider(),
      openaiConfigured,
      sotakaConfigured,
      providers,
      states,
      policy: {
        silentMockFallback: false,
        mockRequiresExplicitSelection: true,
        khmerClaimed: sotakaConfigured,
      },
    };
  }

  /**
   * Backward-compatible summary used by Phase 4 callers.
   * `active` is env override or suggested real provider — never silently "mock"
   * unless env explicitly sets TTS_PROVIDER=mock.
   */
  async capabilities(language = "en"): Promise<{
    active: string | null;
    providers: TTSCapabilities[];
    status: TTSStatusReport;
  }> {
    const status = await this.status(language);
    const env = status.envProvider;
    const active =
      env === "mock"
        ? "mock"
        : env === "openai-tts" || env === "openai"
          ? "openai-tts"
          : env === "sotaka-tts" || env === "sotaka"
            ? "sotaka-tts"
            : status.suggestedProvider;
    return { active, providers: status.providers, status };
  }

  /**
   * Resolve a provider by explicit name.
   * Never returns mock unless name === "mock".
   */
  async resolveProvider(name: string): Promise<TTSProvider> {
    const requested = name.trim().toLowerCase();
    if (!requested) {
      throw new Error(
        "TTS provider must be selected explicitly (sotaka-tts, openai-tts, or mock).",
      );
    }
    if (requested === "mock") return this.mock;
    if (requested === "openai-tts" || requested === "openai") {
      if (!(await this.openai.isAvailable())) {
        throw new Error(
          "not_configured: OpenAI TTS selected but OPENAI_API_KEY is missing.",
        );
      }
      return this.openai;
    }
    if (requested === "sotaka-tts" || requested === "sotaka") {
      if (!(await this.sotaka.isAvailable())) {
        throw new Error(
          "not_configured: SOTAKA TTS selected but SOTAKA_VOICE_URL is missing.",
        );
      }
      return this.sotaka;
    }
    if (requested === "unavailable") return this.unavailable;
    throw new Error(`Unknown TTS provider: ${name}`);
  }

  /**
   * Synthesize with an explicit provider. Never falls back to mock on real-provider failure.
   */
  async synthesize(
    input: TTSInput,
    options: TTSSynthesizeOptions,
  ): Promise<TTSResult> {
    const provider = await this.resolveProvider(options.provider);
    try {
      return await provider.synthesize(input);
    } catch (err) {
      if (provider.name !== "mock" && err instanceof Error) {
        if (
          !err.message.startsWith("provider_error") &&
          !err.message.startsWith("not_configured") &&
          !err.message.startsWith("unsupported_language")
        ) {
          throw new Error(`provider_error: ${err.message}`);
        }
      }
      throw err;
    }
  }
}
