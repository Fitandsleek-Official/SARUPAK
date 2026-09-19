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
      <p className="studio-library-hint">
        Import a file, then tap <strong>Add to timeline</strong>.
      </p>
      <label className={`editor-upload ${busy ? "is-busy" : ""}`}>
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
        {busy ? "Uploading…" : `+ Import ${title.toLowerCase()}`}
      </label>
      {filtered.length === 0 ? (
        <div className="studio-library-empty">
          <p>No files yet</p>
          <span>
            {kinds?.length === 1 && kinds[0] === "AUDIO"
              ? "Import an MP3/WAV to start."
              : "Import an MP4 to start editing."}
          </span>
        </div>
      ) : (
        <ul className="editor-media-list">
          {filtered.map((m) => (
            <li key={m.id} className="editor-media-card">
              <div className="editor-media-kind" data-kind={m.kind}>
                {m.kind === "AUDIO" ? "AUD" : m.kind === "IMAGE" ? "IMG" : "VID"}
              </div>
              <div className="editor-media-meta">
                <strong title={m.originalName}>{m.originalName}</strong>
                <span>
                  {m.durationMs != null
                    ? `${(m.durationMs / 1000).toFixed(1)}s`
                    : "—"}
                  {m.width && m.height ? ` · ${m.width}×${m.height}` : ""}
                </span>
              </div>
              <button
                type="button"
                className="editor-media-add"
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
