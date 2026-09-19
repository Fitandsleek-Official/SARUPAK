"use client";

import { STUDIO_TOOLS, type StudioToolId } from "./studioTools";

export function StudioToolRail({
  active,
  onChange,
  orientation = "vertical",
}: {
  active: StudioToolId;
  onChange: (id: StudioToolId) => void;
  orientation?: "vertical" | "horizontal";
}) {
  return (
    <nav
      className={`studio-tool-rail is-${orientation}`}
      aria-label="Studio tools"
      role="tablist"
    >
      {STUDIO_TOOLS.map((tool) => {
        const isActive = active === tool.id;
        return (
          <button
            key={tool.id}
            type="button"
            role="tab"
            id={`studio-tool-${tool.id}`}
            aria-selected={isActive}
            aria-controls={`studio-tool-panel-${tool.id}`}
            title={`${tool.label}${tool.implemented ? "" : " (coming soon)"} — ${tool.description}`}
            className={`studio-tool-rail-btn ${isActive ? "is-active" : ""} ${tool.implemented ? "" : "is-soon"}`}
            onClick={() => onChange(tool.id)}
          >
            <span className="studio-tool-rail-icon" aria-hidden>
              {toolIcon(tool.id)}
            </span>
            <span className="studio-tool-rail-label">{tool.shortLabel}</span>
          </button>
        );
      })}
    </nav>
  );
}

function toolIcon(id: StudioToolId): string {
  switch (id) {
    case "media":
      return "▣";
    case "audio":
      return "♫";
    case "text":
      return "T";
    case "captions":
      return "CC";
    case "effects":
      return "✦";
    case "transitions":
      return "⇄";
    case "dubbing":
      return "D";
    default:
      return "·";
  }
}
