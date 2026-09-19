import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { App } from "supertest/types";
import {
  addClip,
  createEmptyTimeline,
  splitClip,
  trimClip,
} from "@sarupak/editor-core";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";

/**
 * End-to-end Phase 2 workflow:
 * Import → probe → timeline trim/split → save → export → download → ffprobe playable.
 */
describe("Phase 2 editor workflow (e2e)", () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const email = `phase2_flow_${Date.now()}@example.com`;
  const password = "testpass123";
  let token = "";
  let projectId = "";
  let mediaId = "";
  let samplePath = "";
  let downloadedPath = "";

  beforeAll(async () => {
    samplePath = path.join(os.tmpdir(), `sarupak-flow-${Date.now()}.mp4`);
    const gen = spawnSync(
      "ffmpeg",
      [
        "-y",
        "-f",
        "lavfi",
        "-i",
        "color=c=blue:s=640x360:d=4",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=440:duration=4",
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
      throw new Error(`ffmpeg sample generation failed: ${gen.stderr}`);
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

  it("registers, creates project, uploads MP4 with probed metadata", async () => {
    const reg = await request(app.getHttpServer())
      .post("/v1/auth/register")
      .send({ email, password, displayName: "Flow" });
    expect(reg.status).toBe(201);
    token = reg.body.accessToken;

    const project = await request(app.getHttpServer())
      .post("/v1/projects")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Flow Edit", width: 1280, height: 720, frameRate: 30 });
    expect(project.status).toBe(201);
    projectId = project.body.id;

    const upload = await request(app.getHttpServer())
      .post(`/v1/projects/${projectId}/media`)
      .set("Authorization", `Bearer ${token}`)
      .attach("file", samplePath);
    expect(upload.status).toBe(201);
    expect(upload.body.kind).toBe("VIDEO");
    expect(upload.body.durationMs).toBeGreaterThan(3000);
    expect(upload.body.width).toBe(640);
    expect(upload.body.height).toBe(360);
    mediaId = upload.body.id;
  });

  it("rejects export on empty timeline", async () => {
    const res = await request(app.getHttpServer())
      .post(`/v1/projects/${projectId}/export`)
      .set("Authorization", `Bearer ${token}`)
      .send({ aspect: "16:9" });
    expect(res.status).toBe(400);
    expect(String(res.body.message)).toMatch(/empty/i);
  });

  it("adds clip, trims, splits, and saves project", async () => {
    let timeline = createEmptyTimeline();
    const video = timeline.tracks.find((t) => t.kind === "video")!;
    timeline = addClip(timeline, video.id, {
      id: "clip_main",
      mediaAssetId: mediaId,
      startMs: 0,
      durationMs: 4000,
      trimInMs: 0,
      trimOutMs: 4000,
      volume: 1,
      label: "main",
    });
    // Trim in to 500ms, out to 3000ms on timeline → duration 2500, trimIn 500
    timeline = trimClip(timeline, "clip_main", "in", 500);
    timeline = trimClip(timeline, "clip_main", "out", 3000);
    const trimmed = timeline.tracks
      .find((t) => t.id === video.id)!
      .clips.find((c) => c.id === "clip_main")!;
    expect(trimmed.startMs).toBe(500);
    expect(trimmed.durationMs).toBe(2500);
    expect(trimmed.trimInMs).toBe(500);

    // Split at 1500ms playhead
    timeline = splitClip(timeline, "clip_main", 1500);
    const clips = timeline.tracks.find((t) => t.id === video.id)!.clips;
    expect(clips.length).toBe(2);
    expect(clips[0]!.durationMs).toBe(1000);
    expect(clips[1]!.startMs).toBe(1500);

    const save = await request(app.getHttpServer())
      .patch(`/v1/projects/${projectId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        timeline,
        durationMs: 3000,
        createSnapshot: true,
        snapshotLabel: "after-edit",
      });
    expect(save.status).toBe(200);
    expect(save.body.timeline.tracks.find((t: { kind: string }) => t.kind === "video").clips.length).toBe(2);
    expect(save.body.durationMs).toBe(3000);

    const loaded = await request(app.getHttpServer())
      .get(`/v1/projects/${projectId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(loaded.status).toBe(200);
    expect(
      loaded.body.timeline.tracks.find((t: { kind: string }) => t.kind === "video")
        .clips.length,
    ).toBe(2);
  });

  it("exports MP4, downloads, and verifies playable A/V", async () => {
    const start = await request(app.getHttpServer())
      .post(`/v1/projects/${projectId}/export`)
      .set("Authorization", `Bearer ${token}`)
      .send({ aspect: "16:9" });
    expect(start.status).toBe(201);
    expect(start.body.type).toBe("RENDER");
    const jobId = start.body.id as string;

    let status = start.body.status as string;
    let progress = 0;
    for (let i = 0; i < 90 && status !== "SUCCEEDED" && status !== "FAILED"; i++) {
      await new Promise((r) => setTimeout(r, 400));
      const job = await request(app.getHttpServer())
        .get(`/v1/jobs/${jobId}`)
        .set("Authorization", `Bearer ${token}`);
      expect(job.status).toBe(200);
      status = job.body.status;
      progress = job.body.progress;
      if (status === "FAILED") {
        throw new Error(job.body.error ?? "export failed");
      }
    }
    expect(status).toBe("SUCCEEDED");
    expect(progress).toBe(1);

    const download = await request(app.getHttpServer())
      .get(`/v1/projects/${projectId}/export/jobs/${jobId}/download`)
      .set("Authorization", `Bearer ${token}`)
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(Buffer.from(c)));
        res.on("end", () => cb(null, Buffer.concat(chunks)));
      });
    expect(download.status).toBe(200);
    expect(download.headers["content-type"]).toMatch(/video\/mp4/);
    const body = download.body as Buffer;
    expect(body.length).toBeGreaterThan(5000);

    downloadedPath = path.join(os.tmpdir(), `sarupak-out-${jobId}.mp4`);
    await fs.writeFile(downloadedPath, body);
    const st = await fs.stat(downloadedPath);
    expect(st.size).toBeGreaterThan(5000);

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
      streams?: Array<{ codec_type?: string; codec_name?: string }>;
    };
    const hasVideo = info.streams?.some(
      (s) => s.codec_type === "video" && s.codec_name === "h264",
    );
    const hasAudio = info.streams?.some(
      (s) => s.codec_type === "audio" && (s.codec_name === "aac" || !!s.codec_name),
    );
    expect(hasVideo).toBe(true);
    expect(hasAudio).toBe(true);
    const duration = Number(info.format?.duration ?? 0);
    // Trimmed/split timeline ends ~3.0s
    expect(duration).toBeGreaterThan(2.0);
    expect(duration).toBeLessThan(5.5);
  }, 180000);

  it("surfaces export failure when source media is corrupt", async () => {
    const asset = await prisma.mediaAsset.findUnique({ where: { id: mediaId } });
    expect(asset).toBeTruthy();
    const storageRoot = path.resolve(
      process.cwd(),
      process.env.STORAGE_LOCAL_PATH ?? "./storage",
    );
    const mediaPath = path.join(storageRoot, asset!.storageKey);
    await fs.writeFile(mediaPath, Buffer.from("not-a-valid-mp4"));

    const start = await request(app.getHttpServer())
      .post(`/v1/projects/${projectId}/export`)
      .set("Authorization", `Bearer ${token}`)
      .send({ aspect: "16:9" });
    expect(start.status).toBe(201);
    const jobId = start.body.id as string;

    let status = start.body.status as string;
    let error = "";
    for (let i = 0; i < 60 && status !== "SUCCEEDED" && status !== "FAILED"; i++) {
      await new Promise((r) => setTimeout(r, 300));
      const job = await request(app.getHttpServer())
        .get(`/v1/jobs/${jobId}`)
        .set("Authorization", `Bearer ${token}`);
      status = job.body.status;
      error = job.body.error ?? "";
    }
    expect(status).toBe("FAILED");
    expect(error.length).toBeGreaterThan(0);

    const download = await request(app.getHttpServer())
      .get(`/v1/projects/${projectId}/export/jobs/${jobId}/download`)
      .set("Authorization", `Bearer ${token}`);
    expect(download.status).toBe(400);

    const missing = await request(app.getHttpServer())
      .get(`/v1/projects/${projectId}/export/jobs/does-not-exist/download`)
      .set("Authorization", `Bearer ${token}`);
    expect(missing.status).toBe(404);
  });
});
