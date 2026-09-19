import { Module } from "@nestjs/common";
import { JobsModule } from "../jobs/jobs.module";
import { ProjectsModule } from "../projects/projects.module";
import { SttModule } from "../stt/stt.module";
import { SubtitlesController } from "./subtitles.controller";
import { SubtitlesService } from "./subtitles.service";

@Module({
  imports: [ProjectsModule, JobsModule, SttModule],
  controllers: [SubtitlesController],
  providers: [SubtitlesService],
  exports: [SubtitlesService],
})
export class SubtitlesModule {}
