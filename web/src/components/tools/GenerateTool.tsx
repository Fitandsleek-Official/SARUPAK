"use client";

import { useState } from "react";

export function GenerateTool() {
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  const run = async () => {
    if (!prompt.trim()) return;
    setBusy(true);
    setPreview(null);
    // Beta: local placeholder gradient “preview” until HF image model is wired
    await new Promise((r) => setTimeout(r, 900));
    const canvas = document.createElement("canvas");
    canvas.width = 768;
    canvas.height = 960;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      const g = ctx.createLinearGradient(0, 0, 768, 960);
      g.addColorStop(0, "#2a241c");
      g.addColorStop(0.45, "#e8a045");
      g.addColorStop(1, "#1a3040");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 768, 960);
      ctx.fillStyle = "rgba(243,239,230,0.92)";
      ctx.font = "600 28px Syne, sans-serif";
      ctx.fillText("SARUPAK · Preview", 40, 80);
      ctx.font = "400 18px Figtree, sans-serif";
      const lines = prompt.slice(0, 120);
      ctx.fillText(lines, 40, 130);
      ctx.fillStyle = "rgba(243,239,230,0.55)";
      ctx.fillText("Connect Hugging Face image model next", 40, 900);
      setPreview(canvas.toDataURL("image/jpeg", 0.9));
    }
    setBusy(false);
  };

  return (
    <div className="tool-page">
      <header className="tool-hero">
        <p className="tool-kicker">Beta</p>
        <h1>AI Image Generator</h1>
        <p>
          Prompt → រូបថ្មី។ UI រួច — ភ្ជាប់ open model លើ Hugging Face បន្ទាប់
        </p>
      </header>

      <div className="tool-stage">
        <label className="field">
          <span className="field-label">Prompt</span>
          <textarea
            rows={4}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="cinematic portrait, golden hour, soft bokeh, Khmer garden…"
          />
        </label>
        <div className="tool-actions">
          <button
            type="button"
            className="btn-primary"
            disabled={busy || !prompt.trim()}
            onClick={run}
          >
            {busy ? "Generating…" : "Generate"}
          </button>
        </div>
        {preview && (
          <div className="gen-preview">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt="Generated preview" />
          </div>
        )}
        <p className="note">
          Beta preview stub — worker `/v1/generate` នឹងភ្ជាប់ Flux / SDXL លើ HF
        </p>
      </div>
    </div>
  );
}
