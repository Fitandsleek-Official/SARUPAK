"use client";

import Link from "next/link";
import { useState } from "react";

export type SaveStatus = "idle" | "saving" | "saved" | "error" | "unsaved";

export function StudioTopBar({
  projectName,
  saveStatus,
  canUndo,
  canRedo,
  isPlaying,
  onUndo,
  onRedo,
  onTogglePlay,
  onExport,
  exportDisabled,
  aspect,
  onAspectChange,
  onSplit,
  onDelete,
  canSplit,
  canDelete,
  userEmail,
  onSignOut,
}: {
  projectName: string;
  saveStatus: SaveStatus;
  canUndo: boolean;
  canRedo: boolean;
  isPlaying: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onTogglePlay: () => void;
  onExport: () => void;
  exportDisabled: boolean;
  aspect: "16:9" | "9:16" | "1:1";
  onAspectChange: (v: "16:9" | "9:16" | "1:1") => void;
  onSplit: () => void;
  onDelete: () => void;
  canSplit: boolean;
  canDelete: boolean;
  userEmail: string | null;
  onSignOut?: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  const saveLabel =
    saveStatus === "saving"
      ? "Saving…"
      : saveStatus === "saved"
        ? "Saved"
        : saveStatus === "error"
          ? "Save failed"
          : saveStatus === "unsaved"
            ? "Unsaved changes"
            : "Ready";

  return (
    <header className="studio-topbar">
      <div className="studio-topbar-left">
        <Link href="/studio" className="studio-topbar-brand" title="Back to projects">
          SARUPAK
        </Link>
        <span className="studio-topbar-divider" aria-hidden />
        <h1 className="studio-topbar-title">{projectName}</h1>
        <span
          className={`studio-topbar-save is-${saveStatus}`}
          aria-live="polite"
        >
          {saveLabel}
        </span>
      </div>

      <div className="studio-topbar-center" role="toolbar" aria-label="Edit actions">
        <button
          type="button"
          onClick={onUndo}
          disabled={!canUndo}
          title="Undo (⌘Z)"
          aria-label="Undo"
        >
          Undo
        </button>
        <button
          type="button"
          onClick={onRedo}
          disabled={!canRedo}
          title="Redo (⌘⇧Z)"
          aria-label="Redo"
        >
          Redo
        </button>
        <button
          type="button"
          onClick={onTogglePlay}
          title="Play / Pause (Space)"
          aria-label={isPlaying ? "Pause preview" : "Play preview"}
          className="studio-topbar-play"
        >
          {isPlaying ? "Pause" : "Play"}
        </button>
        <button
          type="button"
          onClick={onSplit}
          disabled={!canSplit}
          title="Split at playhead (S)"
          aria-label="Split clip"
        >
          Split
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={!canDelete}
          title="Delete selected (Del)"
          aria-label="Delete clip"
        >
          Delete
        </button>
      </div>

      <div className="studio-topbar-right">
        <select
          value={aspect}
          onChange={(e) =>
            onAspectChange(e.target.value as "16:9" | "9:16" | "1:1")
          }
          aria-label="Export aspect ratio"
          className="studio-topbar-aspect"
        >
          <option value="16:9">16:9</option>
          <option value="9:16">9:16</option>
          <option value="1:1">1:1</option>
        </select>
        <button
          type="button"
          className="studio-topbar-export"
          onClick={onExport}
          disabled={exportDisabled}
          title={exportDisabled ? "Add media before exporting" : "Export MP4"}
        >
          Export
        </button>

        <button
          type="button"
          className="studio-topbar-menu-btn"
          aria-label="More actions"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((v) => !v)}
        >
          ☰
        </button>

        {userEmail ? (
          <div className="studio-topbar-user">
            <span className="studio-topbar-user-email" title={userEmail}>
              {userEmail}
            </span>
            {onSignOut ? (
              <button type="button" onClick={onSignOut} className="studio-topbar-signout">
                Sign out
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      {menuOpen ? (
        <div className="studio-topbar-mobile-menu" role="menu">
          <button type="button" role="menuitem" onClick={onUndo} disabled={!canUndo}>
            Undo
          </button>
          <button type="button" role="menuitem" onClick={onRedo} disabled={!canRedo}>
            Redo
          </button>
          <button type="button" role="menuitem" onClick={onTogglePlay}>
            {isPlaying ? "Pause" : "Play"}
          </button>
          <button type="button" role="menuitem" onClick={onSplit} disabled={!canSplit}>
            Split
          </button>
          <button type="button" role="menuitem" onClick={onDelete} disabled={!canDelete}>
            Delete
          </button>
          <button
            type="button"
            role="menuitem"
            className="studio-topbar-export"
            onClick={onExport}
            disabled={exportDisabled}
          >
            Export
          </button>
          <Link href="/studio" role="menuitem" onClick={() => setMenuOpen(false)}>
            All projects
          </Link>
        </div>
      ) : null}
    </header>
  );
}
