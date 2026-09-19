import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildStorageKey,
  sanitizeFileName,
  validateUpload,
} from "./index";

describe("sanitizeFileName", () => {
  it("strips path traversal", () => {
    assert.equal(sanitizeFileName("../../etc/passwd"), "passwd");
  });

  it("falls back when empty", () => {
    assert.equal(sanitizeFileName("///"), "upload.bin");
  });
});

describe("displayFileName", () => {
  it("keeps Unicode display names", async () => {
    const { displayFileName } = await import("./index");
    assert.equal(displayFileName("វីដេអូ.mp4"), "វីដេអូ.mp4");
  });
});

describe("validateUpload", () => {
  it("accepts mp4 video", () => {
    const result = validateUpload({
      mimeType: "video/mp4",
      originalName: "clip.mp4",
      sizeBytes: 1024,
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.kind, "VIDEO");
    }
  });

  it("rejects oversized files", () => {
    const result = validateUpload({
      mimeType: "video/mp4",
      originalName: "big.mp4",
      sizeBytes: 10,
      maxBytes: 5,
    });
    assert.equal(result.ok, false);
  });

  it("rejects unsupported mime", () => {
    const result = validateUpload({
      mimeType: "application/x-msdownload",
      originalName: "x.exe",
      sizeBytes: 100,
    });
    assert.equal(result.ok, false);
  });
});

describe("buildStorageKey", () => {
  it("uses posix-safe key", () => {
    const key = buildStorageKey({
      userId: "u1",
      projectId: "p1",
      assetId: "a1",
      safeBaseName: "clip.mp4",
    });
    assert.equal(key, "users/u1/projects/p1/a1.mp4");
  });
});
