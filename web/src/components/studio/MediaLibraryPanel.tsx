"use client";

import type { MediaAsset } from "@/lib/api";
import { useEditorStore } from "@/lib/editorStore";

export function MediaLibraryPanel({
  media,
  onUpload,
  busy,
}: {
  media: MediaAsset[];
  onUpload: (file: File) => void;
  busy: boolean;
}) {
  const addMediaClip = useEditorStore((s) => s.addMediaClip);

  return (
    <aside className="editor-library">
      <h2>Media</h2>
      <label className="editor-upload">
        <input
          type="file"
          accept="video/*,audio/*,image/png,image/jpeg,image/webp,image/gif"
          disabled={busy}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onUpload(f);
            e.currentTarget.value = "";
          }}
        />
        Import media
      </label>
      {media.length === 0 ? (
        <p className="studio-empty">Import a video or audio file to begin.</p>
      ) : (
        <ul className="editor-media-list">
          {media.map((m) => (
            <li key={m.id}>
              <div>
                <strong>{m.originalName}</strong>
                <span>
                  {m.kind}
                  {m.durationMs != null
                    ? ` · ${(m.durationMs / 1000).toFixed(1)}s`
                    : ""}
                  {m.width && m.height ? ` · ${m.width}×${m.height}` : ""}
                </span>
              </div>
              <button
                type="button"
                onClick={() =>
                  addMediaClip({
                    mediaAssetId: m.id,
                    kind: m.kind as "VIDEO" | "AUDIO" | "IMAGE",
                    label: m.originalName,
                    durationMs: m.durationMs ?? (m.kind === "IMAGE" ? 3000 : 5000),
                  })
                }
              >
                Add to timeline
              </button>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
