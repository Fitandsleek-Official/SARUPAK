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

describe("Subtitles workflow (e2e)", () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const email = `phase3_${Date.now()}@example.com`;
  const password = "testpass123";
  let token = "";
  let projectId = "";
  let mediaId = "";
  let setId = "";
  let samplePath = "";
  const prevProvider = process.env.STT_PROVIDER;

  beforeAll(async () => {
    process.env.STT_PROVIDER = "mock";

    samplePath = path.join(os.tmpdir(), `sarupak-sub-${Date.now()}.mp4`);
    const gen = spawnSync(
      "ffmpeg",
      [
        "-y",
        "-f",
        "lavfi",
        "-i",
        "color=c=green:s=320x240:d=3",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=880:duration=3",
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
    if (prevProvider === undefined) delete process.env.STT_PROVIDER;
    else process.env.STT_PROVIDER = prevProvider;

    if (prisma) {
      const user = await prisma.user.findUnique({ where: { email } });
      if (user) await prisma.user.delete({ where: { id: user.id } });
    }
    await app.close();
    await fs.unlink(samplePath).catch(() => undefined);
  });

  it("creates project and uploads media", async () => {
    const reg = await request(app.getHttpServer())
      .post("/v1/auth/register")
      .send({ email, password, displayName: "Phase3" });
    expect(reg.status).toBe(201);
    token = reg.body.accessToken;

    const project = await request(app.getHttpServer())
      .post("/v1/projects")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Subs", width: 1280, height: 720 });
    expect(project.status).toBe(201);
    projectId = project.body.id;

    const upload = await request(app.getHttpServer())
      .post(`/v1/projects/${projectId}/media`)
      .set("Authorization", `Bearer ${token}`)
      .attach("file", samplePath);
    expect(upload.status).toBe(201);
    mediaId = upload.body.id;
  });

  it("generates editable subtitles via STT adapter", async () => {
    const gen = await request(app.getHttpServer())
      .post(`/v1/projects/${projectId}/subtitles/generate`)
      .set("Authorization", `Bearer ${token}`)
      .send({ mediaAssetId: mediaId, language: "en" });
    expect(gen.status).toBe(201);
    expect(gen.body.provider).toBe("mock");
    expect(gen.body.subtitleSet.segments.length).toBeGreaterThan(0);
    setId = gen.body.subtitleSet.id;

    const first = gen.body.subtitleSet.segments[0];
    const patched = await request(app.getHttpServer())
      .patch(
        `/v1/projects/${projectId}/subtitles/${setId}/segments/${first.id}`,
      )
      .set("Authorization", `Bearer ${token}`)
      .send({ text: "Edited cue" });
    expect(patched.status).toBe(200);
    expect(
      patched.body.segments.find((s: { id: string }) => s.id === first.id).text,
    ).toBe("Edited cue");
  });

  it("exports SRT and VTT", async () => {
    const srt = await request(app.getHttpServer())
      .get(`/v1/projects/${projectId}/subtitles/${setId}/export.srt`)
      .set("Authorization", `Bearer ${token}`);
    expect(srt.status).toBe(200);
    expect(srt.text).toMatch(/-->/);
    expect(srt.text).toMatch(/Edited cue/);

    const vtt = await request(app.getHttpServer())
      .get(`/v1/projects/${projectId}/subtitles/${setId}/export.vtt`)
      .set("Authorization", `Bearer ${token}`);
    expect(vtt.status).toBe(200);
    expect(vtt.text).toMatch(/^WEBVTT/);
  });

  it("burns subtitles into MP4", async () => {
    const start = await request(app.getHttpServer())
      .post(`/v1/projects/${projectId}/subtitles/${setId}/burn-in`)
      .set("Authorization", `Bearer ${token}`)
      .send({ mediaAssetId: mediaId });
    expect(start.status).toBe(201);
    const jobId = start.body.id as string;

    let status = start.body.status as string;
    for (let i = 0; i < 80 && status !== "SUCCEEDED" && status !== "FAILED"; i++) {
      await new Promise((r) => setTimeout(r, 400));
      const job = await request(app.getHttpServer())
        .get(`/v1/jobs/${jobId}`)
        .set("Authorization", `Bearer ${token}`);
      status = job.body.status;
      if (status === "FAILED") {
        throw new Error(job.body.error ?? "burn-in failed");
      }
    }
    expect(status).toBe("SUCCEEDED");

    const download = await request(app.getHttpServer())
      .get(`/v1/projects/${projectId}/subtitles/burn-in/${jobId}/download`)
      .set("Authorization", `Bearer ${token}`);
    expect(download.status).toBe(200);
    expect(download.headers["content-type"]).toMatch(/video\/mp4/);
    expect(download.body.length).toBeGreaterThan(500);
  }, 120000);
});
