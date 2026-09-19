import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { App } from "supertest/types";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";

/**
 * Phase 4 E2E:
 * import → subtitle cues → dubbing session → extract → assign → mock TTS → mix → playable MP4
 */
describe("Phase 4 dubbing workflow (e2e)", () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const email = `phase4_dub_${Date.now()}@example.com`;
  const password = "testpass123";
  let token = "";
  let projectId = "";
  let mediaId = "";
  let subtitleSetId = "";
  let sessionId = "";
  let samplePath = "";
  let downloadedPath = "";

  beforeAll(async () => {
    process.env.TTS_PROVIDER = "mock";
    process.env.STT_PROVIDER = "mock";
    process.env.SEPARATION_PROVIDER = "passthrough";
    process.env.DIARIZATION_PROVIDER = "mock";

    samplePath = path.join(os.tmpdir(), `sarupak-dub-${Date.now()}.mp4`);
    const gen = spawnSync(
      "ffmpeg",
      [
        "-y",
        "-f",
        "lavfi",
        "-i",
        "color=c=navy:s=640x360:d=3",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=500:duration=3",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-shortest",
        samplePath,
      ],
      { encoding: "utf8" },
    );
    if (gen.status !== 0) {
      throw new Error(`ffmpeg sample failed: ${gen.stderr}`);
    }

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("v1");
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    prisma = app.get(PrismaService);
  }, 60000);

  afterAll(async () => {
    if (prisma) {
      const user = await prisma.user.findUnique({ where: { email } });
      if (user) await prisma.user.delete({ where: { id: user.id } });
    }
    await app.close();
    await fs.unlink(samplePath).catch(() => undefined);
    if (downloadedPath) {
      await fs.unlink(downloadedPath).catch(() => undefined);
    }
  });

  it("registers, uploads video, creates subtitle set", async () => {
    const reg = await request(app.getHttpServer())
      .post("/v1/auth/register")
      .send({ email, password, displayName: "Dub" });
    expect(reg.status).toBe(201);
    token = reg.body.accessToken;

    const project = await request(app.getHttpServer())
      .post("/v1/projects")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Dub Project", width: 1280, height: 720 });
    expect(project.status).toBe(201);
    projectId = project.body.id;

    const upload = await request(app.getHttpServer())
      .post(`/v1/projects/${projectId}/media`)
      .set("Authorization", `Bearer ${token}`)
      .attach("file", samplePath);
    expect(upload.status).toBe(201);
    mediaId = upload.body.id;

    const sub = await request(app.getHttpServer())
      .post(`/v1/projects/${projectId}/subtitles/generate`)
      .set("Authorization", `Bearer ${token}`)
      .send({ mediaAssetId: mediaId, language: "en" });
    expect(sub.status).toBe(201);
    subtitleSetId = sub.body.subtitleSet.id;
    // Ensure at least one cue with text for TTS
    const segs = sub.body.subtitleSet.segments as Array<{
      id: string;
      startMs: number;
      endMs: number;
      text: string;
    }>;
    if (segs.length === 0 || !segs[0]!.text.trim()) {
      const patch = await request(app.getHttpServer())
        .patch(
          `/v1/projects/${projectId}/subtitles/${subtitleSetId}/segments/${segs[0]?.id ?? "x"}`,
        )
        .set("Authorization", `Bearer ${token}`)
        .send({ text: "Hello dubbing world", startMs: 200, endMs: 1200 });
      // If no segment, update whole set via generate mock usually creates some
      if (patch.status >= 400) {
        // recreate cues by patching first available from list
        const list = await request(app.getHttpServer())
          .get(`/v1/projects/${projectId}/subtitles`)
          .set("Authorization", `Bearer ${token}`);
        expect(list.body[0].segments.length).toBeGreaterThan(0);
        const first = list.body[0].segments[0];
        await request(app.getHttpServer())
          .patch(
            `/v1/projects/${projectId}/subtitles/${subtitleSetId}/segments/${first.id}`,
          )
          .set("Authorization", `Bearer ${token}`)
          .send({ text: "Hello dubbing world", startMs: 200, endMs: 1200 });
      }
    }
  });

  it("creates dubbing session and extracts audio", async () => {
    const created = await request(app.getHttpServer())
      .post(`/v1/projects/${projectId}/dubbing/sessions`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        mediaAssetId: mediaId,
        subtitleSetId,
        sourceLanguage: "en",
        targetLanguage: "en",
        ttsProvider: "mock",
      });
    expect(created.status).toBe(201);
    expect(created.body.segments.length).toBeGreaterThan(0);
    sessionId = created.body.id;

    const extract = await request(app.getHttpServer())
      .post(`/v1/projects/${projectId}/dubbing/sessions/${sessionId}/extract-audio`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
    expect(extract.status).toBe(201);
    expect(extract.body.session.extractedAudioMediaId).toBeTruthy();
    expect(extract.body.audio.hasAudio).toBe(true);
  });

  it("separates with passthrough warning (no silent overwrite claim)", async () => {
    const sep = await request(app.getHttpServer())
      .post(`/v1/projects/${projectId}/dubbing/sessions/${sessionId}/separate`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
    expect(sep.status).toBe(201);
    expect(sep.body.session.separation.available).toBe(false);
    expect(String(sep.body.session.separation.warning)).toMatch(/unavailable|preserved/i);
  });

  it("assigns voice and generates mock TTS", async () => {
    const voices = await request(app.getHttpServer())
      .get(`/v1/projects/${projectId}/dubbing/voices`)
      .set("Authorization", `Bearer ${token}`);
    expect(voices.status).toBe(200);
    const mockVoice = voices.body.find(
      (v: { provider: string }) => v.provider === "mock",
    );
    expect(mockVoice).toBeTruthy();

    // Without assignment, TTS must fail per segment (no silent mock fallback)
    const noVoice = await request(app.getHttpServer())
      .post(`/v1/projects/${projectId}/dubbing/sessions/${sessionId}/generate-tts`)
      .set("Authorization", `Bearer ${token}`)
      .send({ ttsProvider: "mock" });
    expect(noVoice.status).toBe(201);
    expect(
      noVoice.body.session.segments.every(
        (s: { status: string; generatedAudioMediaId?: string }) =>
          s.status === "failed" && !s.generatedAudioMediaId,
      ),
    ).toBe(true);

    const assign = await request(app.getHttpServer())
      .post(`/v1/projects/${projectId}/dubbing/sessions/${sessionId}/assign-voice`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        speakerId: "speaker_male",
        voiceCharacterId: mockVoice.id,
      });
    expect(assign.status).toBe(201);

    const tts = await request(app.getHttpServer())
      .post(`/v1/projects/${projectId}/dubbing/sessions/${sessionId}/generate-tts`)
      .set("Authorization", `Bearer ${token}`)
      .send({ ttsProvider: "mock" });
    expect(tts.status).toBe(201);
    const ready = tts.body.session.segments.filter(
      (s: { generatedAudioMediaId?: string }) => s.generatedAudioMediaId,
    );
    expect(ready.length).toBeGreaterThan(0);
  });

  it("rejects Khmer when voice/provider unsupported", async () => {
    const km = await request(app.getHttpServer())
      .post(`/v1/projects/${projectId}/dubbing/sessions`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        mediaAssetId: mediaId,
        subtitleSetId,
        targetLanguage: "km",
        ttsProvider: "mock",
      });
    expect(km.status).toBe(201);
    const voices = await request(app.getHttpServer())
      .get(`/v1/projects/${projectId}/dubbing/voices`)
      .set("Authorization", `Bearer ${token}`);
    const kmVoice = voices.body.find(
      (v: { language: string }) => v.language === "km",
    );
    const bad = await request(app.getHttpServer())
      .post(
        `/v1/projects/${projectId}/dubbing/sessions/${km.body.id}/assign-voice`,
      )
      .set("Authorization", `Bearer ${token}`)
      .send({
        speakerId: "speaker_male",
        voiceCharacterId: kmVoice.id,
      });
    expect(bad.status).toBe(400);
    expect(String(bad.body.message)).toMatch(/Khmer|not available|provider/i);
  });

  it("mixes and exports playable dubbed MP4", async () => {
    const start = await request(app.getHttpServer())
      .post(`/v1/projects/${projectId}/dubbing/sessions/${sessionId}/export`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
    expect(start.status).toBe(201);
    const jobId = start.body.jobId as string;

    let status = "QUEUED";
    for (let i = 0; i < 90 && status !== "SUCCEEDED" && status !== "FAILED"; i++) {
      await new Promise((r) => setTimeout(r, 400));
      const job = await request(app.getHttpServer())
        .get(`/v1/jobs/${jobId}`)
        .set("Authorization", `Bearer ${token}`);
      status = job.body.status;
      if (status === "FAILED") {
        throw new Error(job.body.error ?? "mix failed");
      }
    }
    expect(status).toBe("SUCCEEDED");

    const download = await request(app.getHttpServer())
      .get(
        `/v1/projects/${projectId}/dubbing/sessions/${sessionId}/export/jobs/${jobId}/download`,
      )
      .set("Authorization", `Bearer ${token}`)
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(Buffer.from(c)));
        res.on("end", () => cb(null, Buffer.concat(chunks)));
      });
    expect(download.status).toBe(200);
    const body = download.body as Buffer;
    expect(body.length).toBeGreaterThan(2000);

    downloadedPath = path.join(os.tmpdir(), `sarupak-dub-out-${jobId}.mp4`);
    await fs.writeFile(downloadedPath, body);

    const probe = spawnSync(
      "ffprobe",
      [
        "-v",
        "quiet",
        "-print_format",
        "json",
        "-show_format",
        "-show_streams",
        downloadedPath,
      ],
      { encoding: "utf8" },
    );
    expect(probe.status).toBe(0);
    const info = JSON.parse(probe.stdout) as {
      format?: { duration?: string };
      streams?: Array<{ codec_type?: string }>;
    };
    expect(info.streams?.some((s) => s.codec_type === "video")).toBe(true);
    expect(info.streams?.some((s) => s.codec_type === "audio")).toBe(true);
    expect(Number(info.format?.duration ?? 0)).toBeGreaterThan(1);
  }, 180000);

  it("blocks other users from session access", async () => {
    const other = await request(app.getHttpServer())
      .post("/v1/auth/register")
      .send({
        email: `phase4_other_${Date.now()}@example.com`,
        password: "testpass123",
      });
    const denied = await request(app.getHttpServer())
      .get(`/v1/projects/${projectId}/dubbing/sessions/${sessionId}`)
      .set("Authorization", `Bearer ${other.body.accessToken}`);
    expect([403, 404]).toContain(denied.status);
  });
});
