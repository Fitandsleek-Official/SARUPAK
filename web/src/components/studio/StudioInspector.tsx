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
        <h2>Inspector</h2>
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
        <p className="studio-empty">Select a clip on the timeline to edit properties.</p>
      ) : (
        <div className="studio-inspector-body">
          <section className="studio-inspector-section">
            <h3>Basic</h3>
            <p className="studio-inspector-meta">
              <strong>{selected.label ?? selected.id}</strong>
            </p>
            <p className="studio-inspector-meta">
              Track: {track?.name ?? "—"} ({track?.kind ?? "—"})
            </p>
            <dl className="studio-inspector-dl">
              <div>
                <dt>Start</dt>
                <dd>{(selected.startMs / 1000).toFixed(2)}s</dd>
              </div>
              <div>
                <dt>Duration</dt>
                <dd>{(selected.durationMs / 1000).toFixed(2)}s</dd>
              </div>
              <div>
                <dt>Trim in</dt>
                <dd>{(selected.trimInMs / 1000).toFixed(2)}s</dd>
              </div>
              <div>
                <dt>Trim out</dt>
                <dd>{(selected.trimOutMs / 1000).toFixed(2)}s</dd>
              </div>
            </dl>
            <p className="studio-empty">
              Trim and move on the timeline. Timing fields are read-only here.
            </p>
          </section>

          <section className="studio-inspector-section">
            <h3>Transform</h3>
            <p className="studio-note" role="status">
              Position, scale, rotation, and opacity are not in the current data
              model — controls omitted until schema support lands.
            </p>
          </section>

          <section className="studio-inspector-section">
            <h3>Audio</h3>
            <label className="studio-inspector-field">
              Volume
              <input
                type="range"
                min={0}
                max={2}
                step={0.05}
                value={selected.volume}
                onChange={(e) => setVolume(Number(e.target.value))}
                aria-valuemin={0}
                aria-valuemax={2}
                aria-valuenow={selected.volume}
              />
              <span className="studio-inspector-value">
                {selected.volume.toFixed(2)}
              </span>
            </label>
          </section>

          <section className="studio-inspector-section">
            <h3>Text / subtitle</h3>
            {track?.kind === "text" ||
            track?.kind === "captions" ||
            selected.text != null ? (
              <label className="studio-inspector-field">
                Clip text
                <textarea
                  value={selected.text ?? ""}
                  rows={3}
                  maxLength={500}
                  onChange={(e) => setClipText(e.target.value)}
                  aria-label="Clip text"
                />
              </label>
            ) : (
              <p className="studio-empty">
                Select a text/captions clip, or use the Captions tool for
                subtitle sets.
              </p>
            )}
          </section>

          <p className="studio-empty studio-inspector-shortcuts">
            Space play · S split · Del delete · ⌘Z undo
          </p>
        </div>
      )}
    </aside>
  );
}
