import path from "node:path";

export const DEFAULT_MAX_UPLOAD_BYTES = 500 * 1024 * 1024; // 500 MB

export const ALLOWED_MIME_TYPES = {
  VIDEO: new Set([
    "video/mp4",
    "video/webm",
    "video/quicktime",
    "video/x-msvideo",
    "video/x-matroska",
  ]),
  AUDIO: new Set([
    "audio/mpeg",
    "audio/mp4",
    "audio/wav",
    "audio/x-wav",
    "audio/webm",
    "audio/ogg",
    "audio/aac",
  ]),
  IMAGE: new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]),
} as const;

export type UploadMediaKind = keyof typeof ALLOWED_MIME_TYPES;

export interface MediaValidationResult {
  ok: true;
  kind: UploadMediaKind;
  /** ASCII-safe name for storage keys / Content-Disposition fallback. */
  safeBaseName: string;
  /** Original basename for UI (Unicode preserved). */
  displayName: string;
}

export interface MediaValidationError {
  ok: false;
  reason: string;
}

export function inferKindFromMime(mimeType: string): UploadMediaKind | null {
  const normalized = mimeType.toLowerCase().split(";")[0]?.trim() ?? "";
  for (const kind of Object.keys(ALLOWED_MIME_TYPES) as UploadMediaKind[]) {
    if (ALLOWED_MIME_TYPES[kind].has(normalized)) {
      return kind;
    }
  }
  return null;
}

/** Strip path segments and unsafe characters for storage filenames (ASCII-safe). */
export function sanitizeFileName(originalName: string): string {
  const base = path.basename(originalName).replace(/[^\w.\-()+\s]/g, "_");
  const trimmed = base.trim().slice(0, 180);
  return trimmed.length > 0 ? trimmed : "upload.bin";
}

/**
 * Human-facing filename for UI — keeps Unicode (Khmer, CJK, …).
 * Only strips path segments and control characters.
 */
export function displayFileName(originalName: string): string {
  const base = path
    .basename(originalName)
    .replace(/[\0\r\n\t]/g, "")
    .trim()
    .slice(0, 180);
  return base.length > 0 ? base : "upload.bin";
}

export function validateUpload(input: {
  mimeType: string;
  originalName: string;
  sizeBytes: number;
  maxBytes?: number;
}): MediaValidationResult | MediaValidationError {
  const maxBytes = input.maxBytes ?? DEFAULT_MAX_UPLOAD_BYTES;
  if (!Number.isFinite(input.sizeBytes) || input.sizeBytes <= 0) {
    return { ok: false, reason: "File is empty or size is invalid." };
  }
  if (input.sizeBytes > maxBytes) {
    return {
      ok: false,
      reason: `File exceeds maximum size of ${maxBytes} bytes.`,
    };
  }
  const kind = inferKindFromMime(input.mimeType);
  if (!kind) {
    return {
      ok: false,
      reason: `Unsupported media type: ${input.mimeType || "unknown"}.`,
    };
  }
  return {
    ok: true,
    kind,
    safeBaseName: sanitizeFileName(input.originalName),
    displayName: displayFileName(input.originalName),
  };
}

/** Build a storage-relative key; never use raw user path input. */
export function buildStorageKey(parts: {
  userId: string;
  projectId: string;
  assetId: string;
  safeBaseName: string;
}): string {
  const ext = path.extname(parts.safeBaseName).toLowerCase() || ".bin";
  return path.posix.join(
    "users",
    parts.userId,
    "projects",
    parts.projectId,
    `${parts.assetId}${ext}`,
  );
}
