# Phase 3 — Subtitles (complete)

**Date:** 2026-09-19  
**Status:** Implemented and tested

## Implemented features

- `@sarupak/subtitle-utils` — SRT/VTT export/parse, timestamp formatting, split/merge/validate
- STT provider interface with adapters:
  - `openai-whisper` (requires `OPENAI_API_KEY`)
  - `whisper-cli` (optional local `whisper` binary)
  - `silence-segments` (FFmpeg silencedetect timing-only fallback — **not ASR**)
  - `mock` (tests only)
- Pipeline: extract audio (FFmpeg WAV) → STT → `SubtitleSet` in Postgres
- Editable cues: text, timing, split, merge
- SRT / VTT download endpoints
- Optional burn-in via PNG overlays + FFmpeg `overlay` (host FFmpeg lacks libass)
- Studio **Subtitles** panel in the editor

## Honesty / integration boundaries

- Real ASR requires `OPENAI_API_KEY` or a working `whisper` CLI.
- Without those, auto-select uses silence segmentation and empty cue text for manual edit.
- **Khmer ASR quality is not claimed** until tested with a real provider + Khmer audio.
- Burn-in bitmap font is Latin-oriented; full Unicode fidelity is via SRT/VTT.

## Tests performed

| Suite | Result |
|-------|--------|
| `@sarupak/subtitle-utils` (5) | Pass |
| API unit (4) | Pass |
| API e2e (17) | Pass — includes generate → edit → SRT/VTT → burn-in download |

## Commands

```bash
# In apps/api/.env for local tests without cloud ASR:
STT_PROVIDER=mock

npm run build -w @sarupak/subtitle-utils
npm run build -w @sarupak/api
npm run test -w @sarupak/subtitle-utils
npm run test:e2e -w @sarupak/api
npm run dev:api
npm run dev --prefix web
```

## Env vars (new)

See `apps/api/.env.example`: `STT_PROVIDER`, `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_WHISPER_MODEL`, `WHISPER_CLI_PATH`, `WHISPER_MODEL`.

## Next step (Phase 4)

Audio & dubbing: diarization → separation → voice assignment → TTS → mix + review.
