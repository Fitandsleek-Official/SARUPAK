"use client";

import { useState } from "react";
import { useEditorStore } from "@/lib/editorStore";

export function TextToolPanel() {
  const [text, setText] = useState("New text");
  const [durationSec, setDurationSec] = useState(3);
  const addTextClip = useEditorStore((s) => s.addTextClip);
  const timeline = useEditorStore((s) => s.timeline);

  const captionsTrack = timeline?.tracks.find(
    (t) => t.kind === "captions" || t.kind === "text",
  );

  return (
    <div className="studio-text-panel">
      <h2>Text</h2>
      <p className="studio-empty">
        Add a text clip to the captions track at the playhead.
      </p>
      {!captionsTrack ? (
        <p className="studio-note" role="status">
          No text/captions track on this timeline.
        </p>
      ) : (
        <form
          className="studio-text-form"
          onSubmit={(e) => {
            e.preventDefault();
            const trimmed = text.trim();
            if (!trimmed) return;
            addTextClip({
              text: trimmed,
              durationMs: Math.max(500, Math.round(durationSec * 1000)),
            });
          }}
        >
          <label>
            Text
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={3}
              maxLength={500}
              aria-label="Text clip content"
            />
          </label>
          <label>
            Duration (seconds)
            <input
              type="number"
              min={0.5}
              max={60}
              step={0.5}
              value={durationSec}
              onChange={(e) => setDurationSec(Number(e.target.value) || 3)}
              aria-label="Text clip duration"
            />
          </label>
          <button type="submit" disabled={!text.trim()}>
            Add to timeline
          </button>
        </form>
      )}
    </div>
  );
}
