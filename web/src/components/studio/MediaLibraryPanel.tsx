"use client";

import type { MediaAsset } from "@/lib/api";
import { useEditorStore } from "@/lib/editorStore";

type MediaKind = "VIDEO" | "AUDIO" | "IMAGE";

export function MediaLibraryPanel({
  media,
  onUpload,
  busy,
  kinds,
  title = "Media",
}: {
  media: MediaAsset[];
  onUpload: (file: File) => void;
  busy: boolean;
  kinds?: MediaKind[];
  title?: string;
}) {
  const addMediaClip = useEditorStore((s) => s.addMediaClip);
  const filtered = kinds
    ? media.filter((m) => kinds.includes(m.kind as MediaKind))
    : media;

  const accept = kinds
    ? kinds
        .map((k) =>
          k === "VIDEO"
            ? "video/*"
            : k === "AUDIO"
              ? "audio/*"
              : "image/png,image/jpeg,image/webp,image/gif",
        )
        .join(",")
    : "video/*,audio/*,image/png,image/jpeg,image/webp,image/gif";

  return (
    <aside className="editor-library" aria-label={title}>
      <h2>{title}</h2>
      <label className="editor-upload">
        <input
          type="file"
          accept={accept}
          disabled={busy}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onUpload(f);
            e.currentTarget.value = "";
          }}
        />
        Import {title.toLowerCase()}
      </label>
      {filtered.length === 0 ? (
        <p className="studio-empty">
          {kinds?.length === 1 && kinds[0] === "AUDIO"
            ? "Import an audio file to begin."
            : "Import a video or audio file to begin."}
        </p>
      ) : (
        <ul className="editor-media-list">
          {filtered.map((m) => (
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
                    kind: m.kind as MediaKind,
                    label: m.originalName,
                    durationMs:
                      m.durationMs ?? (m.kind === "IMAGE" ? 3000 : 5000),
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
