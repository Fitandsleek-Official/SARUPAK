import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { MockSttProvider } from "./mock.stt-provider";
import { OpenAiWhisperSttProvider } from "./openai-whisper.stt-provider";
import { SilenceSegmentSttProvider } from "./silence-segment.stt-provider";
import { WhisperCliSttProvider } from "./whisper-cli.stt-provider";
import type {
  SpeechToTextProvider,
  SttTranscribeInput,
  SttTranscribeResult,
} from "./stt.types";

@Injectable()
export class SttService {
  private readonly logger = new Logger(SttService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly mock: MockSttProvider,
    private readonly openai: OpenAiWhisperSttProvider,
    private readonly whisperCli: WhisperCliSttProvider,
    private readonly silence: SilenceSegmentSttProvider,
  ) {}

  async resolveProvider(): Promise<SpeechToTextProvider> {
    const forced = (this.config.get<string>("STT_PROVIDER") ?? "")
      .trim()
      .toLowerCase();
    const catalog: SpeechToTextProvider[] = [
      this.mock,
      this.openai,
      this.whisperCli,
      this.silence,
    ];

    if (forced) {
      const match = catalog.find((p) => p.name === forced);
      if (!match) {
        throw new Error(
          `Unknown STT_PROVIDER=${forced}. Use mock|openai-whisper|whisper-cli|silence-segments.`,
        );
      }
      if (!(await match.isAvailable()) && match.name !== "silence-segments") {
        throw new Error(`STT provider ${forced} is not available.`);
      }
      return match;
    }

    for (const provider of [this.openai, this.whisperCli, this.silence]) {
      if (await provider.isAvailable()) {
        return provider;
      }
    }
    return this.silence;
  }

  async transcribe(input: SttTranscribeInput): Promise<SttTranscribeResult> {
    const provider = await this.resolveProvider();
    this.logger.log(`Using STT provider: ${provider.name}`);
    const result = await provider.transcribe(input);
    if (result.segments.length === 0) {
      result.warnings.push("No speech segments produced.");
    }
    return result;
  }

  async describeAvailability() {
    return {
      mock: await this.mock.isAvailable(),
      openaiWhisper: await this.openai.isAvailable(),
      whisperCli: await this.whisperCli.isAvailable(),
      silenceSegments: true,
      active: (await this.resolveProvider()).name,
    };
  }
}
