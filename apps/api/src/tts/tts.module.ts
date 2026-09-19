import { Module } from "@nestjs/common";
import { FfmpegModule } from "../ffmpeg/ffmpeg.module";
import { TtsService } from "./tts.service";

@Module({
  imports: [FfmpegModule],
  providers: [TtsService],
  exports: [TtsService],
})
export class TtsModule {}
