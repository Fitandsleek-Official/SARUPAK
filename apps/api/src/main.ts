import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AppModule } from "./app.module";
import { SARUPAK_DEFAULT_PORT } from "./health/health.module";

const DEFAULT_CORS = [
  "http://localhost:3010",
  "http://127.0.0.1:3010",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "https://sarupak.vercel.app",
].join(",");

function isAllowedOrigin(origin: string, configured: string[]): boolean {
  if (configured.includes(origin)) return true;
  // Vercel production + preview deployments
  try {
    const host = new URL(origin).hostname;
    if (host === "sarupak.vercel.app" || host.endsWith(".vercel.app")) {
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

async function bootstrap() {
  // Prefer Railway-injected PORT over any stale local default.
  const port = Number(
    process.env.PORT ?? SARUPAK_DEFAULT_PORT,
  );

  const app = await NestFactory.create(AppModule, { rawBody: false });
  const config = app.get(ConfigService);

  const origins = (config.get<string>("CORS_ORIGINS") ?? DEFAULT_CORS)
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);

  app.enableCors({
    origin: (origin, callback) => {
      // Non-browser / same-origin tools send no Origin
      if (!origin || isAllowedOrigin(origin, origins)) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
    credentials: true,
  });

  app.setGlobalPrefix("v1");
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Railway / Docker: must bind all interfaces (not only localhost).
  await app.listen(port, "0.0.0.0");
  // eslint-disable-next-line no-console
  console.log(
    `SARUPAK API listening on 0.0.0.0:${port}/v1 (health: /v1/health)`,
  );
}

void bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("SARUPAK API failed to start:", err);
  process.exit(1);
});
