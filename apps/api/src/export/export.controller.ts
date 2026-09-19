import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import { IsIn, IsOptional } from "class-validator";
import { CurrentUser, type AuthUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { ExportService, type ExportAspect } from "./export.service";

class StartExportDto {
  @IsOptional()
  @IsIn(["16:9", "9:16", "1:1"])
  aspect?: ExportAspect;
}

@UseGuards(JwtAuthGuard)
@Controller("projects/:projectId/export")
export class ExportController {
  constructor(private readonly exports: ExportService) {}

  @Post()
  start(
    @CurrentUser() user: AuthUser,
    @Param("projectId") projectId: string,
    @Body() body: StartExportDto,
  ) {
    return this.exports.startExport(
      user.userId,
      projectId,
      body.aspect ?? "16:9",
    );
  }

  @Get("jobs/:jobId/download")
  download(
    @CurrentUser() user: AuthUser,
    @Param("jobId") jobId: string,
  ) {
    return this.exports.getExportFile(user.userId, jobId);
  }
}
