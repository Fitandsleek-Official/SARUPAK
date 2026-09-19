"use client";

import dynamic from "next/dynamic";
import { useState } from "react";

const VideoConverterPanel = dynamic(
  () =>
    import("@/components/tools/VideoConverterPanel").then(
      (mod) => mod.VideoConverterPanel,
    ),
  {
    ssr: false,
    loading: () => <p className="note">Loading converter…</p>,
  },
);

type VideoTab = "convert" | "generate";

export function VideoTool() {
  const [tab, setTab] = useState<VideoTab>("convert");
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <div className="tool-page tool-page-video">
      <header className="tool-hero">
        <p className="tool-kicker">{tab === "convert" ? "Live" : "Soon"}</p>
        <h1>{tab === "convert" ? "Video Converter" : "AI Video Generator"}</h1>
        <p>
          {tab === "convert"
            ? "Upload វីដេអូ — Esports 120/144 Smooth · TikTok 120Hz · Facebook · FPS 24–240 · HD / 2K / 4K / 8K."
            : "Image or prompt → short video clip — pipeline for a future Hugging Face worker."}
        </p>
      </header>

      <div className="video-tabs" role="tablist" aria-label="Video tools">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "convert"}
          className={`video-tab ${tab === "convert" ? "is-active" : ""}`}
          onClick={() => setTab("convert")}
        >
          Converter
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "generate"}
          className={`video-tab ${tab === "generate" ? "is-active" : ""}`}
          onClick={() => setTab("generate")}
        >
          AI Generate
        </button>
      </div>

      {tab === "convert" ? (
        <VideoConverterPanel />
      ) : (
        <div className="tool-stage">
          <div className="soon-visual" aria-hidden>
            <div className="soon-reel">
              <span />
              <span />
              <span />
            </div>
          </div>
          <label className="field">
            <span className="field-label">Prompt / scene</span>
            <textarea
              rows={3}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="slow push-in on portrait in garden, golden light…"
            />
          </label>
          <label className="btn-ghost file-btn">
            Attach a still (optional)
            <input type="file" accept="image/*" hidden />
          </label>
          <button
            type="button"
            className="btn-primary"
            disabled
            onClick={() => setBusy(true)}
          >
            {busy ? "Queued…" : "Coming soon — HF video worker"}
          </button>
          <p className="note">
            UI is ready. A video model (Wan / SVD / HF Space) will connect on the worker later.
          </p>
        </div>
      )}
    </div>
  );
}
