# Phase 6 — CapCut-style Studio Shell UI

**Date:** 2026-09-20  
**Status:** PWA/Web shell implemented; Tauri deferred  
**Scope:** Frontend layout only — Phase 1–5.2 APIs and editor-core logic preserved

## Layout architecture

```
┌─────────────────────────────────────────────────────┐
│ StudioTopBar: brand | project | save | undo/redo    │
│               play | split/delete | aspect | export │
├────────┬──────────────────────────────┬─────────────┤
│ Tool   │                              │ Inspector   │
│ Rail   │     PreviewPlayer (canvas)   │ (properties)│
│ +      │                              │             │
│ Active │                              │             │
│ Panel  │                              │             │
├────────┴──────────────────────────────┴─────────────┤
│ TimelinePanel (all track kinds + zoom/trim/split)   │
└─────────────────────────────────────────────────────┘
```

Routes:

| Route | UI |
|-------|-----|
| `/studio` | `SiteNav` + `StudioDashboard` (auth, project list) |
| `/studio/[projectId]` | Full-screen `StudioEditor` (no site nav) |

## Shared components

| Component | Role |
|-----------|------|
| `StudioTopBar` | Brand, project name, save status, undo/redo, play, export, account |
| `StudioToolRail` | Left (desktop) / bottom (mobile) tool tabs |
| `StudioInspector` | Selected-clip properties (volume, text, timing readouts) |
| `TextToolPanel` | Add text clips to captions track |
| `PlaceholderToolPanel` | Effects / Transitions not-yet-implemented |
| `MediaLibraryPanel` | Reused; optional `kinds` filter for Media vs Audio |
| `PreviewPlayer` | Real media preview + fit mode + loading/error |
| `TimelinePanel` | Multi-track timeline (video/audio/text/captions/effects) |
| `SubtitlePanel` | Captions tool tab |
| `DubbingPanel` | Dubbing tool tab |

## Responsive behavior

| Viewport | Behavior |
|----------|----------|
| Desktop (>1100px) | Three-column workspace + vertical tool rail + bottom timeline |
| Tablet (≤1100px) | Inspector as drawer (closed by default); compact top bar + overflow menu |
| Mobile (≤720px) | Horizontal tool rail; canvas-first; tool panel below; timeline scrollable |

No horizontal page overflow: shell uses `100vh` + internal scroll regions.

## Existing features reused

- Zustand `editorStore` + `@sarupak/editor-core` (undo/redo, trim, split, move, volume)
- Autosave (800ms debounce + snapshot)
- Export job poll + download
- Subtitle STT / burn-in panel
- Dubbing pipeline panel
- Auth token + project ownership via existing API client

## Features not yet implemented

- Effects library
- Transitions library
- Transform controls (position / scale / rotation / opacity) — omitted; not in timeline schema
- Light theme toggle
- Tauri desktop shell

## Small editor-core addition

- `setClipText(doc, clipId, text)` — updates clip `text` + short `label` for inspector / text tool

## Testing results

| Check | Result |
|-------|--------|
| `npm run test -w @sarupak/editor-core` | **Pass** (8/8, includes `setClipText`) |
| `npm test` (media-utils, editor-core, subtitle-utils, dubbing-core, api) | **Pass** (API: 21 passed, 1 skipped live TTS) |
| ESLint (studio Phase 6 files) | **Timed out** in agent runner (~45s) — same hang class as full `npm run lint`; IDE diagnostics on those files were clean |
| IDE diagnostics on studio components | **Clean** |
| `npx tsc --noEmit` (web) | Pre-existing `LayoutProps` error in `app/layout.tsx` (unrelated to Phase 6) |
| `npm run build --prefix web` | **Hung** in agent runner before writing `.next` (same class of Next hang as Phase 5.1 notes) — run locally to confirm |
| Interactive browser click-through | **Not automated** (no Playwright/Cypress) |

No formatter script exists in the monorepo (`format` N/A).

## Manual testing instructions

1. Start API (`:4003`) and web (`:3010`) per `docs/development/PORTS.md`.
2. Open `/studio`, sign in, create or open a project.
3. Confirm URL is `/studio/[projectId]` and the CapCut shell loads (top bar, tool rail, canvas, timeline).
4. Switch Media / Audio / Text / Captions / Dubbing tabs; Effects & Transitions show “not yet implemented”.
5. Import media, add to timeline, play preview, toggle Fit.
6. Select a clip — inspector shows timing + volume; transform section notes schema gap.
7. Edit timeline (trim/split/undo); confirm autosave status cycles Saving → Saved.
8. Export MP4 and download when succeeded.
9. Resize to tablet/mobile widths — inspector drawer, bottom tools, no page-level horizontal scroll.

## Known limitations

- Preview plays one video + one audio clip at the playhead (existing Phase 2 behavior).
- Text clips are timeline metadata; burn-in / styled overlays are not part of this phase.
- Site account menu exists only as email + sign-out in the editor top bar (no avatar dropdown).
- Dark editor chrome only.
