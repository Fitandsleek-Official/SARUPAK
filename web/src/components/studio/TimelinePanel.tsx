"use client";

import { useRef } from "react";
import { useEditorStore } from "@/lib/editorStore";

export function TimelinePanel() {
  const timeline = useEditorStore((s) => s.timeline);
  const selectedClipId = useEditorStore((s) => s.selectedClipId);
  const pixelsPerSecond = useEditorStore((s) => s.pixelsPerSecond);
  const selectClip = useEditorStore((s) => s.selectClip);
  const scrub = useEditorStore((s) => s.scrub);
  const beginGesture = useEditorStore((s) => s.beginGesture);
  const liveMoveSelected = useEditorStore((s) => s.liveMoveSelected);
  const liveTrimSelected = useEditorStore((s) => s.liveTrimSelected);
  const endGesture = useEditorStore((s) => s.endGesture);
  const toggleMute = useEditorStore((s) => s.toggleMute);
  const durationMs = useEditorStore((s) => s.durationMs);
  const drag = useRef<{
    mode: "move" | "in" | "out";
    originX: number;
    originStart: number;
    originEnd: number;
  } | null>(null);

  if (!timeline) return null;

  const totalMs = Math.max(durationMs(), 5000);
  const widthPx = (totalMs / 1000) * pixelsPerSecond + 200;
  const playheadX = (timeline.playheadMs / 1000) * pixelsPerSecond;

  return (
    <div className="editor-timeline">
      <div
        className="editor-timeline-ruler"
        style={{ width: widthPx }}
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const scrollParent = e.currentTarget.parentElement;
          const x =
            e.clientX -
            rect.left +
            (scrollParent ? scrollParent.scrollLeft : 0);
          scrub(Math.max(0, (x / pixelsPerSecond) * 1000));
        }}
      >
        {Array.from({ length: Math.ceil(totalMs / 1000) + 1 }).map((_, i) => (
          <span key={i} style={{ left: i * pixelsPerSecond }}>
            {i}s
          </span>
        ))}
        <div className="editor-playhead" style={{ left: playheadX }} />
      </div>

      {timeline.tracks
        .filter((t) => t.kind === "video" || t.kind === "audio")
        .map((track) => (
          <div key={track.id} className="editor-track">
            <div className="editor-track-meta">
              <strong>{track.name}</strong>
              <button type="button" onClick={() => toggleMute(track.id)}>
                {track.muted ? "Unmute" : "Mute"}
              </button>
            </div>
            <div className="editor-track-lane" style={{ width: widthPx }}>
              <div className="editor-playhead" style={{ left: playheadX }} />
              {track.clips.map((clip) => {
                const left = (clip.startMs / 1000) * pixelsPerSecond;
                const w = Math.max(
                  8,
                  (clip.durationMs / 1000) * pixelsPerSecond,
                );
                const selected = clip.id === selectedClipId;
                return (
                  <div
                    key={clip.id}
                    className={`editor-clip ${track.kind} ${selected ? "is-selected" : ""}`}
                    style={{ left, width: w }}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      selectClip(clip.id);
                      beginGesture();
                      const target = e.target as HTMLElement;
                      const mode = target.dataset.handle as
                        | "in"
                        | "out"
                        | undefined;
                      drag.current = {
                        mode: mode ?? "move",
                        originX: e.clientX,
                        originStart: clip.startMs,
                        originEnd: clip.startMs + clip.durationMs,
                      };
                      const onMove = (ev: MouseEvent) => {
                        if (!drag.current) return;
                        const dx = ev.clientX - drag.current.originX;
                        const dMs = (dx / pixelsPerSecond) * 1000;
                        if (drag.current.mode === "move") {
                          liveMoveSelected(
                            Math.max(0, drag.current.originStart + dMs),
                          );
                        } else if (drag.current.mode === "in") {
                          liveTrimSelected(
                            "in",
                            drag.current.originStart + dMs,
                          );
                        } else {
                          liveTrimSelected(
                            "out",
                            drag.current.originEnd + dMs,
                          );
                        }
                      };
                      const onUp = () => {
                        drag.current = null;
                        endGesture();
                        window.removeEventListener("mousemove", onMove);
                        window.removeEventListener("mouseup", onUp);
                      };
                      window.addEventListener("mousemove", onMove);
                      window.addEventListener("mouseup", onUp);
                    }}
                  >
                    <span
                      className="editor-clip-handle in"
                      data-handle="in"
                    />
                    <span className="editor-clip-label">
                      {clip.label ?? clip.id}
                    </span>
                    <span
                      className="editor-clip-handle out"
                      data-handle="out"
                    />
                  </div>
                );
              })}
            </div>
          </div>
        ))}
    </div>
  );
}
