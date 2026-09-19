import {
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
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

  @Get(":assetId/content")
  @Header("Cache-Control", "private, max-age=60")
  async content(
    @CurrentUser() user: AuthUser,
    @Param("projectId") projectId: string,
    @Param("assetId") assetId: string,
  ) {
    const { file } = await this.media.getContent(
      user.userId,
      projectId,
      assetId,
    );
    return file;
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
