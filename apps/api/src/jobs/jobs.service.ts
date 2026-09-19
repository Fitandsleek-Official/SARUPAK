import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { JobType, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { ProjectsService } from "../projects/projects.service";

@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly projects: ProjectsService,
  ) {}

  async enqueue(input: {
    userId: string;
    projectId: string;
    type: JobType;
    input?: Record<string, unknown>;
  }) {
    await this.projects.getOwned(input.userId, input.projectId);
    const job = await this.prisma.job.create({
      data: {
        userId: input.userId,
        projectId: input.projectId,
        type: input.type,
        status: "QUEUED",
        input: (input.input ?? {}) as Prisma.InputJsonValue,
      },
    });
    this.logger.log(
      `Queued ${job.type} job ${job.id} for project ${job.projectId} (worker processing Phase 2+)`,
    );
    return this.toDto(job);
  }

  async listForProject(userId: string, projectId: string) {
    await this.projects.getOwned(userId, projectId);
    const jobs = await this.prisma.job.findMany({
      where: { projectId, userId },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return jobs.map((j) => this.toDto(j));
  }

  async get(userId: string, jobId: string) {
    const job = await this.prisma.job.findUnique({ where: { id: jobId } });
    if (!job || job.userId !== userId) {
      throw new NotFoundException("Job not found.");
    }
    return this.toDto(job);
  }

  toDto(job: {
    id: string;
    projectId: string;
    type: JobType;
    status: string;
    progress: number;
    error: string | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: job.id,
      projectId: job.projectId,
      type: job.type,
      status: job.status,
      progress: job.progress,
      error: job.error,
      createdAt: job.createdAt.toISOString(),
      updatedAt: job.updatedAt.toISOString(),
    };
  }
}
