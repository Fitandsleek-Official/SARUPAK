import { Global, Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { LocalStorageService } from "./local-storage.service";
import { STORAGE_SERVICE } from "./storage.tokens";

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: STORAGE_SERVICE,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const driver = config.get<string>("STORAGE_DRIVER") ?? "local";
        if (driver !== "local") {
          // Phase 1: local only. S3/MinIO adapter lands with production storage.
          throw new Error(
            `STORAGE_DRIVER=${driver} is not implemented yet. Use local.`,
          );
        }
        return new LocalStorageService(config);
      },
    },
  ],
  exports: [STORAGE_SERVICE],
})
export class StorageModule {}
