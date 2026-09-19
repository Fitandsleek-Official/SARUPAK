import { Controller, Get, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaModule } from "../prisma/prisma.module";
import { PrismaService } from "../prisma/prisma.service";

/** Stable local defaults — see docs/development/PORTS.md */
export const SARUPAK_SERVICE_ID = "sarupak-api" as const;
export const SARUPAK_API_VERSION = "0.5.2" as const;
export const SARUPAK_DEFAULT_PORT = 4003 as const;

@Controller("health")
export class HealthController {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  check() {
    const port = Number(
      this.config.get("PORT") ?? SARUPAK_DEFAULT_PORT,
    );
    const database = this.prisma.isDatabaseConnected() ? "up" : "down";
    return {
      // Always "ok" for Railway liveness while the HTTP server is up.
      status: "ok",
      service: SARUPAK_SERVICE_ID,
      /** Alias used by frontend identity checks */
      name: SARUPAK_SERVICE_ID,
      version: SARUPAK_API_VERSION,
      phase: "5.2",
      port,
      expectedDevPort: SARUPAK_DEFAULT_PORT,
      database,
      timestamp: new Date().toISOString(),
    };
  }
}

@Module({
  imports: [PrismaModule],
  controllers: [HealthController],
})
export class HealthModule {}
