"use client";

import { useEffect, useRef, useState } from "react";
import { mediaContentUrl } from "@/lib/api";

const peakCache = new Map<string, Float32Array>();

async function loadPeaks(
  projectId: string,
  assetId: string,
  buckets: number,
): Promise<Float32Array> {
  const cacheKey = `${assetId}:${buckets}`;
  const hit = peakCache.get(cacheKey);
  if (hit) return hit;

  const url = mediaContentUrl(projectId, assetId);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`waveform ${res.status}`);
  const buf = await res.arrayBuffer();
  const ctx = new AudioContext();
  try {
    const audio = await ctx.decodeAudioData(buf.slice(0));
    const channel = audio.getChannelData(0);
    const peaks = new Float32Array(buckets);
    const block = Math.max(1, Math.floor(channel.length / buckets));
    for (let i = 0; i < buckets; i++) {
      let max = 0;
      const start = i * block;
      const end = Math.min(channel.length, start + block);
      for (let j = start; j < end; j++) {
        const v = Math.abs(channel[j]!);
        if (v > max) max = v;
      }
      peaks[i] = max;
    }
    peakCache.set(cacheKey, peaks);
    return peaks;
  } finally {
    await ctx.close().catch(() => undefined);
  }
}

/** Lightweight waveform strip for timeline clips. */
export function ClipWaveform({
  projectId,
  mediaAssetId,
  width,
  height = 36,
}: {
  projectId: string;
  mediaAssetId: string;
  width: number;
  height?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const buckets = Math.max(24, Math.min(240, Math.floor(width / 2)));
    void (async () => {
      try {
        const peaks = await loadPeaks(projectId, mediaAssetId, buckets);
        if (cancelled) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const dpr = window.devicePixelRatio || 1;
        canvas.width = Math.max(1, Math.floor(width * dpr));
        canvas.height = Math.max(1, Math.floor(height * dpr));
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
        const g = canvas.getContext("2d");
        if (!g) return;
        g.scale(dpr, dpr);
        g.clearRect(0, 0, width, height);
        g.fillStyle = "rgba(243, 239, 230, 0.55)";
        const mid = height / 2;
        const barW = width / peaks.length;
        for (let i = 0; i < peaks.length; i++) {
          const h = Math.max(1, peaks[i]! * (height * 0.9));
          g.fillRect(i * barW, mid - h / 2, Math.max(1, barW * 0.75), h);
        }
        setReady(true);
      } catch {
        if (!cancelled) setReady(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, mediaAssetId, width, height]);

  return (
    <canvas
      ref={canvasRef}
      className={`editor-clip-wave ${ready ? "is-ready" : ""}`}
      aria-hidden
    />
  );
}
