import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { App } from "supertest/types";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";

describe("Auth + Projects (e2e)", () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const email = `phase1_${Date.now()}@example.com`;
  const password = "testpass123";
  let token = "";
  let projectId = "";

  beforeAll(async () => {
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
  });

  afterAll(async () => {
    if (prisma) {
      const user = await prisma.user.findUnique({ where: { email } });
      if (user) {
        await prisma.user.delete({ where: { id: user.id } });
      }
    }
    await app.close();
  });

  it("GET /v1/health", async () => {
    const res = await request(app.getHttpServer()).get("/v1/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.service).toBe("sarupak-api");
    expect(res.body.version).toBeTruthy();
  });

  it("registers a user", async () => {
    const res = await request(app.getHttpServer())
      .post("/v1/auth/register")
      .send({ email, password, displayName: "Phase1 Tester" });
    expect(res.status).toBe(201);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.user.email).toBe(email);
    token = res.body.accessToken;
  });

  it("rejects duplicate registration", async () => {
    const res = await request(app.getHttpServer())
      .post("/v1/auth/register")
      .send({ email, password });
    expect(res.status).toBe(409);
  });

  it("logs in", async () => {
    const res = await request(app.getHttpServer())
      .post("/v1/auth/login")
      .send({ email, password });
    expect(res.status).toBe(201);
    token = res.body.accessToken;
  });

  it("creates a project", async () => {
    const res = await request(app.getHttpServer())
      .post("/v1/projects")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Demo Reel", width: 1080, height: 1920, frameRate: 30 });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe("Demo Reel");
    expect(res.body.timeline.tracks.length).toBeGreaterThan(0);
    projectId = res.body.id;
  });

  it("lists projects for owner", async () => {
    const res = await request(app.getHttpServer())
      .get("/v1/projects")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.some((p: { id: string }) => p.id === projectId)).toBe(true);
  });

  it("autosaves timeline with snapshot", async () => {
    const res = await request(app.getHttpServer())
      .patch(`/v1/projects/${projectId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        durationMs: 5000,
        createSnapshot: true,
        snapshotLabel: "autosave-test",
        timeline: {
          schemaVersion: 1,
          playheadMs: 1000,
          zoom: 1.5,
          tracks: [],
        },
      });
    expect(res.status).toBe(200);
    expect(res.body.durationMs).toBe(5000);
    expect(res.body.timeline.playheadMs).toBe(1000);
  });

  it("rejects unauthorized project access", async () => {
    const res = await request(app.getHttpServer()).get(
      `/v1/projects/${projectId}`,
    );
    expect(res.status).toBe(401);
  });

  it("uploads media and queues probe job", async () => {
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64",
    );
    const res = await request(app.getHttpServer())
      .post(`/v1/projects/${projectId}/media`)
      .set("Authorization", `Bearer ${token}`)
      .attach("file", png, { filename: "dot.png", contentType: "image/png" });
    expect(res.status).toBe(201);
    expect(res.body.kind).toBe("IMAGE");

    const jobs = await request(app.getHttpServer())
      .get(`/v1/projects/${projectId}/jobs`)
      .set("Authorization", `Bearer ${token}`);
    expect(jobs.status).toBe(200);
    expect(jobs.body.some((j: { type: string }) => j.type === "PROBE")).toBe(
      true,
    );
  });

  it("deletes project", async () => {
    const res = await request(app.getHttpServer())
      .delete(`/v1/projects/${projectId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
  });
});
