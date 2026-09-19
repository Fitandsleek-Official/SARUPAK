import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Res,
  UseGuards,
} from "@nestjs/common";
import {
  IsArray,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from "class-validator";
import type { Response } from "express";
import { CurrentUser, type AuthUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { SubtitlesService } from "./subtitles.service";

class GenerateSubtitlesDto {
  @IsString()
  mediaAssetId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  language?: string;
}

class UpdateSubtitlesDto {
  @IsOptional()
  @IsString()
  @MaxLength(16)
  language?: string;

  @IsOptional()
  @IsArray()
  segments?: unknown[];

  @IsOptional()
  @IsObject()
  style?: Record<string, unknown>;
}

class SplitDto {
  @IsString()
  segmentId!: string;

  @IsNumber()
  @Min(0)
  atMs!: number;
}

class MergeDto {
  @IsString()
  leftId!: string;

  @IsString()
  rightId!: string;
}

class PatchSegmentDto {
  @IsOptional()
  @IsString()
  text?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  startMs?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  endMs?: number;
}

class BurnInDto {
  @IsString()
  mediaAssetId!: string;
}

@UseGuards(JwtAuthGuard)
@Controller("projects/:projectId/subtitles")
export class SubtitlesController {
  constructor(private readonly subtitles: SubtitlesService) {}

  @Get("providers")
  providers() {
    return this.subtitles.providers();
  }

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Param("projectId") projectId: string,
  ) {
    return this.subtitles.list(user.userId, projectId);
  }

  @Post("generate")
  generate(
    @CurrentUser() user: AuthUser,
    @Param("projectId") projectId: string,
    @Body() body: GenerateSubtitlesDto,
  ) {
    return this.subtitles.generate(user.userId, projectId, body);
  }

  @Get("burn-in/:jobId/download")
  download(
    @CurrentUser() user: AuthUser,
    @Param("jobId") jobId: string,
  ) {
    return this.subtitles.downloadBurnIn(user.userId, jobId);
  }

  @Get(":setId")
  get(
    @CurrentUser() user: AuthUser,
    @Param("projectId") projectId: string,
    @Param("setId") setId: string,
  ) {
    return this.subtitles.get(user.userId, projectId, setId);
  }

  @Patch(":setId")
  update(
    @CurrentUser() user: AuthUser,
    @Param("projectId") projectId: string,
    @Param("setId") setId: string,
    @Body() body: UpdateSubtitlesDto,
  ) {
    return this.subtitles.update(user.userId, projectId, setId, {
      language: body.language,
      segments: body.segments as never,
      style: body.style as never,
    });
  }

  @Post(":setId/split")
  split(
    @CurrentUser() user: AuthUser,
    @Param("projectId") projectId: string,
    @Param("setId") setId: string,
    @Body() body: SplitDto,
  ) {
    return this.subtitles.split(
      user.userId,
      projectId,
      setId,
      body.segmentId,
      body.atMs,
    );
  }

  @Post(":setId/merge")
  merge(
    @CurrentUser() user: AuthUser,
    @Param("projectId") projectId: string,
    @Param("setId") setId: string,
    @Body() body: MergeDto,
  ) {
    return this.subtitles.merge(
      user.userId,
      projectId,
      setId,
      body.leftId,
      body.rightId,
    );
  }

  @Patch(":setId/segments/:segmentId")
  patchSegment(
    @CurrentUser() user: AuthUser,
    @Param("projectId") projectId: string,
    @Param("setId") setId: string,
    @Param("segmentId") segmentId: string,
    @Body() body: PatchSegmentDto,
  ) {
    return this.subtitles.patchSegment(
      user.userId,
      projectId,
      setId,
      segmentId,
      body,
    );
  }

  @Get(":setId/export.srt")
  async exportSrt(
    @CurrentUser() user: AuthUser,
    @Param("projectId") projectId: string,
    @Param("setId") setId: string,
    @Res() res: Response,
  ) {
    const srt = await this.subtitles.exportSrt(user.userId, projectId, setId);
    res.setHeader("Content-Type", "application/x-subrip; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="subtitles-${setId}.srt"`,
    );
    res.send(srt);
  }

  @Get(":setId/export.vtt")
  async exportVtt(
    @CurrentUser() user: AuthUser,
    @Param("projectId") projectId: string,
    @Param("setId") setId: string,
    @Res() res: Response,
  ) {
    const vtt = await this.subtitles.exportVtt(user.userId, projectId, setId);
    res.setHeader("Content-Type", "text/vtt; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="subtitles-${setId}.vtt"`,
    );
    res.send(vtt);
  }

  @Post(":setId/burn-in")
  burnIn(
    @CurrentUser() user: AuthUser,
    @Param("projectId") projectId: string,
    @Param("setId") setId: string,
    @Body() body: BurnInDto,
  ) {
    return this.subtitles.burnIn(
      user.userId,
      projectId,
      setId,
      body.mediaAssetId,
    );
  }
}
