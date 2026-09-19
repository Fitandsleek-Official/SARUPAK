import { Controller, Get, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

/** Stable local defaults — see docs/development/PORTS.md */
export const SARUPAK_SERVICE_ID = "sarupak-api" as const;
export const SARUPAK_API_VERSION = "0.5.2" as const;
export const SARUPAK_DEFAULT_PORT = 4003 as const;

@Controller("health")
export class HealthController {
  constructor(private readonly config: ConfigService) {}

  @Get()
  check() {
    const port = Number(
      this.config.get("PORT") ?? SARUPAK_DEFAULT_PORT,
    );
    return {
      status: "ok",
      service: SARUPAK_SERVICE_ID,
      /** Alias used by frontend identity checks */
      name: SARUPAK_SERVICE_ID,
      version: SARUPAK_API_VERSION,
      phase: "5.2",
      port,
      expectedDevPort: SARUPAK_DEFAULT_PORT,
      timestamp: new Date().toISOString(),
    };
  }
}

@Module({
  controllers: [HealthController],
})
export class HealthModule {}
