"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import {
  ApiError,
  api,
  getStoredToken,
  type MediaAsset,
  type Project,
} from "@/lib/api";

export function StudioProjectWorkspace({ projectId }: { projectId: string }) {
  const [project, setProject] = useState<Project | null>(null);
  const [media, setMedia] = useState<MediaAsset[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );
  const [name, setName] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    if (!getStoredToken()) {
      setError("Sign in from /studio first.");
      return;
    }
    try {
      const p = await api.getProject(projectId);
      setProject(p);
      setName(p.name);
      const assets = await api.listMedia(projectId);
      setMedia(assets);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load project");
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  function scheduleAutosave(nextName: string) {
    if (!project) return;
    setSaveState("saving");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try {
        const updated = await api.updateProject(projectId, {
          name: nextName,
          timeline: project.timeline,
          createSnapshot: true,
          snapshotLabel: "autosave",
        });
        setProject(updated);
        setSaveState("saved");
      } catch (err) {
        setSaveState("error");
        setError(err instanceof Error ? err.message : "Autosave failed");
      }
    }, 700);
  }

  function onRename(e: FormEvent) {
    e.preventDefault();
    scheduleAutosave(name.trim() || "Untitled Project");
  }

  async function onUpload(file: File | null) {
    if (!file) return;
    setError(null);
    try {
      await api.uploadMedia(projectId, file);
      await load();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Upload failed");
      }
    }
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

  if (!project) {
    return (
      <main className="studio-shell">
        <p>Loading project…</p>
      </main>
    );
  }

  return (
    <main className="studio-shell">
      <header className="studio-header">
        <div>
          <Link href="/studio" className="studio-back">
            ← All projects
          </Link>
          <h1>{project.name}</h1>
          <p className="studio-lead">
            Canvas {project.width}×{project.height} · {project.frameRate} fps ·
            schema v{project.schemaVersion}
          </p>
        </div>
        <p className="studio-note" aria-live="polite">
          {saveState === "saving"
            ? "Autosaving…"
            : saveState === "saved"
              ? "Autosaved"
              : saveState === "error"
                ? "Autosave failed"
                : "Ready"}
        </p>
      </header>

      {error ? (
        <p className="studio-error" role="alert">
          {error}
        </p>
      ) : null}

      <section className="studio-panel">
        <h2>Project</h2>
        <form className="studio-row" onSubmit={onRename}>
          <input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              scheduleAutosave(e.target.value);
            }}
            aria-label="Project name"
          />
          <button type="submit">Save now</button>
        </form>
      </section>

      <section className="studio-panel">
        <h2>Media library</h2>
        <input
          type="file"
          accept="video/*,audio/*,image/png,image/jpeg,image/webp,image/gif"
          onChange={(e) => void onUpload(e.target.files?.[0] ?? null)}
        />
        {media.length === 0 ? (
          <p className="studio-empty">No media uploaded yet.</p>
        ) : (
          <ul className="studio-list">
            {media.map((m) => (
              <li key={m.id}>
                <div>
                  <strong>{m.originalName}</strong>
                  <span>
                    {m.kind} · {m.mimeType} · {m.sizeBytes} bytes
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="studio-panel">
        <h2>Timeline (Phase 2)</h2>
        <p className="studio-empty">
          Timeline JSON is persisted on the server. Multi-track editing UI ships
          in Phase 2.
        </p>
        <pre className="studio-json">
          {JSON.stringify(project.timeline, null, 2)}
        </pre>
      </section>
    </main>
  );
}
