"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type CSSProperties, type MouseEvent as ReactMouseEvent } from "react";
import {
  api,
  getApiBaseUrl,
  getStoredToken,
  setStoredToken,
  verifyExpectedApi,
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
import { StudioTopBar, type SaveStatus } from "./StudioTopBar";
import { StudioToolRail } from "./StudioToolRail";
import { StudioInspector } from "./StudioInspector";
import { PlaceholderToolPanel } from "./PlaceholderToolPanel";
import { TextToolPanel } from "./TextToolPanel";
import type { StudioToolId } from "./studioTools";

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
  const [activeTool, setActiveTool] = useState<StudioToolId>("media");
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [toolPanelOpen, setToolPanelOpen] = useState(true);
  const [toolPanelWidth, setToolPanelWidth] = useState(300);
  const [inspectorWidth, setInspectorWidth] = useState(280);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [apiOffline, setApiOffline] = useState<string | null>(null);

  function startResize(
    edge: "tool" | "inspector",
    ev: ReactMouseEvent,
  ) {
    ev.preventDefault();
    const startX = ev.clientX;
    const startTool = toolPanelWidth;
    const startInsp = inspectorWidth;
    const onMove = (e: globalThis.MouseEvent) => {
      const dx = e.clientX - startX;
      if (edge === "tool") {
        setToolPanelWidth(Math.min(480, Math.max(220, startTool + dx)));
      } else {
        setInspectorWidth(Math.min(420, Math.max(200, startInsp - dx)));
      }
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 1100px)");
    const apply = () => setInspectorOpen(!mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await verifyExpectedApi();
        if (!cancelled) setApiOffline(null);
      } catch (err) {
        if (!cancelled) {
          setApiOffline(
            err instanceof Error
              ? err.message
              : "SARUPAK API offline or unreachable",
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const timeline = useEditorStore((s) => s.timeline);
  const dirty = useEditorStore((s) => s.dirty);
  const selectedClipId = useEditorStore((s) => s.selectedClipId);
  const isPlaying = useEditorStore((s) => s.isPlaying);
  const canUndo = useEditorStore((s) => s.canUndo);
  const canRedo = useEditorStore((s) => s.canRedo);
  const init = useEditorStore((s) => s.init);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);
  const deleteSelected = useEditorStore((s) => s.deleteSelected);
  const splitAtPlayhead = useEditorStore((s) => s.splitAtPlayhead);
  const markSaved = useEditorStore((s) => s.markSaved);
  const setPlaying = useEditorStore((s) => s.setPlaying);
  const selected = findSelectedClip(timeline, selectedClipId);

  const load = useCallback(async () => {
    if (!getStoredToken()) {
      setError("Sign in from /studio first.");
      return;
    }
    try {
      const me = await api.me();
      setUserEmail(me.email);
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

  function onSignOut() {
    setStoredToken(null);
    window.location.href = "/studio";
  }

  const topSaveStatus: SaveStatus =
    saveState === "saving"
      ? "saving"
      : saveState === "error"
        ? "error"
        : dirty
          ? "unsaved"
          : saveState === "saved"
            ? "saved"
            : "idle";

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
      <main className="studio-shell-app studio-shell-loading">
        <p>Loading editor…</p>
      </main>
    );
  }

  const exportDisabled = media.length === 0 && timeline.tracks.every((t) => t.clips.length === 0);

  return (
    <div className="studio-shell-app">
      <StudioTopBar
        projectName={project.name}
        saveStatus={topSaveStatus}
        canUndo={canUndo}
        canRedo={canRedo}
        isPlaying={isPlaying}
        onUndo={() => undo()}
        onRedo={() => redo()}
        onTogglePlay={() => setPlaying(!isPlaying)}
        onExport={() => void onExport()}
        exportDisabled={exportDisabled}
        aspect={aspect}
        onAspectChange={setAspect}
        onSplit={() => splitAtPlayhead()}
        onDelete={() => deleteSelected()}
        canSplit={Boolean(selected)}
        canDelete={Boolean(selected)}
        userEmail={userEmail}
        onSignOut={onSignOut}
      />

      {apiOffline ? (
        <p className="studio-error editor-banner" role="alert">
          API offline: {apiOffline}
        </p>
      ) : null}

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

      <div className="studio-shell-body">
        <StudioToolRail
          active={activeTool}
          onChange={setActiveTool}
          orientation="vertical"
        />

        <div
          className={`studio-shell-workspace ${toolPanelOpen ? "" : "is-tool-collapsed"} ${inspectorOpen ? "" : "is-inspector-collapsed"}`}
          style={
            {
              ["--studio-tool-w" as string]: `${toolPanelWidth}px`,
              ["--studio-inspector-w" as string]: `${inspectorWidth}px`,
            } as CSSProperties
          }
        >
          {toolPanelOpen ? (
          <div
            className="studio-shell-tool-panel"
            id={`studio-tool-panel-${activeTool}`}
            role="tabpanel"
            aria-labelledby={`studio-tool-${activeTool}`}
          >
            {activeTool === "media" ? (
              <MediaLibraryPanel
                projectId={projectId}
                media={media}
                onUpload={onUpload}
                busy={busy}
                title="Media"
              />
            ) : null}
            {activeTool === "audio" ? (
              <MediaLibraryPanel
                projectId={projectId}
                media={media}
                onUpload={onUpload}
                busy={busy}
                kinds={["AUDIO"]}
                title="Audio"
              />
            ) : null}
            {activeTool === "text" ? <TextToolPanel /> : null}
            {activeTool === "captions" ? (
              <SubtitlePanel projectId={projectId} media={media} />
            ) : null}
            {activeTool === "effects" ? (
              <PlaceholderToolPanel
                title="Effects"
                description="Visual effects will appear here in a later phase."
              />
            ) : null}
            {activeTool === "transitions" ? (
              <PlaceholderToolPanel
                title="Transitions"
                description="Clip transitions will appear here in a later phase."
              />
            ) : null}
            {activeTool === "dubbing" ? (
              <DubbingPanel projectId={projectId} media={media} />
            ) : null}
          </div>
          ) : null}

          {toolPanelOpen ? (
            <div
              className="studio-resize-handle"
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize tool panel"
              onMouseDown={(e) => startResize("tool", e)}
            />
          ) : null}

          <div className="studio-shell-canvas">
            <div className="studio-shell-canvas-bar">
              <button
                type="button"
                className="studio-panel-toggle"
                onClick={() => setToolPanelOpen((v) => !v)}
                aria-expanded={toolPanelOpen}
              >
                {toolPanelOpen ? "Hide panel" : "Show panel"}
              </button>
              <span className="studio-shell-canvas-hint">
                Preview · click timeline clips to edit
              </span>
              <button
                type="button"
                className="studio-inspector-toggle"
                onClick={() => setInspectorOpen((v) => !v)}
                aria-expanded={inspectorOpen}
                aria-controls="studio-inspector"
              >
                {inspectorOpen ? "Hide clip" : "Show clip"}
              </button>
            </div>
            <PreviewPlayer
              projectId={projectId}
              width={project.width}
              height={project.height}
              media={media}
            />
          </div>

          {inspectorOpen ? (
            <div
              className="studio-resize-handle"
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize inspector"
              onMouseDown={(e) => startResize("inspector", e)}
            />
          ) : null}

          <StudioInspector
            open={inspectorOpen}
            onClose={() => setInspectorOpen(false)}
          />
        </div>
      </div>

      <StudioToolRail
        active={activeTool}
        onChange={setActiveTool}
        orientation="horizontal"
      />

      <TimelinePanel projectId={projectId} />
    </div>
  );
}
