import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AuthModule } from "./auth/auth.module";
import { UsersModule } from "./users/users.module";
import { ProjectsModule } from "./projects/projects.module";
import { MediaModule } from "./media/media.module";
import { JobsModule } from "./jobs/jobs.module";
import { HealthModule } from "./health/health.module";
import { PrismaModule } from "./prisma/prisma.module";
import { StorageModule } from "./storage/storage.module";
import { FfmpegModule } from "./ffmpeg/ffmpeg.module";
import { ExportModule } from "./export/export.module";
import { SubtitlesModule } from "./subtitles/subtitles.module";
import { DubbingModule } from "./dubbing/dubbing.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [".env", "../../.env"],
    }),
    PrismaModule,
    StorageModule,
    FfmpegModule,
    HealthModule,
    UsersModule,
    AuthModule,
    ProjectsModule,
    MediaModule,
    JobsModule,
    ExportModule,
    SubtitlesModule,
    DubbingModule,
  ],
})
export class AppModule {}
