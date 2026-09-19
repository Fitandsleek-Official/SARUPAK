"use client";

import { useState } from "react";
import type { MediaAsset } from "@/lib/api";
import { mediaContentUrl } from "@/lib/api";
import { useEditorStore } from "@/lib/editorStore";

type MediaKind = "VIDEO" | "AUDIO" | "IMAGE";

function shortName(name: string): string {
  if (name.length <= 42) return name;
  const ext = name.includes(".") ? name.slice(name.lastIndexOf(".")) : "";
  return `${name.slice(0, 28)}…${ext}`;
}

export function MediaLibraryPanel({
  projectId,
  media,
  onUpload,
  busy,
  kinds,
  title = "Media",
}: {
  projectId: string;
  media: MediaAsset[];
  onUpload: (file: File) => void;
  busy: boolean;
  kinds?: MediaKind[];
  title?: string;
}) {
  const addMediaClip = useEditorStore((s) => s.addMediaClip);
  const scrub = useEditorStore((s) => s.scrub);
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
              <MediaThumb projectId={projectId} asset={m} />
              <div className="editor-media-meta">
                <strong title={m.originalName}>{shortName(m.originalName)}</strong>
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
                onClick={() => {
                  const durationMs =
                    m.durationMs ?? (m.kind === "IMAGE" ? 3000 : 5000);
                  addMediaClip({
                    mediaAssetId: m.id,
                    kind: m.kind as MediaKind,
                    label: m.originalName,
                    durationMs,
                  });
                  const tl = useEditorStore.getState().timeline;
                  const track = tl?.tracks.find(
                    (t) =>
                      (m.kind === "AUDIO" && t.kind === "audio") ||
                      (m.kind !== "AUDIO" && t.kind === "video"),
                  );
                  const last = track?.clips[track.clips.length - 1];
                  if (last) scrub(last.startMs);
                }}
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

function MediaThumb({
  projectId,
  asset,
}: {
  projectId: string;
  asset: MediaAsset;
}) {
  const url = mediaContentUrl(projectId, asset.id);
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div className="editor-media-kind" data-kind={asset.kind}>
        {asset.kind === "AUDIO" ? "AUD" : asset.kind === "IMAGE" ? "IMG" : "VID"}
      </div>
    );
  }

  if (asset.kind === "IMAGE") {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        className="editor-media-thumb"
        src={url}
        alt=""
        onError={() => setFailed(true)}
      />
    );
  }

  if (asset.kind === "AUDIO") {
    return (
      <div className="editor-media-kind" data-kind="AUDIO" title={asset.originalName}>
        ♪
      </div>
    );
  }

  return (
    <video
      className="editor-media-thumb"
      src={url}
      muted
      playsInline
      preload="metadata"
      onError={() => setFailed(true)}
    />
  );
}
