import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  StreamableFile,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma } from "@prisma/client";
import {
  DEFAULT_SUBTITLE_STYLE,
  mergeSegments,
  splitSegment,
  toSrt,
  toVtt,
  updateSegmentText,
  updateSegmentTiming,
  validateSegments,
  type SubtitleSegment,
  type SubtitleStyle,
} from "@sarupak/subtitle-utils";
import { createReadStream } from "node:fs";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { FfmpegService } from "../ffmpeg/ffmpeg.service";
import { JobsService } from "../jobs/jobs.service";
import { PrismaService } from "../prisma/prisma.service";
import { ProjectsService } from "../projects/projects.service";
import { SttService } from "../stt/stt.service";
import {
  STORAGE_SERVICE,
  type StorageService,
} from "../storage/storage.tokens";
import { TranslateService } from "../translate/translate.service";
import { renderSegmentOverlays } from "./overlay-renderer";

@Injectable()
export class SubtitlesService {
  private readonly logger = new Logger(SubtitlesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly projects: ProjectsService,
    private readonly jobs: JobsService,
    private readonly ffmpeg: FfmpegService,
    private readonly stt: SttService,
    private readonly translate: TranslateService,
    private readonly config: ConfigService,
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
  ) {}

  async list(userId: string, projectId: string) {
    await this.projects.getOwned(userId, projectId);
    const sets = await this.prisma.subtitleSet.findMany({
      where: { projectId },
      orderBy: { updatedAt: "desc" },
    });
    return sets.map((s) => this.toDto(s));
  }

  async get(userId: string, projectId: string, setId: string) {
    await this.projects.getOwned(userId, projectId);
    const set = await this.prisma.subtitleSet.findFirst({
      where: { id: setId, projectId },
    });
    if (!set) throw new NotFoundException("Subtitle set not found.");
    return this.toDto(set);
  }

  async generate(
    userId: string,
    projectId: string,
    input: { mediaAssetId: string; language?: string },
  ) {
    await this.projects.getOwned(userId, projectId);
    const asset = await this.prisma.mediaAsset.findFirst({
      where: { id: input.mediaAssetId, projectId, userId },
    });
    if (!asset) throw new NotFoundException("Media asset not found.");
    if (!this.storage.resolvePath) {
      throw new BadRequestException("Storage cannot resolve media paths.");
    }

    const extractJob = await this.jobs.enqueue({
      userId,
      projectId,
      type: "EXTRACT_AUDIO",
      input: { mediaAssetId: asset.id },
    });
    const sttJob = await this.jobs.enqueue({
      userId,
      projectId,
      type: "STT",
      input: { mediaAssetId: asset.id, language: input.language ?? null },
    });

    await this.prisma.job.update({
      where: { id: extractJob.id },
      data: { status: "RUNNING", progress: 0.1 },
    });

    const mediaPath = this.storage.resolvePath(asset.storageKey);
    const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "sarupak-stt-"));
    const wavPath = path.join(workDir, "audio.wav");

    try {
      await this.ffmpeg.extractAudio(mediaPath, wavPath);
      await this.prisma.job.update({
        where: { id: extractJob.id },
        data: {
          status: "SUCCEEDED",
          progress: 1,
          output: { wavPath: "ephemeral" },
        },
      });

      await this.prisma.job.update({
        where: { id: sttJob.id },
        data: { status: "RUNNING", progress: 0.2 },
      });

      const result = await this.stt.transcribe({
        audioPath: wavPath,
        language:
          input.language && input.language !== "auto"
            ? input.language
            : undefined,
      });

      const validation = validateSegments(result.segments);
      if (!validation.ok) {
        throw new BadRequestException(validation.reason);
      }

      const set = await this.prisma.subtitleSet.create({
        data: {
          projectId,
          language: result.language || input.language || "und",
          segments: result.segments as unknown as Prisma.InputJsonValue,
          style: DEFAULT_SUBTITLE_STYLE as unknown as Prisma.InputJsonValue,
        },
      });

      await this.prisma.job.update({
        where: { id: sttJob.id },
        data: {
          status: "SUCCEEDED",
          progress: 1,
          output: {
            subtitleSetId: set.id,
            provider: result.provider,
            transcribed: result.transcribed,
            segmentCount: result.segments.length,
            warnings: result.warnings,
          },
        },
      });

      return {
        subtitleSet: this.toDto(set),
        provider: result.provider,
        transcribed: result.transcribed,
        warnings: result.warnings,
        jobs: { extractAudioId: extractJob.id, sttId: sttJob.id },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Subtitle generation failed";
      await this.prisma.job.update({
        where: { id: extractJob.id },
        data: {
          status: "FAILED",
          error: message,
        },
      });
      await this.prisma.job.update({
        where: { id: sttJob.id },
        data: { status: "FAILED", error: message },
      });
      throw err;
    } finally {
      await fs.rm(workDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  async update(
    userId: string,
    projectId: string,
    setId: string,
    input: {
      language?: string;
      segments?: SubtitleSegment[];
      style?: Partial<SubtitleStyle>;
    },
  ) {
    await this.get(userId, projectId, setId);
    if (input.segments) {
      const validation = validateSegments(input.segments);
      if (!validation.ok) throw new BadRequestException(validation.reason);
    }

    const existing = await this.prisma.subtitleSet.findUniqueOrThrow({
      where: { id: setId },
    });
    const style = {
      ...DEFAULT_SUBTITLE_STYLE,
      ...((existing.style as SubtitleStyle | null) ?? {}),
      ...(input.style ?? {}),
    };

    const updated = await this.prisma.subtitleSet.update({
      where: { id: setId },
      data: {
        language: input.language,
        segments:
          input.segments !== undefined
            ? (input.segments as unknown as Prisma.InputJsonValue)
            : undefined,
        style: style as unknown as Prisma.InputJsonValue,
      },
    });
    return this.toDto(updated);
  }

  async split(
    userId: string,
    projectId: string,
    setId: string,
    segmentId: string,
    atMs: number,
  ) {
    const set = await this.get(userId, projectId, setId);
    const segments = splitSegment(set.segments, segmentId, atMs);
    return this.update(userId, projectId, setId, { segments });
  }

  async merge(
    userId: string,
    projectId: string,
    setId: string,
    leftId: string,
    rightId: string,
  ) {
    const set = await this.get(userId, projectId, setId);
    const segments = mergeSegments(set.segments, leftId, rightId);
    return this.update(userId, projectId, setId, { segments });
  }

  async patchSegment(
    userId: string,
    projectId: string,
    setId: string,
    segmentId: string,
    patch: { text?: string; startMs?: number; endMs?: number },
  ) {
    const set = await this.get(userId, projectId, setId);
    let segments = set.segments;
    if (patch.text !== undefined) {
      segments = updateSegmentText(segments, segmentId, patch.text);
    }
    if (patch.startMs !== undefined || patch.endMs !== undefined) {
      const current = segments.find((s) => s.id === segmentId);
      if (!current) throw new NotFoundException("Segment not found.");
      segments = updateSegmentTiming(
        segments,
        segmentId,
        patch.startMs ?? current.startMs,
        patch.endMs ?? current.endMs,
      );
    }
    return this.update(userId, projectId, setId, { segments });
  }

  async exportSrt(userId: string, projectId: string, setId: string) {
    const set = await this.get(userId, projectId, setId);
    return toSrt(set.segments);
  }

  async exportVtt(userId: string, projectId: string, setId: string) {
    const set = await this.get(userId, projectId, setId);
    return toVtt(set.segments);
  }

  /**
   * Create a new Khmer subtitle set by translating cues (timing preserved).
   * Never silently copies source text when translation fails.
   */
  async translateToKhmer(userId: string, projectId: string, setId: string) {
    const source = await this.get(userId, projectId, setId);
    if (source.segments.length === 0) {
      throw new BadRequestException("Subtitle set has no segments to translate.");
    }

    const job = await this.jobs.enqueue({
      userId,
      projectId,
      type: "STT",
      input: { kind: "translate", subtitleSetId: setId, target: "km" },
    });

    try {
      await this.prisma.job.update({
        where: { id: job.id },
        data: { status: "RUNNING", progress: 0.2 },
      });

      const result = await this.translate.translateToKhmer(
        source.segments.map((s) => ({ id: s.id, text: s.text })),
        source.language,
      );

      const translated: SubtitleSegment[] = source.segments.map((s) => {
        const hit = result.cues.find((c) => c.id === s.id);
        return {
          ...s,
          id: `${s.id}_km`,
          text: hit?.text ?? "",
        };
      });

      const validation = validateSegments(translated);
      if (!validation.ok) {
        throw new BadRequestException(validation.reason);
      }

      const set = await this.prisma.subtitleSet.create({
        data: {
          projectId,
          language: "km",
          segments: translated as unknown as Prisma.InputJsonValue,
          style: {
            ...DEFAULT_SUBTITLE_STYLE,
            ...(source.style ?? {}),
          } as unknown as Prisma.InputJsonValue,
        },
      });

      await this.prisma.job.update({
        where: { id: job.id },
        data: {
          status: "SUCCEEDED",
          progress: 1,
          output: {
            sourceSetId: setId,
            subtitleSetId: set.id,
            provider: result.provider,
            warnings: result.warnings,
          },
        },
      });

      return {
        subtitleSet: this.toDto(set),
        sourceSetId: setId,
        provider: result.provider,
        warnings: [
          ...result.warnings,
          "Translated set is Khmer (km). Review cues before burn-in or dubbing.",
        ],
        jobId: job.id,
      };
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Translate to Khmer failed";
      await this.prisma.job.update({
        where: { id: job.id },
        data: { status: "FAILED", error: message },
      });
      throw err instanceof BadRequestException
        ? err
        : new BadRequestException(message);
    }
  }

  async burnIn(
    userId: string,
    projectId: string,
    setId: string,
    mediaAssetId: string,
  ) {
    const set = await this.get(userId, projectId, setId);
    const asset = await this.prisma.mediaAsset.findFirst({
      where: { id: mediaAssetId, projectId, userId },
    });
    if (!asset) throw new NotFoundException("Media asset not found.");
    if (!this.storage.resolvePath) {
      throw new BadRequestException("Storage cannot resolve media paths.");
    }
    if (set.segments.length === 0) {
      throw new BadRequestException("Subtitle set has no segments.");
    }

    const job = await this.jobs.enqueue({
      userId,
      projectId,
      type: "TRANSCODE",
      input: { kind: "burn-in", subtitleSetId: setId, mediaAssetId },
    });

    void this.processBurnIn(job.id, userId, projectId, setId, mediaAssetId).catch(
      (err) =>
        this.logger.error(
          `Burn-in ${job.id} failed`,
          err instanceof Error ? err.stack : err,
        ),
    );

    return job;
  }

  async processBurnIn(
    jobId: string,
    userId: string,
    projectId: string,
    setId: string,
    mediaAssetId: string,
  ) {
    await this.prisma.job.update({
      where: { id: jobId },
      data: { status: "RUNNING", progress: 0.05 },
    });
    const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "sarupak-burn-"));
    try {
      const set = await this.get(userId, projectId, setId);
      const asset = await this.prisma.mediaAsset.findFirstOrThrow({
        where: { id: mediaAssetId, projectId, userId },
      });
      const videoPath = this.storage.resolvePath!(asset.storageKey);
      const style = {
        ...DEFAULT_SUBTITLE_STYLE,
        ...((set.style as SubtitleStyle | null) ?? {}),
      };
      const width = asset.width ?? 1280;
      const height = asset.height ?? 720;

      const overlays = await renderSegmentOverlays({
        segments: set.segments,
        width,
        style,
        workDir,
      });
      await this.prisma.job.update({
        where: { id: jobId },
        data: { progress: 0.35 },
      });

      const exportsDir = path.resolve(
        process.cwd(),
        this.config.get("STORAGE_LOCAL_PATH") ?? "./storage",
        "exports",
        userId,
        projectId,
      );
      await fs.mkdir(exportsDir, { recursive: true });
      const outputPath = path.join(exportsDir, `${jobId}-burnin.mp4`);

      await this.ffmpeg.burnInSubtitles({
        videoPath,
        outputPath,
        overlayPaths: overlays,
        width,
        height,
      });

      const storageKey = path.posix.join(
        "exports",
        userId,
        projectId,
        `${jobId}-burnin.mp4`,
      );
      await this.prisma.job.update({
        where: { id: jobId },
        data: {
          status: "SUCCEEDED",
          progress: 1,
          output: {
            storageKey,
            mimeType: "video/mp4",
            kind: "burn-in",
            note: "Burn-in uses bitmap overlays; complex scripts may render as placeholders. Prefer SRT/VTT for full Unicode fidelity.",
          },
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Burn-in failed";
      await this.prisma.job.update({
        where: { id: jobId },
        data: { status: "FAILED", error: message, progress: 0 },
      });
      throw err;
    } finally {
      await fs.rm(workDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  async downloadBurnIn(userId: string, jobId: string) {
    const job = await this.prisma.job.findUnique({ where: { id: jobId } });
    if (!job || job.userId !== userId) {
      throw new NotFoundException("Job not found.");
    }
    if (job.status !== "SUCCEEDED" || !job.output) {
      throw new BadRequestException("Burn-in is not ready.");
    }
    const output = job.output as { storageKey?: string };
    if (!output.storageKey || !this.storage.resolvePath) {
      throw new BadRequestException("Burn-in file missing.");
    }
    const stream = createReadStream(this.storage.resolvePath(output.storageKey));
    return new StreamableFile(stream, {
      type: "video/mp4",
      disposition: `attachment; filename="sarupak-burnin-${jobId}.mp4"`,
    });
  }

  async providers() {
    const stt = await this.stt.describeAvailability();
    const translate = await this.translate.status();
    return {
      ...stt,
      translate,
      supportedAsrLanguages: ["en", "zh", "ja", "km", "auto"],
    };
  }

  toDto(set: {
    id: string;
    projectId: string;
    language: string;
    segments: unknown;
    style: unknown;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: set.id,
      projectId: set.projectId,
      language: set.language,
      segments: (set.segments as SubtitleSegment[]) ?? [],
      style: {
        ...DEFAULT_SUBTITLE_STYLE,
        ...((set.style as SubtitleStyle | null) ?? {}),
      },
      createdAt: set.createdAt.toISOString(),
      updatedAt: set.updatedAt.toISOString(),
    };
  }
}
