export const STORAGE_SERVICE = Symbol("STORAGE_SERVICE");

export interface StorageService {
  putObject(key: string, data: Buffer, mimeType: string): Promise<void>;
  getObject(key: string): Promise<Buffer>;
  deleteObject(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  /** Absolute filesystem path for local driver (FFmpeg). */
  resolvePath?(key: string): string;
}
