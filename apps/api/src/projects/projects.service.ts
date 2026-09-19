import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { createEmptyTimeline } from "@sarupak/shared-types";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, input: { name: string; width?: number; height?: number; frameRate?: number }) {
    const timeline = createEmptyTimeline();
    const project = await this.prisma.project.create({
      data: {
        userId,
        name: input.name.trim(),
        width: input.width ?? 1920,
        height: input.height ?? 1080,
        frameRate: input.frameRate ?? 30,
        timeline: timeline as unknown as Prisma.InputJsonValue,
      },
    });
    return this.toDto(project);
  }

  async list(userId: string) {
    const projects = await this.prisma.project.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
    });
    return projects.map((p) => this.toDto(p));
  }

  async getOwned(userId: string, projectId: string) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
    });
    if (!project) {
      throw new NotFoundException("Project not found.");
    }
    if (project.userId !== userId) {
      throw new ForbiddenException("You do not have access to this project.");
    }
    return project;
  }

  async get(userId: string, projectId: string) {
    return this.toDto(await this.getOwned(userId, projectId));
  }

  async update(
    userId: string,
    projectId: string,
    input: {
      name?: string;
      width?: number;
      height?: number;
      frameRate?: number;
      durationMs?: number;
      timeline?: unknown;
      status?: "DRAFT" | "PROCESSING" | "READY" | "FAILED";
      createSnapshot?: boolean;
      snapshotLabel?: string;
    },
  ) {
    await this.getOwned(userId, projectId);

    if (input.createSnapshot && input.timeline) {
      await this.prisma.projectSnapshot.create({
        data: {
          projectId,
          label: input.snapshotLabel ?? "autosave",
          timeline: input.timeline as Prisma.InputJsonValue,
        },
      });
    }

    const project = await this.prisma.project.update({
      where: { id: projectId },
      data: {
        name: input.name?.trim(),
        width: input.width,
        height: input.height,
        frameRate: input.frameRate,
        durationMs: input.durationMs,
        status: input.status,
        timeline:
          input.timeline !== undefined
            ? (input.timeline as Prisma.InputJsonValue)
            : undefined,
      },
    });
    return this.toDto(project);
  }

  async remove(userId: string, projectId: string) {
    await this.getOwned(userId, projectId);
    await this.prisma.project.delete({ where: { id: projectId } });
    return { ok: true };
  }

  async listSnapshots(userId: string, projectId: string) {
    await this.getOwned(userId, projectId);
    return this.prisma.projectSnapshot.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        label: true,
        createdAt: true,
      },
    });
  }

  async recoverFromSnapshot(
    userId: string,
    projectId: string,
    snapshotId: string,
  ) {
    await this.getOwned(userId, projectId);
    const snapshot = await this.prisma.projectSnapshot.findFirst({
      where: { id: snapshotId, projectId },
    });
    if (!snapshot) {
      throw new NotFoundException("Snapshot not found.");
    }
    const project = await this.prisma.project.update({
      where: { id: projectId },
      data: { timeline: snapshot.timeline as Prisma.InputJsonValue },
    });
    return this.toDto(project);
  }

  toDto(project: {
    id: string;
    name: string;
    schemaVersion: number;
    width: number;
    height: number;
    frameRate: number;
    durationMs: number;
    timeline: unknown;
    status: string;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: project.id,
      name: project.name,
      schemaVersion: project.schemaVersion,
      width: project.width,
      height: project.height,
      frameRate: project.frameRate,
      durationMs: project.durationMs,
      timeline: project.timeline,
      status: project.status,
      createdAt: project.createdAt.toISOString(),
      updatedAt: project.updatedAt.toISOString(),
    };
  }
}
