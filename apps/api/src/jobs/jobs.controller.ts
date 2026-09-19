import { Controller, Get, Param, UseGuards } from "@nestjs/common";
import { CurrentUser, type AuthUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { JobsService } from "./jobs.service";

@UseGuards(JwtAuthGuard)
@Controller()
export class JobsController {
  constructor(private readonly jobs: JobsService) {}

  @Get("projects/:projectId/jobs")
  listForProject(
    @CurrentUser() user: AuthUser,
    @Param("projectId") projectId: string,
  ) {
    return this.jobs.listForProject(user.userId, projectId);
  }

  @Get("jobs/:jobId")
  get(@CurrentUser() user: AuthUser, @Param("jobId") jobId: string) {
    return this.jobs.get(user.userId, jobId);
  }
}
