"use client";

import { useState } from "react";

export function FaceSwapTool() {
  const [faceUrl, setFaceUrl] = useState<string | null>(null);
  const [baseUrl, setBaseUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const pick = (
    setter: (u: string) => void,
  ) => (file: File | undefined) => {
    if (!file) return;
    setter(URL.createObjectURL(file));
  };

  const run = async () => {
    if (!faceUrl || !baseUrl) {
      setMsg("ត្រូវការរូបមុខ និងរូបគោល");
      return;
    }
    setBusy(true);
    setMsg(null);
    await new Promise((r) => setTimeout(r, 800));
    setMsg(
      "Beta UI រួច — face detect + swap model នឹងភ្ជាប់ (InsightFace / HF).",
    );
    setBusy(false);
  };

  return (
    <div className="tool-page">
      <header className="tool-hero">
        <p className="tool-kicker">Beta</p>
        <h1>AI Face Swap</h1>
        <p>ដាក់មុខលើរូបគោល — align ឆ្លាត សម្រាប់ portrait edits</p>
      </header>

      <div className="tool-stage">
        <div className="swap-grid">
          <label className="drop-zone compact">
            <input
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => pick(setFaceUrl)(e.target.files?.[0])}
            />
            {faceUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={faceUrl} alt="Face" />
            ) : (
              <>
                <span className="drop-title">រូបមុខ</span>
                <span className="drop-sub">Face source</span>
              </>
            )}
          </label>
          <label className="drop-zone compact">
            <input
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => pick(setBaseUrl)(e.target.files?.[0])}
            />
            {baseUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={baseUrl} alt="Base" />
            ) : (
              <>
                <span className="drop-title">រូបគោល</span>
                <span className="drop-sub">Target photo</span>
              </>
            )}
          </label>
        </div>
        <button
          type="button"
          className="btn-primary"
          disabled={busy}
          onClick={run}
        >
          {busy ? "Processing…" : "Swap Face"}
        </button>
        {msg && <p className="note">{msg}</p>}
      </div>
    </div>
  );
}
