import { Module } from "@nestjs/common";
import { MockSttProvider } from "./mock.stt-provider";
import { OpenAiWhisperSttProvider } from "./openai-whisper.stt-provider";
import { SilenceSegmentSttProvider } from "./silence-segment.stt-provider";
import { SttService } from "./stt.service";
import { WhisperCliSttProvider } from "./whisper-cli.stt-provider";

@Module({
  providers: [
    MockSttProvider,
    OpenAiWhisperSttProvider,
    WhisperCliSttProvider,
    SilenceSegmentSttProvider,
    SttService,
  ],
  exports: [SttService],
})
export class SttModule {}
