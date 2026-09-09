"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FRAME_RATES,
  MAX_UPLOAD_BYTES,
  POST_TARGETS,
  QUALITY_LEVELS,
  RESOLUTIONS,
  WARN_UPLOAD_BYTES,
  convertVideo,
  formatBytes,
  formatDuration,
  readVideoMeta,
  resolutionOf,
  type ConvertProgress,
  type FrameRate,
  type PostTargetId,
  type QualityId,
  type ResolutionId,
  type VideoMeta,
} from "@/lib/videoConvert";

const ACCEPT =
  "video/mp4,video/webm,video/quicktime,video/x-matroska,video/x-msvideo,.mp4,.webm,.mov,.mkv,.avi";

export function VideoConverterPanel() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [meta, setMeta] = useState<VideoMeta | null>(null);
  const [fps, setFps] = useState<FrameRate>(120);
  const [resolution, setResolution] = useState<ResolutionId>("vhd");
  const [quality, setQuality] = useState<QualityId>("high");
  const [targetId, setTargetId] = useState<PostTargetId>("tiktok120");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<ConvertProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [resultBytes, setResultBytes] = useState<number | null>(null);

  const sourceUrlRef = useRef<string | null>(null);
  const resultUrlRef = useRef<string | null>(null);
  sourceUrlRef.current = sourceUrl;
  resultUrlRef.current = resultUrl;

  useEffect(() => {
    return () => {
      if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current);
      if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
    };
  }, []);

  const target = useMemo(() => resolutionOf(resolution), [resolution]);
  const qualityMeta = QUALITY_LEVELS.find((item) => item.id === quality) ?? QUALITY_LEVELS[0];

  const applyPostTarget = (id: PostTargetId) => {
    const next = POST_TARGETS.find((item) => item.id === id);
    if (!next) return;
    setTargetId(id);
    if (next.fps) setFps(next.fps);
    if (next.resolution) setResolution(next.resolution);
    if (next.quality) setQuality(next.quality);
  };

  const markCustom = () => setTargetId("custom");
  const heavy =
    resolution === "8k" ||
    (resolution === "4k" && fps >= 60) ||
    fps >= 120 ||
    (file != null && file.size > WARN_UPLOAD_BYTES);

  const onFile = useCallback(async (next: File | undefined) => {
    if (!next) return;
    if (!next.type.startsWith("video/") && !/\.(mp4|webm|mov|mkv|avi)$/i.test(next.name)) {
      setError("Please upload a video file (MP4, WebM, MOV, MKV, AVI).");
      return;
    }
    if (next.size > MAX_UPLOAD_BYTES) {
      setError(`File is too large (${formatBytes(next.size)}). Use a file under ${formatBytes(MAX_UPLOAD_BYTES)}.`);
      return;
    }

    const url = URL.createObjectURL(next);
    setError(null);
    setBusy(false);
    setProgress(null);
    setFile(next);
    setSourceUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return url;
    });
    setResultBytes(null);
    setResultUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    try {
      setMeta(await readVideoMeta(url));
    } catch (e) {
      setMeta(null);
      setError(e instanceof Error ? e.message : "Could not read this video.");
    }
  }, []);

  const convert = useCallback(async () => {
    if (!file) return;
    setBusy(true);
    setError(null);
    setProgress({
      phase: "engine",
      percent: 0,
      message: "Starting converter…",
    });
    try {
      const blob = await convertVideo(file, {
        fps,
        resolution,
        quality,
        onProgress: setProgress,
      });
      setResultBytes(blob.size);
      const url = URL.createObjectURL(blob);
      setResultUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Conversion failed. Try a lower resolution or a shorter clip.",
      );
    } finally {
      setBusy(false);
    }
  }, [file, fps, resolution, quality]);

  const download = () => {
    if (!resultUrl) return;
    const a = document.createElement("a");
    a.href = resultUrl;
    const size = target.width && target.height ? `${target.width}x${target.height}` : "original";
    a.download = `sarupak-${targetId}-${size}-${fps}fps-${quality}.mp4`;
    a.click();
  };

  return (
    <div className="tool-stage">
      <div
        className={`drop-zone convert-drop ${dragOver ? "is-over" : ""} ${sourceUrl ? "has-file" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          void onFile(e.dataTransfer.files?.[0]);
        }}
        onClick={() => {
          if (!sourceUrl) fileRef.current?.click();
        }}
        onKeyDown={(e) => {
          if (!sourceUrl && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            fileRef.current?.click();
          }
        }}
        role={sourceUrl ? undefined : "button"}
        tabIndex={sourceUrl ? undefined : 0}
      >
        <input
          ref={fileRef}
          type="file"
          accept={ACCEPT}
          hidden
          onChange={(e) => {
            void onFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        {sourceUrl ? (
          <video className="convert-player" src={sourceUrl} controls playsInline preload="metadata" />
        ) : (
          <>
            <span className="drop-title">ដាក់វីដេអូ ឬចុចជ្រើស</span>
            <span className="drop-sub">MP4 / WebM / MOV — drag & drop</span>
          </>
        )}
      </div>

      {file && (
        <div className="convert-meta">
          <span>{file.name}</span>
          <span>{formatBytes(file.size)}</span>
          {meta && (
            <>
              <span>
                {meta.width} × {meta.height}
              </span>
              <span>{formatDuration(meta.duration)}</span>
            </>
          )}
        </div>
      )}

      <section className="convert-section">
        <h2 className="field-label">Post to</h2>
        <div className="preset-grid convert-grid">
          {POST_TARGETS.map((option) => (
            <button
              key={option.id}
              type="button"
              className={`preset-chip ${targetId === option.id ? "is-active" : ""}`}
              onClick={() => applyPostTarget(option.id)}
              disabled={busy}
            >
              <strong>{option.label}</strong>
              <span>{option.hint}</span>
            </button>
          ))}
        </div>
        <p className="note">
          TikTok 120Hz exports 9:16 1080p at 120 FPS, High quality — ready to post
          on 120Hz For You.
        </p>
      </section>

      <section className="convert-section">
        <h2 className="field-label">Quality / Compress</h2>
        <div className="preset-grid convert-grid">
          {QUALITY_LEVELS.map((option) => (
            <button
              key={option.id}
              type="button"
              className={`preset-chip ${quality === option.id ? "is-active" : ""}`}
              onClick={() => {
                setQuality(option.id);
                markCustom();
              }}
              disabled={busy}
            >
              <strong>{option.label}</strong>
              <span>{option.hint}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="convert-section">
        <h2 className="field-label">Target Frame Rate</h2>
        <div className="preset-grid convert-grid">
          {FRAME_RATES.map((option) => (
            <button
              key={option.fps}
              type="button"
              className={`preset-chip ${fps === option.fps ? "is-active" : ""}`}
              onClick={() => {
                setFps(option.fps);
                markCustom();
              }}
              disabled={busy}
            >
              <strong>{option.label}</strong>
              <span>{option.hint}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="convert-section">
        <h2 className="field-label">Resolution — HD · 2K · 4K · 8K</h2>
        <div className="preset-grid convert-grid">
          {RESOLUTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              className={`preset-chip ${resolution === option.id ? "is-active" : ""}`}
              onClick={() => {
                setResolution(option.id);
                markCustom();
              }}
              disabled={busy}
            >
              <strong>{option.label}</strong>
              <span>{option.hint}</span>
            </button>
          ))}
        </div>
        <p className="note">Aspect ratio is kept — black bars pad if the frame does not match.</p>
      </section>

      {heavy && (
        <p className="note convert-warn">
          {resolution === "8k"
            ? "8K conversion is heavy in the browser — short clips work best."
            : fps >= 120
              ? "120 / 240 FPS multiplies frames (duplicates or keeps them) so the file is ready for slow-motion."
              : "Large files and 4K takes longer on-device. Keep the clip short if it stalls."}
        </p>
      )}

      <div className="tool-actions">
        <button
          type="button"
          className="btn-ghost"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
        >
          វីដេអូថ្មី
        </button>
        <button
          type="button"
          className="btn-primary"
          onClick={() => void convert()}
          disabled={!file || busy}
        >
          {busy
            ? "Converting…"
            : `Convert · ${fps} FPS · ${target.label} · ${qualityMeta.label}`}
        </button>
        <button
          type="button"
          className="btn-ghost"
          onClick={download}
          disabled={!resultUrl || busy}
        >
          Download MP4
        </button>
      </div>

      {busy && progress && (
        <div className="tool-busy convert-busy">
          <span className="gen-spinner" />
          <div className="convert-progress">
            <div
              className="convert-progress-bar"
              style={{ width: `${Math.max(4, progress.percent)}%` }}
            />
          </div>
          <span>
            {progress.percent}% — {progress.message}
          </span>
        </div>
      )}

      {resultUrl && (
        <figure className="convert-result">
          <figcaption>
            Converted · {fps} FPS · {target.label} · {qualityMeta.label}
            {resultBytes != null ? ` · ${formatBytes(resultBytes)}` : ""}
          </figcaption>
          <video className="convert-player" src={resultUrl} controls playsInline />
        </figure>
      )}

      <p className="note">
        High = post quality for TikTok 120Hz / Facebook. Compress = smaller MP4 for
        upload limits. First run downloads FFmpeg (~31MB).
      </p>

      {error && <p className="error-banner">{error}</p>}
    </div>
  );
}
