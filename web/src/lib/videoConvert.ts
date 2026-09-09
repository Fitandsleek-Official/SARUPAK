export type FrameRate = 24 | 30 | 48 | 60 | 120 | 240;

export type ResolutionId =
  | "original"
  | "hd720"
  | "hd"
  | "2k"
  | "4k"
  | "8k"
  | "vhd"
  | "v720";

export type QualityId = "high" | "balanced" | "compress";

export type PostTargetId = "tiktok120" | "tiktok60" | "facebook" | "custom";

export interface FrameRateOption {
  fps: FrameRate;
  label: string;
  hint: string;
}

export interface ResolutionOption {
  id: ResolutionId;
  label: string;
  hint: string;
  width: number | null;
  height: number | null;
}

export const FRAME_RATES: FrameRateOption[] = [
  { fps: 24, label: "24 FPS", hint: "Film standard" },
  { fps: 30, label: "30 FPS", hint: "Web / broadcast standard" },
  { fps: 48, label: "48 FPS", hint: "High frame rate cinema" },
  { fps: 60, label: "60 FPS", hint: "Smooth gaming / web standard" },
  { fps: 120, label: "120 FPS", hint: "TikTok 120Hz / 120 FPS post" },
  { fps: 240, label: "240 FPS", hint: "Slow-motion ready (8x at 30fps)" },
];

export const RESOLUTIONS: ResolutionOption[] = [
  {
    id: "original",
    label: "Original",
    hint: "Keep source size",
    width: null,
    height: null,
  },
  {
    id: "vhd",
    label: "9:16 1080p",
    hint: "1080 x 1920 · TikTok / Reels",
    width: 1080,
    height: 1920,
  },
  {
    id: "v720",
    label: "9:16 720p",
    hint: "720 x 1280 · lighter upload",
    width: 720,
    height: 1280,
  },
  { id: "hd720", label: "HD 720p", hint: "1280 x 720", width: 1280, height: 720 },
  { id: "hd", label: "HD 1080p", hint: "1920 x 1080", width: 1920, height: 1080 },
  { id: "2k", label: "2K", hint: "2560 x 1440", width: 2560, height: 1440 },
  { id: "4k", label: "4K", hint: "3840 x 2160", width: 3840, height: 2160 },
  { id: "8k", label: "8K", hint: "7680 x 4320", width: 7680, height: 4320 },
];

export interface QualityOption {
  id: QualityId;
  label: string;
  hint: string;
}

export interface PostTargetOption {
  id: PostTargetId;
  label: string;
  hint: string;
  fps: FrameRate | null;
  resolution: ResolutionId | null;
  quality: QualityId | null;
}

export const QUALITY_LEVELS: QualityOption[] = [
  { id: "high", label: "High", hint: "Post quality · TikTok / Facebook" },
  { id: "balanced", label: "Balanced", hint: "Quality + file size" },
  { id: "compress", label: "Compress", hint: "Smaller file · faster upload" },
];

export const POST_TARGETS: PostTargetOption[] = [
  {
    id: "tiktok120",
    label: "TikTok 120Hz",
    hint: "1080×1920 · 120 FPS · High",
    fps: 120,
    resolution: "vhd",
    quality: "high",
  },
  {
    id: "tiktok60",
    label: "TikTok 60",
    hint: "1080×1920 · 60 FPS · High",
    fps: 60,
    resolution: "vhd",
    quality: "high",
  },
  {
    id: "facebook",
    label: "Facebook",
    hint: "1080p · 60 FPS · High",
    fps: 60,
    resolution: "hd",
    quality: "high",
  },
  {
    id: "custom",
    label: "Other",
    hint: "Pick FPS, size & compress yourself",
    fps: null,
    resolution: null,
    quality: null,
  },
];

export const MAX_UPLOAD_BYTES = 250 * 1024 * 1024;
export const WARN_UPLOAD_BYTES = 80 * 1024 * 1024;

const CORE_VERSION = "0.12.10";
const CORE_CDNS = [
  `https://cdn.jsdelivr.net/npm/@ffmpeg/core@${CORE_VERSION}/dist/umd`,
  `https://unpkg.com/@ffmpeg/core@${CORE_VERSION}/dist/umd`,
];

export interface VideoMeta {
  width: number;
  height: number;
  duration: number;
}

export interface ConvertProgress {
  phase: "engine" | "convert";
  percent: number;
  message: string;
}

export interface ConvertOptions {
  fps: FrameRate;
  resolution: ResolutionId;
  quality: QualityId;
  sourceMeta?: VideoMeta | null;
  onProgress?: (progress: ConvertProgress) => void;
  signal?: AbortSignal;
}

type FFmpegInstance = import("@ffmpeg/ffmpeg").FFmpeg;

let ffmpeg: FFmpegInstance | null = null;
let loadPromise: Promise<FFmpegInstance> | null = null;

function extensionOf(file: File): string {
  const fromName = file.name.split(".").pop()?.toLowerCase();
  if (fromName && /^[a-z0-9]{2,5}$/.test(fromName)) return fromName;
  const map: Record<string, string> = {
    "video/mp4": "mp4",
    "video/webm": "webm",
    "video/quicktime": "mov",
    "video/x-matroska": "mkv",
    "video/x-msvideo": "avi",
  };
  return map[file.type] ?? "mp4";
}

export function readVideoMeta(url: string): Promise<VideoMeta> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    video.onloadedmetadata = () => {
      resolve({
        width: video.videoWidth,
        height: video.videoHeight,
        duration: Number.isFinite(video.duration) ? video.duration : 0,
      });
    };
    video.onerror = () => {
      reject(new Error("Could not read this video. Try another file."));
    };
    video.src = url;
  });
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "—";
  const s = Math.round(seconds);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function resolutionOf(id: ResolutionId): ResolutionOption {
  return RESOLUTIONS.find((item) => item.id === id) ?? RESOLUTIONS[0];
}

function even(n: number): number {
  return Math.max(2, Math.round(n / 2) * 2);
}

function scaleFilter(
  width: number | null,
  height: number | null,
  source?: VideoMeta | null,
): string {
  if (!width || !height) {
    if (source?.width && source?.height) {
      return `scale=${even(source.width)}:${even(source.height)}`;
    }
    return "scale=trunc(iw/2)*2:trunc(ih/2)*2";
  }
  // Already exact size — avoid expensive pad/scale
  if (
    source &&
    even(source.width) === width &&
    even(source.height) === height
  ) {
    return `scale=${width}:${height}`;
  }
  return [
    `scale=${width}:${height}:force_original_aspect_ratio=decrease:flags=bilinear`,
    `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black`,
  ].join(",");
}

function buildVf(
  fps: FrameRate,
  resolution: ResolutionId,
  source?: VideoMeta | null,
): string {
  const target = resolutionOf(resolution);
  const scale = scaleFilter(target.width, target.height, source);
  // For high FPS, fps filter after scale keeps memory lower
  return `${scale},fps=${fps}`;
}

function encodePreset(
  fps: FrameRate,
  resolution: ResolutionId,
  quality: QualityId,
): { preset: string; crf: string; audio: string } {
  const heavy = resolution === "8k" || resolution === "4k" || fps >= 120;
  if (quality === "high") {
    return {
      preset: heavy ? "ultrafast" : "veryfast",
      crf: heavy ? "20" : "18",
      audio: "160k",
    };
  }
  if (quality === "compress") {
    return { preset: "ultrafast", crf: "28", audio: "96k" };
  }
  return {
    preset: heavy ? "ultrafast" : "veryfast",
    crf: "23",
    audio: "128k",
  };
}

function clampPercent(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(99, Math.max(0, Math.round(n)));
}

/**
 * CDN often omits Content-Length (total=-1). @ffmpeg/util then reports
 * received/-1 → giant negative % and can throw on length mismatch.
 */
async function fetchCoreBlob(
  url: string,
  mime: string,
  onBytes?: (received: number, total: number) => void,
  signal?: AbortSignal,
): Promise<string> {
  const resp = await fetch(url, { signal, mode: "cors", credentials: "omit" });
  if (!resp.ok) {
    throw new Error(`Download failed (${resp.status}) ${url}`);
  }

  const headerLen = Number.parseInt(resp.headers.get("Content-Length") || "", 10);
  const total = Number.isFinite(headerLen) && headerLen > 0 ? headerLen : -1;

  const reader = resp.body?.getReader();
  if (!reader) {
    const buf = await resp.arrayBuffer();
    onBytes?.(buf.byteLength, buf.byteLength);
    return URL.createObjectURL(new Blob([buf], { type: mime }));
  }

  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value?.length) {
      chunks.push(value);
      received += value.length;
      onBytes?.(received, total);
    }
  }

  const data = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    data.set(chunk, offset);
    offset += chunk.length;
  }
  onBytes?.(received, received > 0 ? received : total);
  return URL.createObjectURL(new Blob([data], { type: mime }));
}

async function toBlobFromCdn(
  file: "ffmpeg-core.js" | "ffmpeg-core.wasm",
  mime: string,
  onDownload?: (ratio: number | null, received: number) => void,
  signal?: AbortSignal,
): Promise<string> {
  let lastError: unknown;
  for (const base of CORE_CDNS) {
    try {
      return await fetchCoreBlob(
        `${base}/${file}`,
        mime,
        (received, total) => {
          if (!onDownload) return;
          if (total > 0) onDownload(Math.min(1, received / total), received);
          else onDownload(null, received);
        },
        signal,
      );
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("Could not download the FFmpeg engine.");
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(
        new Error(
          `${label} timed out after ${Math.round(ms / 1000)}s. Check network, then retry.`,
        ),
      );
    }, ms);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export async function getFFmpeg(
  onProgress?: (progress: ConvertProgress) => void,
): Promise<FFmpegInstance> {
  if (typeof window === "undefined") {
    throw new Error("Video converter runs in the browser only");
  }
  if (ffmpeg?.loaded) return ffmpeg;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    const { FFmpeg } = await import("@ffmpeg/ffmpeg");
    const next = new FFmpeg();
    const controller = new AbortController();
    onProgress?.({
      phase: "engine",
      percent: 4,
      message: "Loading converter engine (~31MB)…",
    });

    const coreURL = await withTimeout(
      toBlobFromCdn(
        "ffmpeg-core.js",
        "text/javascript",
        (ratio, received) =>
          onProgress?.({
            phase: "engine",
            percent:
              ratio != null
                ? clampPercent(ratio * 30)
                : clampPercent(4 + Math.min(26, received / (1024 * 1024))),
            message: "Loading converter engine (~31MB)…",
          }),
        controller.signal,
      ),
      90_000,
      "FFmpeg JS download",
    );

    const wasmURL = await withTimeout(
      toBlobFromCdn(
        "ffmpeg-core.wasm",
        "application/wasm",
        (ratio, received) =>
          onProgress?.({
            phase: "engine",
            percent:
              ratio != null
                ? clampPercent(30 + ratio * 55)
                : clampPercent(30 + Math.min(55, (received / (32 * 1024 * 1024)) * 55)),
            message: "Loading FFmpeg WASM…",
          }),
        controller.signal,
      ),
      180_000,
      "FFmpeg WASM download",
    );

    onProgress?.({
      phase: "engine",
      percent: 90,
      message: "Starting FFmpeg worker…",
    });

    await withTimeout(
      next.load({
        coreURL,
        wasmURL,
        classWorkerURL: `${window.location.origin}/ffmpeg/worker.js`,
      }),
      60_000,
      "FFmpeg worker start",
    );

    ffmpeg = next;
    onProgress?.({
      phase: "engine",
      percent: 100,
      message: "Engine ready",
    });
    return next;
  })();

  try {
    return await loadPromise;
  } catch (error) {
    loadPromise = null;
    ffmpeg = null;
    throw error;
  }
}

export function terminateFFmpeg(): void {
  ffmpeg?.terminate();
  ffmpeg = null;
  loadPromise = null;
}

async function safeDelete(instance: FFmpegInstance, path: string): Promise<void> {
  try {
    await instance.deleteFile(path);
  } catch {
    /* file may not exist */
  }
}

function summarizeLogs(logs: string[]): string {
  const interesting = logs
    .filter((line) =>
      /error|invalid|hevc|h265|hvc1|not open|unknown|fail|memory|abort/i.test(
        line,
      ),
    )
    .slice(-4);
  return interesting.join(" · ");
}

function humanizeFailure(logs: string[], fallback: string): Error {
  const blob = logs.join("\n").toLowerCase();
  if (/hevc|h265|hvc1|hev1/.test(blob)) {
    return new Error(
      "This iPhone/HEVC video needs a browser decode pass. Retrying…",
    );
  }
  if (/memory|out of memory|oom|aborted/.test(blob)) {
    return new Error(
      "Not enough browser memory for this setting. Try TikTok 60, 720p, or Compress.",
    );
  }
  const hint = summarizeLogs(logs);
  return new Error(hint ? `${fallback} (${hint})` : fallback);
}

async function runFFmpegExec(
  instance: FFmpegInstance,
  args: string[],
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<{ code: number; logs: string[] }> {
  const logs: string[] = [];
  const onLog = ({ message }: { message: string }) => {
    if (message) logs.push(message);
  };
  instance.on("log", onLog);
  try {
    const code = await instance.exec(args, timeoutMs, { signal });
    return { code, logs };
  } finally {
    instance.off("log", onLog);
  }
}

/**
 * Browser can decode HEVC (iPhone) even when ffmpeg.wasm cannot.
 * Record a mid-FPS H.264/WebM, then let ffmpeg raise FPS / finalize MP4.
 */
async function browserBridgeBlob(
  file: File,
  source: VideoMeta | null | undefined,
  targetW: number,
  targetH: number,
  onProgress?: (progress: ConvertProgress) => void,
): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const video = document.createElement("video");
    video.src = url;
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    await new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve();
      video.onerror = () =>
        reject(
          new Error(
            "Browser cannot decode this video (try Export as Most Compatible / H.264 on iPhone).",
          ),
        );
    });

    const srcW = video.videoWidth || source?.width || targetW;
    const srcH = video.videoHeight || source?.height || targetH;
    const canvas = document.createElement("canvas");
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("Canvas unavailable");

    const stream = canvas.captureStream(30);
    const mimeCandidates = [
      "video/webm;codecs=vp9",
      "video/webm;codecs=vp8",
      "video/webm",
      "video/mp4",
    ];
    const mime =
      mimeCandidates.find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
    if (!mime) {
      throw new Error(
        "This browser cannot re-encode video. Try Chrome/Edge, or export H.264 from iPhone.",
      );
    }

    const chunks: BlobPart[] = [];
    const recorder = new MediaRecorder(stream, {
      mimeType: mime,
      videoBitsPerSecond: 8_000_000,
    });
    recorder.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };

    const done = new Promise<Blob>((resolve, reject) => {
      recorder.onstop = () =>
        resolve(new Blob(chunks, { type: mime.includes("mp4") ? "video/mp4" : "video/webm" }));
      recorder.onerror = () => reject(new Error("Browser re-encode failed."));
    });

    onProgress?.({
      phase: "convert",
      percent: 8,
      message: "iPhone/HEVC detected — decoding in browser…",
    });

    recorder.start(200);
    await video.play();

    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    const fit = Math.min(targetW / srcW, targetH / srcH);
    const dw = srcW * fit;
    const dh = srcH * fit;
    const dx = (targetW - dw) / 2;
    const dy = (targetH - dh) / 2;

    let finished = false;
    await new Promise<void>((resolve) => {
      const finish = () => {
        if (finished) return;
        finished = true;
        resolve();
      };
      const tick = () => {
        if (finished) return;
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, targetW, targetH);
        ctx.drawImage(video, dx, dy, dw, dh);
        if (duration > 0) {
          onProgress?.({
            phase: "convert",
            percent: Math.min(55, Math.round((video.currentTime / duration) * 55)),
            message: "Re-encoding compatible video…",
          });
        }
        if (video.ended) {
          finish();
          return;
        }
        requestAnimationFrame(tick);
      };
      video.onended = () => finish();
      requestAnimationFrame(tick);
    });

    // Draw last frame once more
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, targetW, targetH);
    ctx.drawImage(video, dx, dy, dw, dh);
    await new Promise((r) => setTimeout(r, 120));

    if (recorder.state !== "inactive") recorder.stop();
    video.pause();
    return await done;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function targetSize(
  resolution: ResolutionId,
  source?: VideoMeta | null,
): { width: number; height: number } {
  const t = resolutionOf(resolution);
  if (t.width && t.height) return { width: t.width, height: t.height };
  return {
    width: even(source?.width || 1080),
    height: even(source?.height || 1920),
  };
}

/** iPhone Photos often export HEVC as UUID.MP4 — ffmpeg.wasm usually cannot decode it. */
function likelyIphoneHevc(file: File): boolean {
  const name = file.name.toLowerCase();
  if (name.endsWith(".mov") || name.endsWith(".hevc") || name.endsWith(".h265")) {
    return true;
  }
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.mp4$/i.test(
    file.name,
  );
}

export async function convertVideo(
  file: File,
  options: ConvertOptions,
): Promise<Blob> {
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error(
      `File is too large (${formatBytes(file.size)}). Use a file under ${formatBytes(MAX_UPLOAD_BYTES)}.`,
    );
  }

  const target = resolutionOf(options.resolution);
  const size = targetSize(options.resolution, options.sourceMeta);
  const { preset, crf, audio } = encodePreset(
    options.fps,
    options.resolution,
    options.quality,
  );
  const instance = await getFFmpeg(options.onProgress);
  const { fetchFile } = await import("@ffmpeg/util");

  const timeoutMs =
    options.fps >= 120 || options.resolution === "4k" || options.resolution === "8k"
      ? 15 * 60 * 1000
      : 10 * 60 * 1000;

  const onFpsProgress = ({ progress }: { progress: number }) => {
    if (!Number.isFinite(progress)) return;
    options.onProgress?.({
      phase: "convert",
      percent: clampPercent(Math.min(0.99, Math.max(0, progress)) * 100),
      message: `Converting to ${options.fps} FPS · ${target.label} · ${options.quality}…`,
    });
  };

  const encodeFromNamedInput = async (
    inputName: string,
    meta: VideoMeta | null | undefined,
  ): Promise<Blob> => {
    const outputName = "output.mp4";
    const vf = buildVf(options.fps, options.resolution, meta);
    await safeDelete(instance, outputName);

    const attempts: string[][] = [
      [
        "-i",
        inputName,
        "-vf",
        vf,
        "-r",
        String(options.fps),
        "-c:v",
        "libx264",
        "-preset",
        preset,
        "-crf",
        crf,
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        "-c:a",
        "aac",
        "-b:a",
        audio,
        "-ar",
        "44100",
        "-ac",
        "2",
        outputName,
      ],
      [
        "-i",
        inputName,
        "-vf",
        vf,
        "-r",
        String(options.fps),
        "-c:v",
        "libx264",
        "-preset",
        "ultrafast",
        "-crf",
        "23",
        "-pix_fmt",
        "yuv420p",
        "-an",
        "-movflags",
        "+faststart",
        outputName,
      ],
      [
        "-i",
        inputName,
        "-vf",
        scaleFilter(size.width, size.height, meta),
        "-r",
        String(options.fps),
        "-vsync",
        "cfr",
        "-c:v",
        "libx264",
        "-preset",
        "ultrafast",
        "-crf",
        "22",
        "-pix_fmt",
        "yuv420p",
        "-an",
        "-movflags",
        "+faststart",
        outputName,
      ],
    ];

    let lastLogs: string[] = [];
    for (const args of attempts) {
      await safeDelete(instance, outputName);
      const { code, logs } = await runFFmpegExec(
        instance,
        args,
        timeoutMs,
        options.signal,
      );
      lastLogs = logs;
      if (code === 0) {
        const data = await instance.readFile(outputName);
        if (typeof data === "string") continue;
        const copy = new Uint8Array(data);
        await safeDelete(instance, outputName);
        return new Blob([copy], { type: "video/mp4" });
      }
    }
    throw humanizeFailure(
      lastLogs,
      "Conversion failed. Try TikTok 60, 720p, or Compress.",
    );
  };

  instance.on("progress", onFpsProgress);

  try {
    options.onProgress?.({
      phase: "convert",
      percent: 0,
      message: "Writing video into the converter…",
    });

    const inputName = `input.${extensionOf(file)}`;
    await safeDelete(instance, inputName);

    const runBridgeThenEncode = async (reason: string): Promise<Blob> => {
      options.onProgress?.({
        phase: "convert",
        percent: 5,
        message: reason,
      });
      const bridge = await browserBridgeBlob(
        file,
        options.sourceMeta,
        size.width,
        size.height,
        options.onProgress,
      );
      const bridgeName = bridge.type.includes("mp4") ? "bridge.mp4" : "bridge.webm";
      await safeDelete(instance, bridgeName);
      await instance.writeFile(bridgeName, await fetchFile(bridge));
      const bridgedMeta: VideoMeta = {
        width: size.width,
        height: size.height,
        duration: options.sourceMeta?.duration ?? 0,
      };
      try {
        return await encodeFromNamedInput(bridgeName, bridgedMeta);
      } finally {
        await safeDelete(instance, bridgeName);
      }
    };

    if (likelyIphoneHevc(file)) {
      try {
        const blob = await runBridgeThenEncode(
          "iPhone-style clip — decoding in browser first…",
        );
        options.onProgress?.({
          phase: "convert",
          percent: 100,
          message: "Done",
        });
        return blob;
      } catch (bridgeError) {
        // Fall through to direct ffmpeg in case it was actually H.264
        options.onProgress?.({
          phase: "convert",
          percent: 8,
          message:
            bridgeError instanceof Error
              ? `${bridgeError.message} Trying FFmpeg…`
              : "Trying FFmpeg…",
        });
      }
    }

    await instance.writeFile(inputName, await fetchFile(file));

    try {
      const blob = await encodeFromNamedInput(inputName, options.sourceMeta);
      options.onProgress?.({
        phase: "convert",
        percent: 100,
        message: "Done",
      });
      return blob;
    } catch (directError) {
      await safeDelete(instance, inputName);
      try {
        const blob = await runBridgeThenEncode(
          directError instanceof Error
            ? `${directError.message} Using browser decode…`
            : "Retrying with browser decode…",
        );
        options.onProgress?.({
          phase: "convert",
          percent: 100,
          message: "Done",
        });
        return blob;
      } catch (bridgeError) {
        throw bridgeError instanceof Error
          ? bridgeError
          : directError;
      }
    } finally {
      await safeDelete(instance, inputName);
    }
  } finally {
    instance.off("progress", onFpsProgress);
  }
}
