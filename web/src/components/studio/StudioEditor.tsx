"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  api,
  getApiBaseUrl,
  getStoredToken,
  type Job,
  type MediaAsset,
  type Project,
} from "@/lib/api";
import type { TimelineDocumentV1 } from "@sarupak/shared-types";
import { computeTimelineDurationMs } from "@sarupak/editor-core";
import { findSelectedClip, useEditorStore } from "@/lib/editorStore";
import { MediaLibraryPanel } from "./MediaLibraryPanel";
import { PreviewPlayer } from "./PreviewPlayer";
import { SubtitlePanel } from "./SubtitlePanel";
import { DubbingPanel } from "./DubbingPanel";
import { TimelinePanel } from "./TimelinePanel";

export function StudioEditor({ projectId }: { projectId: string }) {
  const [project, setProject] = useState<Project | null>(null);
  const [media, setMedia] = useState<MediaAsset[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );
  const [exportJob, setExportJob] = useState<Job | null>(null);
  const [aspect, setAspect] = useState<"16:9" | "9:16" | "1:1">("16:9");

  const timeline = useEditorStore((s) => s.timeline);
  const dirty = useEditorStore((s) => s.dirty);
  const selectedClipId = useEditorStore((s) => s.selectedClipId);
  const init = useEditorStore((s) => s.init);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);
  const deleteSelected = useEditorStore((s) => s.deleteSelected);
  const splitAtPlayhead = useEditorStore((s) => s.splitAtPlayhead);
  const setVolume = useEditorStore((s) => s.setVolume);
  const zoomBy = useEditorStore((s) => s.zoomBy);
  const markSaved = useEditorStore((s) => s.markSaved);
  const selected = findSelectedClip(timeline, selectedClipId);

  const load = useCallback(async () => {
    if (!getStoredToken()) {
      setError("Sign in from /studio first.");
      return;
    }
    try {
      const p = await api.getProject(projectId);
      setProject(p);
      const tl = p.timeline as TimelineDocumentV1;
      init(projectId, tl);
      const assets = await api.listMedia(projectId);
      setMedia(assets);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load project");
    }
  }, [projectId, init]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (
        (meta && e.key.toLowerCase() === "z" && e.shiftKey) ||
        (meta && e.key.toLowerCase() === "y")
      ) {
        e.preventDefault();
        redo();
      } else if (e.key === "Delete" || e.key === "Backspace") {
        if (
          (e.target as HTMLElement)?.tagName === "INPUT" ||
          (e.target as HTMLElement)?.tagName === "TEXTAREA"
        ) {
          return;
        }
        e.preventDefault();
        deleteSelected();
      } else if (e.key.toLowerCase() === "s" && !meta) {
        e.preventDefault();
        splitAtPlayhead();
      } else if (e.code === "Space") {
        if (
          (e.target as HTMLElement)?.tagName === "INPUT" ||
          (e.target as HTMLElement)?.tagName === "TEXTAREA" ||
          (e.target as HTMLElement)?.tagName === "BUTTON"
        ) {
          return;
        }
        e.preventDefault();
        const playing = useEditorStore.getState().isPlaying;
        useEditorStore.getState().setPlaying(!playing);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo, deleteSelected, splitAtPlayhead]);

  useEffect(() => {
    if (!dirty || !timeline || !project) return;
    setSaveState("saving");
    const t = window.setTimeout(async () => {
      try {
        const durationMs = computeTimelineDurationMs(timeline);
        await api.updateProject(projectId, {
          timeline,
          durationMs,
          createSnapshot: true,
          snapshotLabel: "autosave",
        });
        markSaved();
        setSaveState("saved");
      } catch {
        setSaveState("error");
      }
    }, 800);
    return () => window.clearTimeout(t);
  }, [dirty, timeline, project, projectId, markSaved]);

  async function onUpload(file: File) {
    setBusy(true);
    setError(null);
    try {
      await api.uploadMedia(projectId, file);
      const assets = await api.listMedia(projectId);
      setMedia(assets);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function onExport() {
    if (!timeline) return;
    setError(null);
    try {
      // Ensure latest timeline is persisted before render
      await api.updateProject(projectId, {
        timeline,
        durationMs: computeTimelineDurationMs(timeline),
      });
      const job = await api.startExport(projectId, aspect);
      setExportJob(job);
      pollExport(job.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed to start");
    }
  }

  function pollExport(jobId: string) {
    const tick = async () => {
      try {
        const job = await api.getJob(jobId);
        setExportJob(job);
        if (job.status === "QUEUED" || job.status === "RUNNING") {
          window.setTimeout(tick, 1000);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Export status failed");
      }
    };
    void tick();
  }

  async function downloadExport() {
    if (!exportJob) return;
    const token = getStoredToken();
    const url = `${getApiBaseUrl()}/projects/${projectId}/export/jobs/${exportJob.id}/download`;
    const res = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) {
      setError("Download failed");
      return;
    }
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `sarupak-${exportJob.id}.mp4`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  if (error && !project) {
    return (
      <main className="studio-shell">
        <p className="studio-error" role="alert">
          {error}
        </p>
        <Link href="/studio">Back to studio</Link>
      </main>
    );
  }

  if (!project || !timeline) {
    return (
      <main className="studio-shell">
        <p>Loading editor…</p>
      </main>
    );
  }

  return (
    <div className="editor-app">
      <header className="editor-toolbar">
        <div className="editor-toolbar-left">
          <Link href="/studio" className="studio-back">
            ← Projects
          </Link>
          <h1>{project.name}</h1>
          <span className="editor-save" aria-live="polite">
            {saveState === "saving"
              ? "Saving…"
              : saveState === "saved"
                ? "Saved"
                : saveState === "error"
                  ? "Save failed"
                  : dirty
                    ? "Unsaved"
                    : "Ready"}
          </span>
        </div>
        <div className="editor-toolbar-actions">
          <button type="button" onClick={() => undo()}>
            Undo
          </button>
          <button type="button" onClick={() => redo()}>
            Redo
          </button>
          <button type="button" onClick={() => splitAtPlayhead()}>
            Split
          </button>
          <button type="button" onClick={() => deleteSelected()}>
            Delete
          </button>
          <button type="button" onClick={() => zoomBy(0.25)}>
            Zoom +
          </button>
          <button type="button" onClick={() => zoomBy(-0.25)}>
            Zoom −
          </button>
          <select
            value={aspect}
            onChange={(e) =>
              setAspect(e.target.value as "16:9" | "9:16" | "1:1")
            }
            aria-label="Export aspect ratio"
          >
            <option value="16:9">Export 16:9</option>
            <option value="9:16">Export 9:16</option>
            <option value="1:1">Export 1:1</option>
          </select>
          <button type="button" className="editor-export" onClick={() => void onExport()}>
            Export MP4
          </button>
        </div>
      </header>

      {error ? (
        <p className="studio-error editor-banner" role="alert">
          {error}
        </p>
      ) : null}

      {exportJob ? (
        <p className="studio-note editor-banner">
          Export {exportJob.status} · {Math.round(exportJob.progress * 100)}%
          {exportJob.status === "SUCCEEDED" ? (
            <>
              {" "}
              <button type="button" onClick={() => void downloadExport()}>
                Download
              </button>
            </>
          ) : null}
          {exportJob.status === "FAILED" ? ` — ${exportJob.error}` : null}
        </p>
      ) : null}

      <div className="editor-body">
        <MediaLibraryPanel media={media} onUpload={onUpload} busy={busy} />
        <div className="editor-center">
          <PreviewPlayer
            projectId={projectId}
            width={project.width}
            height={project.height}
            media={media}
          />
          <aside className="editor-inspector">
            <h2>Inspector</h2>
            {selected ? (
              <>
                <p>{selected.label ?? selected.id}</p>
                <label>
                  Volume
                  <input
                    type="range"
                    min={0}
                    max={2}
                    step={0.05}
                    value={selected.volume}
                    onChange={(e) => setVolume(Number(e.target.value))}
                  />
                </label>
                <p className="studio-empty">
                  Start {(selected.startMs / 1000).toFixed(2)}s · Dur{" "}
                  {(selected.durationMs / 1000).toFixed(2)}s · Trim{" "}
                  {(selected.trimInMs / 1000).toFixed(2)}–
                  {(selected.trimOutMs / 1000).toFixed(2)}s
                </p>
                <p className="studio-empty">
                  Shortcuts: Space play · S split · Del delete · ⌘Z undo
                </p>
              </>
            ) : (
              <p className="studio-empty">Select a clip on the timeline.</p>
            )}
          </aside>
          <SubtitlePanel projectId={projectId} media={media} />
          <DubbingPanel projectId={projectId} media={media} />
        </div>
      </div>

      <TimelinePanel />
    </div>
  );
}
