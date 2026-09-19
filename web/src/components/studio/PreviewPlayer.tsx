"use client";

import { useEffect, useRef, useState } from "react";
import type { MediaAsset } from "@/lib/api";
import { mediaContentUrl } from "@/lib/api";
import {
  activeClipsAt,
  mediaTimeAtPlayhead,
} from "@sarupak/editor-core";
import { useEditorStore } from "@/lib/editorStore";

export function PreviewPlayer({
  projectId,
  width,
  height,
  media,
}: {
  projectId: string;
  width: number;
  height: number;
  media: MediaAsset[];
}) {
  const timeline = useEditorStore((s) => s.timeline);
  const isPlaying = useEditorStore((s) => s.isPlaying);
  const scrub = useEditorStore((s) => s.scrub);
  const setPlaying = useEditorStore((s) => s.setPlaying);
  const durationMs = useEditorStore((s) => s.durationMs);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const raf = useRef<number | null>(null);
  const [fitMode, setFitMode] = useState<"contain" | "cover">("contain");
  const [mediaStatus, setMediaStatus] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");

  const active = timeline
    ? activeClipsAt(timeline, timeline.playheadMs, ["video", "audio"])
    : [];
  const videoClip = active.find((a) => a.track.kind === "video")?.clip;
  const audioClip = active.find((a) => a.track.kind === "audio")?.clip;
  const hasAnyMedia = media.length > 0;

  useEffect(() => {
    if (!videoClip?.mediaAssetId) {
      setMediaStatus("idle");
      return;
    }
    setMediaStatus("loading");
  }, [videoClip?.mediaAssetId]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoClip?.mediaAssetId || !timeline) return;
    const mt = mediaTimeAtPlayhead(videoClip, timeline.playheadMs);
    if (mt == null) return;
    const target = mt / 1000;
    if (Math.abs(video.currentTime - target) > 0.12) {
      video.currentTime = target;
    }
    video.volume = Math.min(1, videoClip.volume ?? 1);
  }, [timeline?.playheadMs, videoClip?.id, videoClip?.volume, timeline, videoClip]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !audioClip?.mediaAssetId || !timeline) return;
    const mt = mediaTimeAtPlayhead(audioClip, timeline.playheadMs);
    if (mt == null) return;
    const target = mt / 1000;
    if (Math.abs(audio.currentTime - target) > 0.12) {
      audio.currentTime = target;
    }
    audio.volume = Math.min(1, audioClip.volume ?? 1);
  }, [timeline?.playheadMs, audioClip?.id, audioClip?.volume, timeline, audioClip]);

  useEffect(() => {
    const video = videoRef.current;
    const audio = audioRef.current;
    if (isPlaying) {
      void video?.play().catch(() => undefined);
      void audio?.play().catch(() => undefined);
      const tick = () => {
        const state = useEditorStore.getState();
        if (!state.timeline || !state.isPlaying) return;
        const next = state.timeline.playheadMs + 33;
        const end = state.durationMs();
        if (next >= end) {
          state.setPlaying(false);
          // Stay on last visible frame (inclusive end).
          state.scrub(Math.max(0, end));
          return;
        }
        state.scrub(next);
        raf.current = requestAnimationFrame(tick);
      };
      raf.current = requestAnimationFrame(tick);
    } else {
      video?.pause();
      audio?.pause();
      if (raf.current) cancelAnimationFrame(raf.current);
    }
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [isPlaying]);

  const aspect = width / Math.max(1, height);
  const videoSrc = videoClip?.mediaAssetId
    ? mediaContentUrl(projectId, videoClip.mediaAssetId)
    : null;
  const audioSrc = audioClip?.mediaAssetId
    ? mediaContentUrl(projectId, audioClip.mediaAssetId)
    : null;

  return (
    <div className="editor-preview">
      <div
        className="editor-preview-stage"
        style={{ aspectRatio: `${aspect}` }}
        data-fit={fitMode}
      >
        {videoSrc ? (
          <video
            key={videoClip!.mediaAssetId}
            ref={videoRef}
            src={videoSrc}
            playsInline
            muted={false}
            style={{ objectFit: fitMode }}
            onLoadStart={() => setMediaStatus("loading")}
            onCanPlay={() => setMediaStatus("ready")}
            onError={() => setMediaStatus("error")}
          />
        ) : (
          <div className="editor-preview-empty">
            {!hasAnyMedia
              ? "Import media and add it to the timeline to preview."
              : "No video at playhead — click the clip or drag the playhead onto it."}
          </div>
        )}
        {audioSrc ? (
          <audio
            key={audioClip!.mediaAssetId}
            ref={audioRef}
            src={audioSrc}
            preload="auto"
          />
        ) : null}
        {videoSrc && mediaStatus === "loading" ? (
          <div className="editor-preview-status" role="status">
            Loading…
          </div>
        ) : null}
        {videoSrc && mediaStatus === "error" ? (
          <div className="editor-preview-status is-error" role="alert">
            Media failed to load — re-import if the file was lost on the server.
          </div>
        ) : null}
      </div>
      <div className="editor-transport">
        <button
          type="button"
          onClick={() => setPlaying(!isPlaying)}
          aria-label={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying ? "Pause" : "Play"}
        </button>
        <button type="button" onClick={() => scrub(0)} aria-label="Go to start">
          Start
        </button>
        <button
          type="button"
          onClick={() =>
            setFitMode((m) => (m === "contain" ? "cover" : "contain"))
          }
          aria-label={`Preview fit: ${fitMode}`}
          title="Toggle fit / fill"
        >
          Fit: {fitMode}
        </button>
        <span className="editor-timecode">
          {formatTs(timeline?.playheadMs ?? 0)} / {formatTs(durationMs())}
        </span>
      </div>
    </div>
  );
}

function formatTs(ms: number) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  const frac = Math.floor((ms % 1000) / 10);
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}.${String(frac).padStart(2, "0")}`;
}
