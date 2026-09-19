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
].join(",");

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: false });
  const config = app.get(ConfigService);

  const origins = (config.get<string>("CORS_ORIGINS") ?? DEFAULT_CORS)
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);

  app.enableCors({
    origin: origins,
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

  const port = Number(config.get("PORT") ?? SARUPAK_DEFAULT_PORT);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(
    `SARUPAK API (${SARUPAK_DEFAULT_PORT === port ? "dev-default" : "custom"}) listening on http://localhost:${port}/v1`,
  );
  // eslint-disable-next-line no-console
  console.log(`Health: http://localhost:${port}/v1/health`);
}

void bootstrap();
