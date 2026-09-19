"use client";

import { findSelectedClip, useEditorStore } from "@/lib/editorStore";

export function StudioInspector({
  open = true,
  onClose,
}: {
  open?: boolean;
  onClose?: () => void;
}) {
  const timeline = useEditorStore((s) => s.timeline);
  const selectedClipId = useEditorStore((s) => s.selectedClipId);
  const setVolume = useEditorStore((s) => s.setVolume);
  const setClipText = useEditorStore((s) => s.setClipText);
  const deleteSelected = useEditorStore((s) => s.deleteSelected);
  const selected = findSelectedClip(timeline, selectedClipId);
  const track = selected
    ? timeline?.tracks.find((t) => t.clips.some((c) => c.id === selected.id))
    : null;

  if (!open) return null;

  return (
    <aside
      className="studio-inspector"
      aria-label="Inspector"
      id="studio-inspector"
    >
      <div className="studio-inspector-header">
        <h2>Clip</h2>
        {onClose ? (
          <button
            type="button"
            className="studio-inspector-close"
            onClick={onClose}
            aria-label="Close inspector"
          >
            ×
          </button>
        ) : null}
      </div>

      {!selected ? (
        <p className="studio-empty">
          Click a green/blue clip on the timeline below to edit it here.
        </p>
      ) : (
        <div className="studio-inspector-body">
          <p className="studio-inspector-title">
            {selected.label ?? selected.id}
          </p>
          <p className="studio-inspector-meta">
            {track?.name ?? "Track"} · {(selected.durationMs / 1000).toFixed(1)}s
          </p>

          <section className="studio-inspector-section">
            <h3>Volume</h3>
            <label className="studio-inspector-field">
              <input
                type="range"
                min={0}
                max={2}
                step={0.05}
                value={selected.volume}
                onChange={(e) => setVolume(Number(e.target.value))}
                aria-label="Clip volume"
              />
              <span className="studio-inspector-value">
                {Math.round(selected.volume * 100)}%
              </span>
            </label>
          </section>

          {(track?.kind === "text" ||
            track?.kind === "captions" ||
            selected.text != null) && (
            <section className="studio-inspector-section">
              <h3>Text</h3>
              <label className="studio-inspector-field">
                <textarea
                  value={selected.text ?? ""}
                  rows={3}
                  maxLength={500}
                  onChange={(e) => setClipText(e.target.value)}
                  aria-label="Clip text"
                />
              </label>
            </section>
          )}

          <section className="studio-inspector-section is-compact">
            <h3>Timing</h3>
            <p className="studio-inspector-meta">
              Drag the clip or its edges on the timeline to trim.
            </p>
            <dl className="studio-inspector-dl">
              <div>
                <dt>In</dt>
                <dd>{(selected.startMs / 1000).toFixed(1)}s</dd>
              </div>
              <div>
                <dt>Out</dt>
                <dd>
                  {(
                    (selected.startMs + selected.durationMs) /
                    1000
                  ).toFixed(1)}
                  s
                </dd>
              </div>
            </dl>
          </section>

          <button
            type="button"
            className="studio-inspector-danger"
            onClick={() => deleteSelected()}
          >
            Delete clip
          </button>

          <p className="studio-inspector-shortcuts">
            Space = play · S = split · Del = delete
          </p>
        </div>
      )}
    </aside>
  );
}
