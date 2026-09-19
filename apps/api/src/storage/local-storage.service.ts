import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { StorageService } from "./storage.tokens";

@Injectable()
export class LocalStorageService implements StorageService {
  private readonly root: string;
  private readonly logger = new Logger(LocalStorageService.name);

  constructor(config: ConfigService) {
    const configured =
      config.get<string>("STORAGE_LOCAL_PATH") ?? "./storage";
    this.root = path.isAbsolute(configured)
      ? configured
      : path.resolve(process.cwd(), configured);
    void fs.mkdir(this.root, { recursive: true }).then(
      () => {
        this.logger.log(`Local storage root: ${this.root}`);
      },
      (err: unknown) => {
        this.logger.error(
          `Failed to create storage root ${this.root}: ${String(err)}`,
        );
      },
    );
  }

  private resolveSafe(key: string): string {
    const normalized = key.replace(/\\/g, "/").replace(/^\/+/, "");
    if (
      normalized.includes("..") ||
      path.isAbsolute(normalized) ||
      normalized.includes("\0")
    ) {
      throw new Error("Invalid storage key.");
    }
    const full = path.resolve(this.root, normalized);
    if (!full.startsWith(this.root + path.sep) && full !== this.root) {
      throw new Error("Storage path escape blocked.");
    }
    return full;
  }

  async putObject(key: string, data: Buffer, _mimeType: string): Promise<void> {
    const full = this.resolveSafe(key);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, data);
    this.logger.debug(`Stored ${key} (${data.length} bytes)`);
  }

  async getObject(key: string): Promise<Buffer> {
    return fs.readFile(this.resolveSafe(key));
  }

  async deleteObject(key: string): Promise<void> {
    try {
      await fs.unlink(this.resolveSafe(key));
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") {
        throw err;
      }
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      await fs.access(this.resolveSafe(key));
      return true;
    } catch {
      return false;
    }
  }

  resolvePath(key: string): string {
    return this.resolveSafe(key);
  }

  getRoot(): string {
    return this.root;
  }
}
