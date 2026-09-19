import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { CurrentUser, type AuthUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CreateProjectDto } from "./dto/create-project.dto";
import { UpdateProjectDto } from "./dto/update-project.dto";
import { ProjectsService } from "./projects.service";

@UseGuards(JwtAuthGuard)
@Controller("projects")
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() body: CreateProjectDto) {
    return this.projects.create(user.userId, body);
  }

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.projects.list(user.userId);
  }

  @Get(":id")
  get(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.projects.get(user.userId, id);
  }

  @Patch(":id")
  update(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() body: UpdateProjectDto,
  ) {
    return this.projects.update(user.userId, id, body);
  }

  @Delete(":id")
  remove(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.projects.remove(user.userId, id);
  }

  @Get(":id/snapshots")
  snapshots(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.projects.listSnapshots(user.userId, id);
  }

  @Post(":id/snapshots/:snapshotId/recover")
  recover(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Param("snapshotId") snapshotId: string,
  ) {
    return this.projects.recoverFromSnapshot(user.userId, id, snapshotId);
  }
}
