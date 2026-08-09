"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { renderRegionalImage } from "@/lib/applyRegional";
import { generateGrade, STYLE_PRESETS, type GenerateResult } from "@/lib/generate";
import {
  DEFAULT_EFFECTS,
  scaleRecipe,
  type EffectsParams,
  type ImageMasks,
  type RegionalRecipe,
} from "@/lib/regionalTypes";
import { buildMasks } from "@/lib/segment";
import { DEFAULT_EDITS, EditParams } from "@/lib/types";
import { Slider } from "./Slider";
import { UploadZone } from "./UploadZone";

type Panel = "ai" | "detail" | "basic" | "color";

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("មិនអាចផ្ទុករូបបាន"));
    };
    img.src = url;
  });
}

export function EditorApp() {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [fileName, setFileName] = useState("photo.jpg");
  const [recipe, setRecipe] = useState<RegionalRecipe | null>(null);
  const [liveRecipe, setLiveRecipe] = useState<RegionalRecipe | null>(null);
  const [masks, setMasks] = useState<ImageMasks | null>(null);
  const [analysis, setAnalysis] = useState<GenerateResult | null>(null);
  const [prompt, setPrompt] = useState("");
  const [presetId, setPresetId] = useState<string | null>("portrait_pro");
  const [strength, setStrength] = useState(100);
  const [hasGenerated, setHasGenerated] = useState(false);
  const [panel, setPanel] = useState<Panel>("ai");
  const [compare, setCompare] = useState(false);
  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState("Generating…");
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);

  const edits = liveRecipe?.global ?? DEFAULT_EDITS;
  const effects = liveRecipe?.effects ?? DEFAULT_EFFECTS;

  const setGlobal = useCallback(<K extends keyof EditParams>(key: K, value: EditParams[K]) => {
    setLiveRecipe((prev) => {
      if (!prev) {
        return {
          mode: "landscape",
          global: { ...DEFAULT_EDITS, [key]: value },
          effects: { ...DEFAULT_EFFECTS },
        };
      }
      return { ...prev, global: { ...prev.global, [key]: value } };
    });
    setHasGenerated(true);
  }, []);

  const setEffect = useCallback(
    <K extends keyof EffectsParams>(key: K, value: EffectsParams[K]) => {
      setLiveRecipe((prev) => {
        if (!prev) {
          return {
            mode: "landscape",
            global: { ...DEFAULT_EDITS },
            effects: { ...DEFAULT_EFFECTS, [key]: value },
          };
        }
        return { ...prev, effects: { ...prev.effects, [key]: value } };
      });
      setHasGenerated(true);
    },
    [],
  );

  const handleFile = useCallback(async (file: File) => {
    setError(null);
    setBusy(true);
    setBusyLabel("Loading…");
    try {
      const img = await loadImage(file);
      setImage(img);
      setFileName(file.name);
      setRecipe(null);
      setLiveRecipe(null);
      setMasks(null);
      setAnalysis(null);
      setHasGenerated(false);
      setStrength(100);
      setPanel("ai");
    } catch (e) {
      setError(e instanceof Error ? e.message : "មានបញ្ហា");
    } finally {
      setBusy(false);
    }
  }, []);

  const runGenerate = useCallback(
    async (mode: "auto" | "guided") => {
      if (!image) return;
      setBusy(true);
      setError(null);
      setPanel("ai");
      try {
        setBusyLabel(
          mode === "auto" ? "AI កំពុងវិភាគ…" : "កំពុងរៀប recipe…",
        );
        const result = await generateGrade({
          source: image,
          mode,
          prompt: mode === "guided" ? prompt : "",
          presetId: mode === "guided" ? presetId : null,
        });

        if (result.presetId) setPresetId(result.presetId);

        const personMode = result.hasPerson;
        setBusyLabel(
          personMode
            ? "រកឃើញមនុស្ស — កំពុង segment…"
            : "ទេសភាព — កែ sky/nature (ឥត subject)…",
        );
        const built = await buildMasks(image, 480, personMode);

        const scaled = scaleRecipe(result.recipe, strength);
        setAnalysis(result);
        setRecipe(result.recipe);
        setLiveRecipe(scaled);
        setMasks(built);
        setHasGenerated(true);
        setBusyLabel(
          personMode
            ? built.quality === "ml"
              ? "Person mode · AI mask"
              : "Person mode · heuristic"
            : "Landscape mode · ឥត subject glow",
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : "Generate failed");
      } finally {
        setBusy(false);
      }
    },
    [image, prompt, presetId, strength],
  );

  const onStrength = useCallback(
    (value: number) => {
      setStrength(value);
      if (recipe) setLiveRecipe(scaleRecipe(recipe, value));
    },
    [recipe],
  );

  useEffect(() => {
    if (!image || !canvasRef.current) return;

    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      const canvas = canvasRef.current;
      if (!canvas || !image) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      if (compare || !liveRecipe) {
        const maxSide = 1600;
        const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
        const w = Math.round(image.width * scale);
        const h = Math.round(image.height * scale);
        canvas.width = w;
        canvas.height = h;
        ctx.drawImage(image, 0, 0, w, h);
        return;
      }

      const rendered = renderRegionalImage(image, liveRecipe, masks, 1400);
      canvas.width = rendered.width;
      canvas.height = rendered.height;
      ctx.drawImage(rendered, 0, 0);
    });

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [image, liveRecipe, masks, compare]);

  const exportImage = useCallback(() => {
    if (!image || !liveRecipe) return;
    const rendered = renderRegionalImage(image, liveRecipe, masks, 2400);
    const a = document.createElement("a");
    a.href = rendered.toDataURL("image/jpeg", 0.92);
    a.download = fileName.replace(/\.[^.]+$/, "") + "-sarupak.jpg";
    a.click();
  }, [image, liveRecipe, masks, fileName]);

  const resetEdits = useCallback(() => {
    setRecipe(null);
    setLiveRecipe(null);
    setMasks(null);
    setAnalysis(null);
    setHasGenerated(false);
    setStrength(100);
  }, []);

  const sceneLabel = useMemo(() => {
    if (!analysis) return "—";
    const map: Record<string, string> = {
      portrait: "Portrait",
      nature: "Nature",
      sky_landscape: "Sky / Landscape",
      indoor: "Indoor",
      food: "Food",
      general: "General",
    };
    return map[analysis.scene] ?? analysis.scene;
  }, [analysis]);

  if (!image) {
    return (
      <main className="shell shell-empty">
        <UploadZone onFile={handleFile} disabled={busy} />
        {error && <p className="error-banner">{error}</p>}
      </main>
    );
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div className="topbar-brand">
          <span className="logo">SARUPAK</span>
          <span className="file-chip">{fileName}</span>
        </div>
        <div className="topbar-actions">
          <button
            type="button"
            className={`btn-ghost ${compare ? "is-active" : ""}`}
            onMouseDown={() => setCompare(true)}
            onMouseUp={() => setCompare(false)}
            onMouseLeave={() => setCompare(false)}
            onTouchStart={() => setCompare(true)}
            onTouchEnd={() => setCompare(false)}
            disabled={!hasGenerated}
          >
            Before
          </button>
          <button type="button" className="btn-ghost" onClick={resetEdits}>
            Reset
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={exportImage}
            disabled={!hasGenerated}
          >
            Export
          </button>
          <label className="btn-ghost file-btn">
            រូបថ្មី
            <input
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
                e.target.value = "";
              }}
            />
          </label>
        </div>
      </header>

      <div className="workspace">
        <section className="viewport">
          <canvas ref={canvasRef} className="preview-canvas" />
          {!hasGenerated && !busy && (
            <span className="compare-tag">
              Original — Generate ដើម្បីកែតាមតំបន់
            </span>
          )}
          {compare && hasGenerated && (
            <span className="compare-tag">Original</span>
          )}
          {busy && (
            <div className="gen-overlay" aria-live="polite">
              <span className="gen-spinner" />
              <span>{busyLabel}</span>
            </div>
          )}
        </section>

        <aside className="panel">
          <nav className="panel-tabs tabs-4" aria-label="Edit panels">
            {(
              [
                ["ai", "AI"],
                ["detail", "Detail"],
                ["basic", "Basic"],
                ["color", "Color"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={panel === id ? "is-active" : ""}
                onClick={() => setPanel(id)}
              >
                {label}
              </button>
            ))}
          </nav>

          <div className="panel-body">
            {panel === "ai" && (
              <div className="stack">
                <label className="field">
                  <span className="field-label">Prompt</span>
                  <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="ឧ. portrait pro, garden bloom, glow behind subject, soft bokeh…"
                    rows={3}
                  />
                </label>

                <div className="field">
                  <span className="field-label">ជម្រើសរចនា</span>
                  <div className="preset-grid">
                    {STYLE_PRESETS.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        className={`preset-chip ${presetId === p.id ? "is-active" : ""}`}
                        title={p.description}
                        onClick={() =>
                          setPresetId((cur) => (cur === p.id ? null : p.id))
                        }
                      >
                        <strong>{p.labelKm}</strong>
                        <span>{p.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="gen-actions">
                  <button
                    type="button"
                    className="btn-primary btn-block"
                    disabled={busy}
                    onClick={() => runGenerate("guided")}
                  >
                    Generate
                  </button>
                  <button
                    type="button"
                    className="btn-ghost btn-block"
                    disabled={busy}
                    onClick={() => runGenerate("auto")}
                  >
                    Generate Auto
                  </button>
                </div>

                {hasGenerated && analysis ? (
                  <div className="ai-card">
                    <div className="ai-meta">
                      <span>Scene</span>
                      <strong>{sceneLabel}</strong>
                    </div>
                    <div className="ai-meta">
                      <span>Style</span>
                      <strong>{analysis.styleName}</strong>
                    </div>
                    <div className="ai-meta">
                      <span>Mode</span>
                      <strong>
                        {analysis.hasPerson ? "Person" : "Landscape"}
                      </strong>
                    </div>
                    <div className="ai-meta">
                      <span>Masks</span>
                      <strong>
                        {analysis.hasPerson
                          ? masks?.quality === "ml"
                            ? "AI model"
                            : "Smart heuristic"
                          : "Sky / nature only"}
                      </strong>
                    </div>
                    <div className="region-pills">
                      {analysis.hasPerson ? (
                        <>
                          <span>subject</span>
                          <span>skin</span>
                        </>
                      ) : null}
                      <span>foliage</span>
                      <span>flower</span>
                      <span>sky</span>
                      {!analysis.hasPerson ? <span>landscape</span> : (
                        <span>background</span>
                      )}
                    </div>
                    <p className="ai-explain">{analysis.explanation}</p>
                    <p className="note">{analysis.maskNote}</p>
                  </div>
                ) : (
                  <p className="note">
                    ឧទាហរណ៍របស់អ្នក = Portrait Pro / Garden Bloom / Editorial
                    Glow។ AI នឹងបែងចែកមនុស្ស · សាច់ · ស្លឹក · ផ្កា ·
                    ផ្ទៃក្រោយ រួចកែផ្សេងគ្នា។
                  </p>
                )}

                {hasGenerated && (
                  <Slider
                    label="Strength"
                    value={strength}
                    min={0}
                    max={100}
                    onChange={onStrength}
                  />
                )}
              </div>
            )}

            {panel === "detail" && (
              <div className="stack">
                <p className="note">
                  កែលម្អិតតាមតំបន់ — ដូច Lightroom masks / portrait
                  separation។
                </p>
                <Slider
                  label="Subject lift"
                  value={effects.subjectLift}
                  min={0}
                  max={100}
                  onChange={(v) => setEffect("subjectLift", v)}
                />
                <Slider
                  label="Background dim"
                  value={effects.backgroundDim}
                  min={0}
                  max={100}
                  onChange={(v) => setEffect("backgroundDim", v)}
                />
                <Slider
                  label="Background blur (DOF)"
                  value={effects.backgroundBlur}
                  min={0}
                  max={100}
                  onChange={(v) => setEffect("backgroundBlur", v)}
                />
                <Slider
                  label="Skin glow"
                  value={effects.skinGlow}
                  min={0}
                  max={100}
                  onChange={(v) => setEffect("skinGlow", v)}
                />
                <Slider
                  label="Foliage pop"
                  value={effects.foliagePop}
                  min={0}
                  max={100}
                  onChange={(v) => setEffect("foliagePop", v)}
                />
                <Slider
                  label="Flower pop"
                  value={effects.flowerPop}
                  min={0}
                  max={100}
                  onChange={(v) => setEffect("flowerPop", v)}
                />
                <Slider
                  label="Rim / editorial glow"
                  value={effects.rimGlow}
                  min={0}
                  max={100}
                  onChange={(v) => setEffect("rimGlow", v)}
                />
                <Slider
                  label="Sky pop"
                  value={effects.skyPop}
                  min={0}
                  max={100}
                  onChange={(v) => setEffect("skyPop", v)}
                />
              </div>
            )}

            {panel === "basic" && (
              <div className="stack">
                <Slider
                  label="Exposure"
                  value={edits.exposure}
                  min={-2}
                  max={2}
                  step={0.05}
                  onChange={(v) => setGlobal("exposure", v)}
                />
                <Slider
                  label="Contrast"
                  value={edits.contrast}
                  min={-100}
                  max={100}
                  onChange={(v) => setGlobal("contrast", v)}
                />
                <Slider
                  label="Highlights"
                  value={edits.highlights}
                  min={-100}
                  max={100}
                  onChange={(v) => setGlobal("highlights", v)}
                />
                <Slider
                  label="Shadows"
                  value={edits.shadows}
                  min={-100}
                  max={100}
                  onChange={(v) => setGlobal("shadows", v)}
                />
                <Slider
                  label="Whites"
                  value={edits.whites}
                  min={-100}
                  max={100}
                  onChange={(v) => setGlobal("whites", v)}
                />
                <Slider
                  label="Blacks"
                  value={edits.blacks}
                  min={-100}
                  max={100}
                  onChange={(v) => setGlobal("blacks", v)}
                />
                <Slider
                  label="Clarity"
                  value={edits.clarity}
                  min={-100}
                  max={100}
                  onChange={(v) => setGlobal("clarity", v)}
                />
              </div>
            )}

            {panel === "color" && (
              <div className="stack">
                <Slider
                  label="Temperature"
                  value={edits.temperature}
                  min={-100}
                  max={100}
                  onChange={(v) => setGlobal("temperature", v)}
                />
                <Slider
                  label="Tint"
                  value={edits.tint}
                  min={-100}
                  max={100}
                  onChange={(v) => setGlobal("tint", v)}
                />
                <Slider
                  label="Vibrance"
                  value={edits.vibrance}
                  min={-100}
                  max={100}
                  onChange={(v) => setGlobal("vibrance", v)}
                />
                <Slider
                  label="Saturation"
                  value={edits.saturation}
                  min={-100}
                  max={100}
                  onChange={(v) => setGlobal("saturation", v)}
                />
              </div>
            )}
          </div>
        </aside>
      </div>

      {error && <p className="error-banner">{error}</p>}
    </main>
  );
}
