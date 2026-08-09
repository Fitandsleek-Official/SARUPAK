"use client";

import { useCallback, useRef, useState } from "react";

export function RemoveBgTool() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const process = useCallback(async (file: File) => {
    setBusy(true);
    setError(null);
    setResultUrl(null);
    const url = URL.createObjectURL(file);
    setOriginalUrl(url);
    try {
      const { removeBackground } = await import("@imgly/background-removal");
      const blob = await removeBackground(file, {
        model: "isnet_quint8",
        output: { format: "image/png" },
      });
      setResultUrl(URL.createObjectURL(blob));
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "មិនអាចលុប background បាន — សាកម្តងទៀត",
      );
    } finally {
      setBusy(false);
    }
  }, []);

  const download = () => {
    if (!resultUrl) return;
    const a = document.createElement("a");
    a.href = resultUrl;
    a.download = "sarupak-no-bg.png";
    a.click();
  };

  return (
    <div className="tool-page">
      <header className="tool-hero">
        <p className="tool-kicker">Live</p>
        <h1>Background Remover</h1>
        <p>លុបផ្ទៃក្រោយដោយ AI ក្នុង browser — privacy នៅនឹងឧបករណ៍អ្នក</p>
      </header>

      <div className="tool-stage">
        <label className="drop-zone">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) process(f);
              e.target.value = "";
            }}
          />
          <span className="drop-title">ដាក់រូប ឬចុចជ្រើស</span>
          <span className="drop-sub">PNG / JPG — model ទាញលើកដំបូង</span>
        </label>

        {(originalUrl || resultUrl) && (
          <div className="compare-grid">
            {originalUrl && (
              <figure>
                <figcaption>Original</figcaption>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={originalUrl} alt="Original" />
              </figure>
            )}
            {resultUrl && (
              <figure className="checker">
                <figcaption>No background</figcaption>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={resultUrl} alt="Removed background" />
              </figure>
            )}
          </div>
        )}

        <div className="tool-actions">
          <button
            type="button"
            className="btn-ghost"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
          >
            រូបថ្មី
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={download}
            disabled={!resultUrl || busy}
          >
            Download PNG
          </button>
        </div>

        {busy && (
          <div className="tool-busy">
            <span className="gen-spinner" />
            កំពុងលុប background…
          </div>
        )}
        {error && <p className="error-banner">{error}</p>}
      </div>
    </div>
  );
}
