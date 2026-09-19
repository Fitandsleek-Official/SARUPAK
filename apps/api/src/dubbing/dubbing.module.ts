import { Module } from "@nestjs/common";
import { DiarizationModule } from "../diarization/diarization.module";
import { FfmpegModule } from "../ffmpeg/ffmpeg.module";
import { JobsModule } from "../jobs/jobs.module";
import { ProjectsModule } from "../projects/projects.module";
import { SeparationModule } from "../separation/separation.module";
import { StorageModule } from "../storage/storage.module";
import { TtsModule } from "../tts/tts.module";
import { DubbingController } from "./dubbing.controller";
import { DubbingService } from "./dubbing.service";

@Module({
  imports: [
    ProjectsModule,
    JobsModule,
    FfmpegModule,
    StorageModule,
    TtsModule,
    SeparationModule,
    DiarizationModule,
  ],
  controllers: [DubbingController],
  providers: [DubbingService],
  exports: [DubbingService],
})
export class DubbingModule {}
