import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { MediaKind } from "@prisma/client";
import {
  buildStorageKey,
  validateUpload,
} from "@sarupak/media-utils";
import { ConfigService } from "@nestjs/config";
import { createId } from "./create-id";
import { PrismaService } from "../prisma/prisma.service";
import { ProjectsService } from "../projects/projects.service";
import { JobsService } from "../jobs/jobs.service";
import { FfmpegService } from "../ffmpeg/ffmpeg.service";
import {
  STORAGE_SERVICE,
  type StorageService,
} from "../storage/storage.tokens";

@Injectable()
export class MediaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projects: ProjectsService,
    private readonly jobs: JobsService,
    private readonly ffmpeg: FfmpegService,
    private readonly config: ConfigService,
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
  ) {}

  async list(userId: string, projectId: string) {
    await this.projects.getOwned(userId, projectId);
    const assets = await this.prisma.mediaAsset.findMany({
      where: { projectId, userId },
      orderBy: { createdAt: "desc" },
    });
    return Promise.all(
      assets.map(async (a) => {
        const available = this.storage.exists
          ? await this.storage.exists(a.storageKey)
          : true;
        return { ...this.toDto(a), available };
      }),
    );
  }

  async upload(
    userId: string,
    projectId: string,
    file: Express.Multer.File | undefined,
  ) {
    if (!file) {
      throw new BadRequestException("No file uploaded.");
    }
    await this.projects.getOwned(userId, projectId);

    const maxBytes = Number(
      this.config.get("MAX_UPLOAD_BYTES") ?? 524288000,
    );
    const validation = validateUpload({
      mimeType: file.mimetype,
      originalName: file.originalname,
      sizeBytes: file.size,
      maxBytes,
    });
    if (!validation.ok) {
      throw new BadRequestException(validation.reason);
    }

    const assetId = createId();
    const storageKey = buildStorageKey({
      userId,
      projectId,
      assetId,
      safeBaseName: validation.safeBaseName,
    });

    await this.storage.putObject(storageKey, file.buffer, file.mimetype);

    let durationMs: number | null = null;
    let width: number | null = null;
    let height: number | null = null;

    if (this.storage.resolvePath) {
      try {
        const probed = await this.ffmpeg.probe(
          this.storage.resolvePath(storageKey),
        );
        durationMs = probed.durationMs;
        width = probed.width;
        height = probed.height;
      } catch {
        // Probe failure is non-fatal; editor can still use the file.
      }
    }

    // Still images default duration for timeline placement
    if (validation.kind === "IMAGE" && durationMs == null) {
      durationMs = 3000;
    }

    const asset = await this.prisma.mediaAsset.create({
      data: {
        id: assetId,
        projectId,
        userId,
        kind: validation.kind as MediaKind,
        storageKey,
        originalName: validation.displayName,
        mimeType: file.mimetype.toLowerCase().split(";")[0]!.trim(),
        sizeBytes: BigInt(file.size),
        durationMs,
        width,
        height,
      },
    });

    const job = await this.jobs.enqueue({
      userId,
      projectId,
      type: "PROBE",
      input: { mediaAssetId: asset.id },
    });
    await this.prisma.job.update({
      where: { id: job.id },
      data: {
        status: "SUCCEEDED",
        progress: 1,
        output: { durationMs, width, height },
      },
    });

    return { ...this.toDto(asset), available: true };
  }

  async remove(userId: string, projectId: string, assetId: string) {
    await this.projects.getOwned(userId, projectId);
    const asset = await this.prisma.mediaAsset.findFirst({
      where: { id: assetId, projectId, userId },
    });
    if (!asset) {
      throw new BadRequestException("Media asset not found.");
    }
    await this.storage.deleteObject(asset.storageKey);
    await this.prisma.mediaAsset.delete({ where: { id: asset.id } });
    return { ok: true };
  }

  async getContent(userId: string, projectId: string, assetId: string) {
    await this.projects.getOwned(userId, projectId);
    const asset = await this.prisma.mediaAsset.findFirst({
      where: { id: assetId, projectId, userId },
    });
    if (!asset) {
      throw new NotFoundException("Media asset not found.");
    }
    if (!this.storage.resolvePath || !this.storage.exists) {
      throw new BadRequestException("Cannot stream from this storage driver.");
    }
    const exists = await this.storage.exists(asset.storageKey);
    if (!exists) {
      throw new NotFoundException(
        "Media file is missing on the server (storage may have been reset). Re-import the file.",
      );
    }
    const filePath = this.storage.resolvePath(asset.storageKey);
    return {
      filePath,
      mimeType: asset.mimeType,
      /** ASCII-safe name for Content-Disposition */
      downloadName: asset.originalName.replace(/[^\w.\-()+\s]/g, "_").slice(0, 120) || "media.bin",
    };
  }

  toDto(asset: {
    id: string;
    projectId: string;
    kind: MediaKind;
    originalName: string;
    mimeType: string;
    sizeBytes: bigint;
    durationMs: number | null;
    width: number | null;
    height: number | null;
    createdAt: Date;
  }) {
    return {
      id: asset.id,
      projectId: asset.projectId,
      kind: asset.kind,
      originalName: asset.originalName,
      mimeType: asset.mimeType,
      sizeBytes: asset.sizeBytes.toString(),
      durationMs: asset.durationMs,
      width: asset.width,
      height: asset.height,
      createdAt: asset.createdAt.toISOString(),
    };
  }
}
