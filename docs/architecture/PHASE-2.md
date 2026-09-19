# Phase 2 — Basic Video Editor (complete)

**Date:** 2026-09-19  
**Status:** Implemented and verified with real MP4 export

## End-to-end workflow

Import Video → Preview → Add to Timeline → Trim/Split → Save Project → Export MP4 → Download Result

## Implemented features

- `@sarupak/editor-core` — timeline model ops: add/move/trim/split/delete, mute, volume, undo/redo + gesture undo (`beginGesture` / `live` / `endGesture`)
- Timeline data model (`TimelineDocumentV1` / `TimelineTrack` / `TimelineClip`):
  - Multiple video + audio clips, start/duration, trim in/out, source `mediaAssetId`, track ordering
  - Split at playhead; trim edges update `trimInMs` / `trimOutMs`
- Studio editor UI (`/studio/[projectId]`):
  - Media library import + “Add to timeline”
  - Real HTML5 video/audio preview synced to playhead (JWT media stream)
  - Multi-track timeline with drag move, trim handles, playhead scrub
  - Split, delete, mute, zoom, keyboard shortcuts
  - Autosave of timeline JSON + duration
- FFmpeg probe on upload (duration/width/height)
- Server-side MP4 export (H.264/AAC) for 16:9, 9:16, 1:1
- Export job status + progress; FAILED jobs block download
- FFmpeg invoked via `spawn` argv only (no shell); binary-name + absolute-path checks

## Files created / modified (this hardening pass)

- `packages/editor-core/src/index.ts` — gesture undo
- `web/src/lib/editorStore.ts`, `web/src/components/studio/TimelinePanel.tsx`
- `apps/api/src/ffmpeg/ffmpeg.service.ts` — path/binary safety, render hardening
- `apps/api/src/ffmpeg/ffmpeg.service.spec.ts`
- `apps/api/test/export.e2e-spec.ts` — full Phase 2 workflow + playable ffprobe + failure case

## Commands

```bash
npm run build -w @sarupak/editor-core
npm run build -w @sarupak/api
npm run test -w @sarupak/api
npx jest --config jest.e2e.config.js --runInBand --testPathPatterns=export  # from apps/api
```

## Tests performed (2026-09-19)

| Suite | Result |
|-------|--------|
| `@sarupak/editor-core` | Pass (7) |
| `@sarupak/media-utils` | Pass (6) |
| `@sarupak/api` unit | Pass (6) — includes FFmpeg binary safety |
| `@sarupak/api` export e2e | Pass (5) — sample MP4 → probe → trim/split/save → export → download → ffprobe A/V; corrupt media → FAILED |

## Known limitations

- Preview is HTML5 A/V sync to playhead — not a full compositor
- Export builds sequential video-track segments + optional audio-track mix; overlapping video clips are not layered
- Missing source media renders as black (does not fail the job); corrupt/unreadable media fails the job
- No transitions, speed ramps, or multi-video-track compositing
- Redis/BullMQ still not required; long renders run in the API process

## Next

Phase 3 (subtitles) already has foundation work; harden only after Phase 2 regressions stay green.
