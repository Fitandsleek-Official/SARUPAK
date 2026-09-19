import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  StreamableFile,
} from "@nestjs/common";
import { Inject } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { TimelineDocumentV1 } from "@sarupak/shared-types";
import { computeTimelineDurationMs } from "@sarupak/editor-core";
import { createReadStream } from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";
import { FfmpegService } from "../ffmpeg/ffmpeg.service";
import { JobsService } from "../jobs/jobs.service";
import { PrismaService } from "../prisma/prisma.service";
import { ProjectsService } from "../projects/projects.service";
import {
  STORAGE_SERVICE,
  type StorageService,
} from "../storage/storage.tokens";

export type ExportAspect = "16:9" | "9:16" | "1:1";

const ASPECT_SIZE: Record<ExportAspect, { width: number; height: number }> = {
  "16:9": { width: 1920, height: 1080 },
  "9:16": { width: 1080, height: 1920 },
  "1:1": { width: 1080, height: 1080 },
};

@Injectable()
export class ExportService {
  private readonly logger = new Logger(ExportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly projects: ProjectsService,
    private readonly jobs: JobsService,
    private readonly ffmpeg: FfmpegService,
    private readonly config: ConfigService,
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
  ) {}

  async startExport(
    userId: string,
    projectId: string,
    aspect: ExportAspect = "16:9",
  ) {
    const project = await this.projects.getOwned(userId, projectId);
    const timeline = project.timeline as unknown as TimelineDocumentV1;
    const durationMs = computeTimelineDurationMs(timeline);
    if (durationMs <= 0) {
      throw new BadRequestException(
        "Timeline is empty. Add at least one clip before exporting.",
      );
    }

    const size = ASPECT_SIZE[aspect] ?? ASPECT_SIZE["16:9"];
    const job = await this.jobs.enqueue({
      userId,
      projectId,
      type: "RENDER",
      input: { aspect, width: size.width, height: size.height },
    });

    // Process inline (no Redis worker in Phase 2). Fire-and-forget with status updates.
    void this.processRender(job.id, userId, projectId, aspect).catch((err) => {
      this.logger.error(`Render ${job.id} failed`, err instanceof Error ? err.stack : err);
    });

    return job;
  }

  async processRender(
    jobId: string,
    userId: string,
    projectId: string,
    aspect: ExportAspect,
  ) {
    await this.prisma.job.update({
      where: { id: jobId },
      data: { status: "RUNNING", progress: 0.05, attempts: { increment: 1 } },
    });

    try {
      const project = await this.projects.getOwned(userId, projectId);
      const timeline = project.timeline as unknown as TimelineDocumentV1;
      const size = ASPECT_SIZE[aspect] ?? ASPECT_SIZE["16:9"];

      const assets = await this.prisma.mediaAsset.findMany({
        where: { projectId, userId },
      });
      const mediaPaths: Record<string, string> = {};
      for (const asset of assets) {
        if (!this.storage.resolvePath) {
          throw new Error("Storage driver cannot resolve local paths for FFmpeg.");
        }
        mediaPaths[asset.id] = this.storage.resolvePath(asset.storageKey);
      }

      const exportsDir = path.resolve(
        process.cwd(),
        this.config.get("STORAGE_LOCAL_PATH") ?? "./storage",
        "exports",
        userId,
        projectId,
      );
      await fs.mkdir(exportsDir, { recursive: true });
      const outputPath = path.join(exportsDir, `${jobId}.mp4`);

      await this.ffmpeg.renderTimeline({
        timeline,
        width: size.width,
        height: size.height,
        frameRate: project.frameRate || 30,
        mediaPaths,
        outputPath,
        onProgress: (ratio) => {
          void this.prisma.job.update({
            where: { id: jobId },
            data: { progress: Math.min(0.99, Math.max(0.05, ratio)) },
          });
        },
      });

      const storageKey = path.posix.join(
        "exports",
        userId,
        projectId,
        `${jobId}.mp4`,
      );

      await this.prisma.job.update({
        where: { id: jobId },
        data: {
          status: "SUCCEEDED",
          progress: 1,
          output: {
            storageKey,
            aspect,
            width: size.width,
            height: size.height,
            mimeType: "video/mp4",
          },
        },
      });

      await this.prisma.project.update({
        where: { id: projectId },
        data: { status: "READY" },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Render failed";
      await this.prisma.job.update({
        where: { id: jobId },
        data: { status: "FAILED", error: message, progress: 0 },
      });
      await this.prisma.project.update({
        where: { id: projectId },
        data: { status: "FAILED" },
      });
      throw err;
    }
  }

  async getExportFile(userId: string, jobId: string) {
    const job = await this.prisma.job.findUnique({ where: { id: jobId } });
    if (!job || job.userId !== userId) {
      throw new NotFoundException("Export job not found.");
    }
    if (job.status !== "SUCCEEDED" || !job.output) {
      throw new BadRequestException("Export is not ready.");
    }
    const output = job.output as { storageKey?: string };
    if (!output.storageKey || !this.storage.resolvePath) {
      throw new BadRequestException("Export file missing.");
    }
    const filePath = this.storage.resolvePath(output.storageKey);
    const stream = createReadStream(filePath);
    return new StreamableFile(stream, {
      type: "video/mp4",
      disposition: `attachment; filename="sarupak-${jobId}.mp4"`,
    });
  }
}
