"use client";

import { useEffect, useState } from "react";
import {
  api,
  getApiBaseUrl,
  getStoredToken,
  type Job,
  type MediaAsset,
  type SubtitleSet,
} from "@/lib/api";

export function SubtitlePanel({
  projectId,
  media,
}: {
  projectId: string;
  media: MediaAsset[];
}) {
  const [sets, setSets] = useState<SubtitleSet[]>([]);
  const [active, setActive] = useState<SubtitleSet | null>(null);
  const [mediaId, setMediaId] = useState("");
  const [language, setLanguage] = useState("en");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [providerInfo, setProviderInfo] = useState<string>("");
  const [burnJob, setBurnJob] = useState<Job | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const avMedia = media.filter((m) => m.kind === "VIDEO" || m.kind === "AUDIO");

  async function refresh() {
    const list = await api.listSubtitles(projectId);
    setSets(list);
    if (active) {
      const next = list.find((s) => s.id === active.id);
      setActive(next ?? list[0] ?? null);
    } else if (list[0]) {
      setActive(list[0]);
    }
  }

  useEffect(() => {
    void (async () => {
      try {
        const providers = await api.subtitleProviders(projectId);
        setProviderInfo(`STT: ${providers.active}`);
        await refresh();
        if (!mediaId && avMedia[0]) setMediaId(avMedia[0].id);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load subtitles");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, media.length]);

  async function onGenerate() {
    if (!mediaId) {
      setError("Select a video/audio asset first.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await api.generateSubtitles(projectId, {
        mediaAssetId: mediaId,
        language,
      });
      setWarnings(result.warnings);
      setActive(result.subtitleSet);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generate failed");
    } finally {
      setBusy(false);
    }
  }

  async function saveSegment(
    segmentId: string,
    patch: { text?: string; startMs?: number; endMs?: number },
  ) {
    if (!active) return;
    setBusy(true);
    try {
      const updated = await api.patchSubtitleSegment(
        projectId,
        active.id,
        segmentId,
        patch,
      );
      setActive(updated);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function onSplit(segmentId: string, startMs: number, endMs: number) {
    if (!active) return;
    const atMs = Math.round((startMs + endMs) / 2);
    const updated = await api.splitSubtitle(projectId, active.id, {
      segmentId,
      atMs,
    });
    setActive(updated);
  }

  async function onMerge() {
    if (!active || selectedIds.length !== 2) return;
    const updated = await api.mergeSubtitles(projectId, active.id, {
      leftId: selectedIds[0]!,
      rightId: selectedIds[1]!,
    });
    setActive(updated);
    setSelectedIds([]);
  }

  function downloadText(filename: string, content: string, type: string) {
    const blob = new Blob([content], { type });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function onExport(kind: "srt" | "vtt") {
    if (!active) return;
    const token = getStoredToken();
    const url = `${getApiBaseUrl()}/projects/${projectId}/subtitles/${active.id}/export.${kind}`;
    const res = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) {
      setError(`Export ${kind.toUpperCase()} failed`);
      return;
    }
    const text = await res.text();
    downloadText(
      `subtitles-${active.id}.${kind}`,
      text,
      kind === "srt" ? "application/x-subrip" : "text/vtt",
    );
  }

  async function onBurnIn() {
    if (!active || !mediaId) return;
    setBusy(true);
    setError(null);
    try {
      const job = await api.burnInSubtitles(projectId, active.id, mediaId);
      setBurnJob(job);
      const tick = async () => {
        const latest = await api.getJob(job.id);
        setBurnJob(latest);
        if (latest.status === "QUEUED" || latest.status === "RUNNING") {
          window.setTimeout(tick, 800);
        }
      };
      void tick();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Burn-in failed");
    } finally {
      setBusy(false);
    }
  }

  async function downloadBurnIn() {
    if (!burnJob) return;
    const token = getStoredToken();
    const url = `${getApiBaseUrl()}/projects/${projectId}/subtitles/burn-in/${burnJob.id}/download`;
    const res = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) {
      setError("Burn-in download failed");
      return;
    }
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `burnin-${burnJob.id}.mp4`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <aside className="editor-subtitles">
      <h2>Subtitles</h2>
      <p className="studio-empty">{providerInfo}</p>

      <label>
        Source media
        <select
          value={mediaId}
          onChange={(e) => setMediaId(e.target.value)}
        >
          <option value="">Select…</option>
          {avMedia.map((m) => (
            <option key={m.id} value={m.id}>
              {m.originalName}
            </option>
          ))}
        </select>
      </label>

      <label>
        Language
        <select value={language} onChange={(e) => setLanguage(e.target.value)}>
          <option value="en">English</option>
          <option value="km">Khmer</option>
          <option value="auto">Auto / unspecified</option>
        </select>
      </label>

      <div className="editor-sub-actions">
        <button type="button" disabled={busy} onClick={() => void onGenerate()}>
          Generate
        </button>
        <button
          type="button"
          disabled={!active}
          onClick={() => void onExport("srt")}
        >
          SRT
        </button>
        <button
          type="button"
          disabled={!active}
          onClick={() => void onExport("vtt")}
        >
          VTT
        </button>
        <button
          type="button"
          disabled={!active || busy}
          onClick={() => void onBurnIn()}
        >
          Burn-in
        </button>
        <button
          type="button"
          disabled={selectedIds.length !== 2}
          onClick={() => void onMerge()}
        >
          Merge
        </button>
      </div>

      {error ? (
        <p className="studio-error" role="alert">
          {error}
        </p>
      ) : null}
      {warnings.length > 0 ? (
        <ul className="editor-sub-warnings">
          {warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      ) : null}
      {burnJob ? (
        <p className="studio-note">
          Burn-in {burnJob.status} · {Math.round(burnJob.progress * 100)}%
          {burnJob.status === "SUCCEEDED" ? (
            <>
              {" "}
              <button type="button" onClick={() => void downloadBurnIn()}>
                Download
              </button>
            </>
          ) : null}
          {burnJob.error ? ` — ${burnJob.error}` : null}
        </p>
      ) : null}

      {sets.length > 1 ? (
        <label>
          Subtitle set
          <select
            value={active?.id ?? ""}
            onChange={(e) => {
              const next = sets.find((s) => s.id === e.target.value) ?? null;
              setActive(next);
            }}
          >
            {sets.map((s) => (
              <option key={s.id} value={s.id}>
                {s.language} · {s.segments.length} cues
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {!active ? (
        <p className="studio-empty">No subtitle set yet. Generate from media.</p>
      ) : (
        <ul className="editor-cue-list">
          {active.segments.map((seg) => {
            const selected = selectedIds.includes(seg.id);
            return (
              <li key={seg.id} className={selected ? "is-selected" : ""}>
                <div className="editor-cue-meta">
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => {
                      setSelectedIds((ids) =>
                        selected
                          ? ids.filter((id) => id !== seg.id)
                          : [...ids, seg.id].slice(-2),
                      );
                    }}
                    aria-label="Select cue for merge"
                  />
                  <span>
                    {(seg.startMs / 1000).toFixed(2)}s –{" "}
                    {(seg.endMs / 1000).toFixed(2)}s
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      void onSplit(seg.id, seg.startMs, seg.endMs)
                    }
                  >
                    Split
                  </button>
                </div>
                <textarea
                  defaultValue={seg.text}
                  rows={2}
                  onBlur={(e) => {
                    if (e.target.value !== seg.text) {
                      void saveSegment(seg.id, { text: e.target.value });
                    }
                  }}
                />
                <div className="editor-cue-timing">
                  <label>
                    In
                    <input
                      type="number"
                      defaultValue={seg.startMs}
                      onBlur={(e) => {
                        const v = Number(e.target.value);
                        if (v !== seg.startMs) {
                          void saveSegment(seg.id, { startMs: v });
                        }
                      }}
                    />
                  </label>
                  <label>
                    Out
                    <input
                      type="number"
                      defaultValue={seg.endMs}
                      onBlur={(e) => {
                        const v = Number(e.target.value);
                        if (v !== seg.endMs) {
                          void saveSegment(seg.id, { endMs: v });
                        }
                      }}
                    />
                  </label>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}
