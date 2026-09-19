import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);
  private connected = false;

  isDatabaseConnected(): boolean {
    return this.connected;
  }

  async onModuleInit() {
    const url = process.env.DATABASE_URL ?? "";
    this.logDatabaseTarget(url);

    try {
      await this.$connect();
      this.connected = true;
      this.logger.log("Postgres connected");
    } catch (err) {
      this.connected = false;
      // Do not crash boot — Railway needs /v1/health to answer or the edge returns 502.
      this.logger.error(
        "Postgres $connect failed. API will stay up for /v1/health; DB routes will fail until DATABASE_URL points at the Postgres service (not the API hostname).",
      );
      this.logger.error(err instanceof Error ? err.message : String(err));
    }
  }

  async onModuleDestroy() {
    if (this.connected) {
      await this.$disconnect();
    }
  }

  private logDatabaseTarget(url: string) {
    if (!url) {
      this.logger.error("DATABASE_URL is empty");
      return;
    }
    try {
      const parsed = new URL(url);
      this.logger.log(
        `DATABASE_URL host=${parsed.hostname} port=${parsed.port || "5432"} db=${parsed.pathname.replace(/^\//, "")}`,
      );
      const host = parsed.hostname.toLowerCase();
      if (host.includes("sarupakapi") || host.endsWith(".up.railway.app")) {
        this.logger.warn(
          `DATABASE_URL host "${parsed.hostname}" looks like the API (or public) host, not Postgres. In Railway Variables set DATABASE_URL = \${{Postgres.DATABASE_URL}} (or your Postgres service name).`,
        );
      }
    } catch {
      this.logger.error("DATABASE_URL is not a valid URL");
    }
  }
}
