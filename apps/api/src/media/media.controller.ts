import {
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
import type { Response } from "express";
import { CurrentUser, type AuthUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { MediaService } from "./media.service";

@UseGuards(JwtAuthGuard)
@Controller("projects/:projectId/media")
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Param("projectId") projectId: string,
  ) {
    return this.media.list(user.userId, projectId);
  }

  @Post()
  @UseInterceptors(
    FileInterceptor("file", {
      storage: memoryStorage(),
      limits: { fileSize: 524288000 },
    }),
  )
  upload(
    @CurrentUser() user: AuthUser,
    @Param("projectId") projectId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.media.upload(user.userId, projectId, file);
  }

  /**
   * Stream media with Range support (needed for HTML5 video/audio seek).
   * Auth: Bearer header or ?token= for media element src.
   */
  @Get(":assetId/content")
  async content(
    @CurrentUser() user: AuthUser,
    @Param("projectId") projectId: string,
    @Param("assetId") assetId: string,
    @Res() res: Response,
  ) {
    const { filePath, mimeType, downloadName } = await this.media.getContent(
      user.userId,
      projectId,
      assetId,
    );
    res.setHeader("Content-Type", mimeType);
    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Cache-Control", "private, max-age=120");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${downloadName.replace(/"/g, "")}"`,
    );
    await new Promise<void>((resolve, reject) => {
      res.sendFile(filePath, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  @Delete(":assetId")
  remove(
    @CurrentUser() user: AuthUser,
    @Param("projectId") projectId: string,
    @Param("assetId") assetId: string,
  ) {
    return this.media.remove(user.userId, projectId, assetId);
  }
}
