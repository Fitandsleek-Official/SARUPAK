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

function scaleFilter(width: number | null, height: number | null): string {
  if (!width || !height) return "scale=trunc(iw/2)*2:trunc(ih/2)*2";
  return [
    `scale=${width}:${height}:force_original_aspect_ratio=decrease:flags=lanczos`,
    `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black`,
  ].join(",");
}

function megabitCap(
  resolution: ResolutionId,
  fps: FrameRate,
  quality: QualityId,
): number {
  const base: Record<ResolutionId, number> = {
    original: 12,
    v720: 5,
    vhd: 10,
    hd720: 6,
    hd: 12,
    "2k": 18,
    "4k": 32,
    "8k": 45,
  };
  const q = quality === "high" ? 1.35 : quality === "compress" ? 0.5 : 0.9;
  const f = fps >= 120 ? 1.55 : fps >= 60 ? 1.2 : 1;
  return Math.max(3, Math.round(base[resolution] * q * f));
}

function encodePreset(
  fps: FrameRate,
  resolution: ResolutionId,
  quality: QualityId,
): { preset: string; crf: string; audio: string; maxrate: string; bufsize: string } {
  const heavy = resolution === "8k" || resolution === "4k" || fps >= 120;
  const mb = megabitCap(resolution, fps, quality);
  if (quality === "high") {
    return {
      preset: heavy ? "veryfast" : "fast",
      crf: heavy ? "19" : "18",
      audio: "192k",
      maxrate: `${mb}M`,
      bufsize: `${mb * 2}M`,
    };
  }
  if (quality === "compress") {
    return {
      preset: "ultrafast",
      crf: "28",
      audio: "128k",
      maxrate: `${mb}M`,
      bufsize: `${mb * 2}M`,
    };
  }
  return {
    preset: heavy ? "ultrafast" : "veryfast",
    crf: "23",
    audio: "160k",
    maxrate: `${mb}M`,
    bufsize: `${mb * 2}M`,
  };
}

async function toBlobFromCdn(
  toBlobURL: typeof import("@ffmpeg/util").toBlobURL,
  file: "ffmpeg-core.js" | "ffmpeg-core.wasm",
  mime: string,
  onDownload?: (ratio: number) => void,
): Promise<string> {
  let lastError: unknown;
  for (const base of CORE_CDNS) {
    try {
      return await toBlobURL(`${base}/${file}`, mime, true, ({ received, total }) => {
        if (total && onDownload) onDownload(received / total);
      });
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("Could not download the FFmpeg engine.");
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
    const { toBlobURL } = await import("@ffmpeg/util");
    const next = new FFmpeg();
    onProgress?.({
      phase: "engine",
      percent: 4,
      message: "Loading converter engine (~31MB)…",
    });
    const coreURL = await toBlobFromCdn(
      toBlobURL,
      "ffmpeg-core.js",
      "text/javascript",
      (ratio) =>
        onProgress?.({
          phase: "engine",
          percent: Math.round(ratio * 35),
          message: "Loading converter engine (~31MB)…",
        }),
    );
    const wasmURL = await toBlobFromCdn(
      toBlobURL,
      "ffmpeg-core.wasm",
      "application/wasm",
      (ratio) =>
        onProgress?.({
          phase: "engine",
          percent: 35 + Math.round(ratio * 55),
          message: "Loading FFmpeg WASM…",
        }),
    );
    await next.load({
      coreURL,
      wasmURL,
      classWorkerURL: `${window.location.origin}/ffmpeg/worker.js`,
    });
    ffmpeg = next;
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
  const { preset, crf, audio, maxrate, bufsize } = encodePreset(
    options.fps,
    options.resolution,
    options.quality,
  );
  const instance = await getFFmpeg(options.onProgress);
  const { fetchFile } = await import("@ffmpeg/util");

  const inputName = `input.${extensionOf(file)}`;
  const outputName = "output.mp4";
  const vf = `fps=${options.fps},${scaleFilter(target.width, target.height)}`;

  options.onProgress?.({
    phase: "convert",
    percent: 0,
    message: "Writing video into the converter…",
  });

  const onFpsProgress = ({ progress }: { progress: number }) => {
    if (!Number.isFinite(progress)) return;
    options.onProgress?.({
      phase: "convert",
      percent: Math.min(99, Math.max(1, Math.round(progress * 100))),
      message: `Converting to ${options.fps} FPS · ${target.label} · ${options.quality}…`,
    });
  };

  instance.on("progress", onFpsProgress);

  await safeDelete(instance, inputName);
  await safeDelete(instance, outputName);
  await instance.writeFile(inputName, await fetchFile(file));

  const timeoutMs = options.resolution === "8k" ? 20 * 60 * 1000 : 12 * 60 * 1000;
  const common = [
    "-i",
    inputName,
    "-vf",
    vf,
    "-r",
    String(options.fps),
    "-c:v",
    "libx264",
    "-profile:v",
    "high",
    "-preset",
    preset,
    "-crf",
    crf,
    "-maxrate",
    maxrate,
    "-bufsize",
    bufsize,
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
  ];

  try {
    let code = await instance.exec(
      [...common, "-c:a", "aac", "-b:a", audio, "-ar", "48000", "-ac", "2", outputName],
      timeoutMs,
      { signal: options.signal },
    );
    if (code !== 0) {
      await safeDelete(instance, outputName);
      code = await instance.exec(
        [...common, "-an", outputName],
        timeoutMs,
        { signal: options.signal },
      );
    }
    if (code !== 0) {
      throw new Error("Conversion failed. Try a lower resolution or frame rate.");
    }

    const data = await instance.readFile(outputName);
    if (typeof data === "string") {
      throw new Error("FFmpeg returned unexpected text output");
    }
    const copy = new Uint8Array(data);
    options.onProgress?.({
      phase: "convert",
      percent: 100,
      message: "Done",
    });
    return new Blob([copy], { type: "video/mp4" });
  } finally {
    instance.off("progress", onFpsProgress);
    await safeDelete(instance, inputName);
    await safeDelete(instance, outputName);
  }
}
