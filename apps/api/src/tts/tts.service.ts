import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { FfmpegService } from "../ffmpeg/ffmpeg.service";
import { MockTtsProvider } from "./mock.tts-provider";
import { OpenAiTtsProvider } from "./openai.tts-provider";
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
  providers: TTSCapabilities[];
  states: Record<string, TTSProviderState>;
  policy: {
    silentMockFallback: false;
    mockRequiresExplicitSelection: true;
    khmerClaimed: false;
  };
}

@Injectable()
export class TtsService {
  private readonly mock: MockTtsProvider;
  private readonly openai: OpenAiTtsProvider;
  private readonly unavailable = new UnavailableTtsProvider();

  constructor(
    private readonly config: ConfigService,
    ffmpeg: FfmpegService,
  ) {
    this.mock = new MockTtsProvider(ffmpeg);
    this.openai = new OpenAiTtsProvider(config, ffmpeg);
  }

  /** Exposed for unit tests that inject a fake fetch. */
  getOpenAiProvider(): OpenAiTtsProvider {
    return this.openai;
  }

  private envProvider(): string | null {
    const forced = (this.config.get<string>("TTS_PROVIDER") ?? "")
      .trim()
      .toLowerCase();
    return forced || null;
  }

  async status(language = "en"): Promise<TTSStatusReport> {
    const providers = [
      await this.mock.getCapabilities(language),
      await this.openai.getCapabilities(language),
      await this.unavailable.getCapabilities(language),
    ];
    const openaiConfigured = await this.openai.isAvailable();
    const states: Record<string, TTSProviderState> = {};
    for (const p of providers) states[p.provider] = p.state;

    return {
      suggestedProvider: openaiConfigured ? "openai-tts" : null,
      envProvider: this.envProvider(),
      openaiConfigured,
      providers,
      states,
      policy: {
        silentMockFallback: false,
        mockRequiresExplicitSelection: true,
        khmerClaimed: false,
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
    const active =
      status.envProvider === "mock"
        ? "mock"
        : status.envProvider === "openai-tts" || status.envProvider === "openai"
          ? "openai-tts"
          : status.suggestedProvider;
    return { active, providers: status.providers, status };
  }

  /**
   * Resolve a provider by explicit name.
   * Never returns mock unless name === "mock" (or env forces mock and name omitted — not used here).
   */
  async resolveProvider(name: string): Promise<TTSProvider> {
    const requested = name.trim().toLowerCase();
    if (!requested) {
      throw new Error(
        "TTS provider must be selected explicitly (openai-tts or mock).",
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
      // Re-throw as-is — do NOT catch and retry with mock.
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
