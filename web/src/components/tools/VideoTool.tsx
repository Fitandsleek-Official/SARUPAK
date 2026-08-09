"use client";

import { useState } from "react";

export function VideoTool() {
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <div className="tool-page">
      <header className="tool-hero">
        <p className="tool-kicker">Soon</p>
        <h1>AI Video Generator</h1>
        <p>រូប ឬ prompt → video clip ខ្លី — pipeline សម្រាប់អនាគត</p>
      </header>

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
          ភ្ជាប់រូបគោល (optional)
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
          UI ready។ Model video (Wan / SVD / HF Space) នឹងភ្ជាប់នៅ worker។
        </p>
      </div>
    </div>
  );
}
