import { Test } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import request from "supertest";
import { App } from "supertest/types";
import { AppModule } from "../src/app.module";
import {
  SARUPAK_API_VERSION,
  SARUPAK_DEFAULT_PORT,
  SARUPAK_SERVICE_ID,
} from "../src/health/health.module";

describe("SARUPAK API smoke (identity)", () => {
  let app: INestApplication<App>;

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
  });

  afterAll(async () => {
    await app.close();
  });

  it("health returns SARUPAK service identity and version", async () => {
    const res = await request(app.getHttpServer()).get("/v1/health");
    expect(res.status).toBe(200);
    expect(res.body.service).toBe(SARUPAK_SERVICE_ID);
    expect(res.body.name).toBe(SARUPAK_SERVICE_ID);
    expect(res.body.status).toBe("ok");
    expect(res.body.version).toBe(SARUPAK_API_VERSION);
    expect(res.body.expectedDevPort).toBe(SARUPAK_DEFAULT_PORT);
    expect(res.body.phase).toBeDefined();
    // Must not look like the unrelated Norng Downloader API
    expect(JSON.stringify(res.body)).not.toMatch(/Norng/i);
  });
});
