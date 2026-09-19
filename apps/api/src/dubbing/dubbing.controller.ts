import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { DubbingService } from "./dubbing.service";
import {
  AssignVoiceDto,
  CreateDubbingSessionDto,
  GenerateTtsDto,
  UpdateDubbingSessionDto,
} from "./dto/dubbing.dto";

@Controller("projects/:projectId/dubbing")
@UseGuards(JwtAuthGuard)
export class DubbingController {
  constructor(private readonly dubbing: DubbingService) {}

  @Get("providers")
  providers(
    @CurrentUser() user: { userId: string },
    @Param("projectId") projectId: string,
  ) {
    return this.dubbing.providers(user.userId, projectId);
  }

  @Get("voices")
  voices() {
    return this.dubbing.listVoices();
  }

  @Get("sessions")
  list(
    @CurrentUser() user: { userId: string },
    @Param("projectId") projectId: string,
  ) {
    return this.dubbing.listSessions(user.userId, projectId);
  }

  @Post("sessions")
  create(
    @CurrentUser() user: { userId: string },
    @Param("projectId") projectId: string,
    @Body() body: CreateDubbingSessionDto,
  ) {
    return this.dubbing.createSession(user.userId, projectId, body);
  }

  @Get("sessions/:sessionId")
  get(
    @CurrentUser() user: { userId: string },
    @Param("projectId") projectId: string,
    @Param("sessionId") sessionId: string,
  ) {
    return this.dubbing.getSession(user.userId, projectId, sessionId);
  }

  @Patch("sessions/:sessionId")
  update(
    @CurrentUser() user: { userId: string },
    @Param("projectId") projectId: string,
    @Param("sessionId") sessionId: string,
    @Body() body: UpdateDubbingSessionDto,
  ) {
    return this.dubbing.updateSession(user.userId, projectId, sessionId, body);
  }

  @Post("sessions/:sessionId/extract-audio")
  extract(
    @CurrentUser() user: { userId: string },
    @Param("projectId") projectId: string,
    @Param("sessionId") sessionId: string,
  ) {
    return this.dubbing.extractAudio(user.userId, projectId, sessionId);
  }

  @Post("sessions/:sessionId/separate")
  separate(
    @CurrentUser() user: { userId: string },
    @Param("projectId") projectId: string,
    @Param("sessionId") sessionId: string,
  ) {
    return this.dubbing.separateAudio(user.userId, projectId, sessionId);
  }

  @Post("sessions/:sessionId/diarize")
  diarize(
    @CurrentUser() user: { userId: string },
    @Param("projectId") projectId: string,
    @Param("sessionId") sessionId: string,
  ) {
    return this.dubbing.diarize(user.userId, projectId, sessionId);
  }

  @Post("sessions/:sessionId/assign-voice")
  assignVoice(
    @CurrentUser() user: { userId: string },
    @Param("projectId") projectId: string,
    @Param("sessionId") sessionId: string,
    @Body() body: AssignVoiceDto,
  ) {
    return this.dubbing.assignVoice(user.userId, projectId, sessionId, body);
  }

  @Post("sessions/:sessionId/generate-tts")
  generateTts(
    @CurrentUser() user: { userId: string },
    @Param("projectId") projectId: string,
    @Param("sessionId") sessionId: string,
    @Body() body: GenerateTtsDto,
  ) {
    return this.dubbing.generateTts(user.userId, projectId, sessionId, body);
  }

  @Post("sessions/:sessionId/export")
  export(
    @CurrentUser() user: { userId: string },
    @Param("projectId") projectId: string,
    @Param("sessionId") sessionId: string,
  ) {
    return this.dubbing.mixAndExport(user.userId, projectId, sessionId);
  }

  @Get("sessions/:sessionId/export/jobs/:jobId/download")
  download(
    @CurrentUser() user: { userId: string },
    @Param("projectId") projectId: string,
    @Param("sessionId") sessionId: string,
    @Param("jobId") jobId: string,
  ) {
    return this.dubbing.downloadMix(user.userId, projectId, sessionId, jobId);
  }
}
