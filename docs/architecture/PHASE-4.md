# Phase 4 — AI Dubbing

**Date:** 2026-09-19  
**Status:** Pipeline complete for mock/passthrough path; production TTS/separation still external

## Live validation (2026-09-19)

Script: `node scripts/phase4-live-validate.mjs http://localhost:4002/v1` — **23/23 pass**

| Check | Result |
|-------|--------|
| Real MP4 (video + dialogue + background music tones) | Pass |
| Original media hash unchanged after extract | Pass |
| Audio extract 16 kHz mono + duration | Pass |
| Subtitle → dialogue segments | Pass |
| Separation reports no true isolation | Pass |
| Missing voice → segments failed (no silent mock fallback) | Pass (bug fixed) |
| Mock TTS + duration + playable WAV | Pass |
| FFmpeg mix → download → ffprobe A/V ~4s | Pass |
| Failures: no audio, Khmer unsupported, bad project, corrupt media | Pass |

**Port conflict:** host `:4000` was a non-SARUPAK Python API. Validation used `PORT=4002`. Align `web/.env.local` `NEXT_PUBLIC_API_URL` with the SARUPAK API port; restart Next after changing it.

## Current capabilities (Phases 1–3 reused)

- Auth, projects, media upload/probe, timeline, MP4 export
- Subtitle sets + cues (STT adapters); SRT/VTT; optional burn-in
- FFmpeg via `spawn` argv (no shell); job records in Postgres
- Existing `VoiceProfile` / `Character` models (consent-ready); Job types `EXTRACT_AUDIO`, `SEPARATE_AUDIO`, `DIARIZE`, `TTS`, `MIX`

## Implemented in Phase 4

- Domain package `@sarupak/dubbing-core` — sessions, segments, voices, mix modes, timing validation
- Dubbing session persistence (`DubbingSession` in Prisma)
- Real FFmpeg audio extraction with metadata validation
- Separation **adapter interface** + passthrough fallback (no silent overwrite of original)
- Diarization **adapter interface** + mock (tests) + manual assignment
- Voice character catalog (provider voice IDs, not celebrity clones)
- TTS adapters: `mock` (FFmpeg-generated tone WAV — labeled non-production), `openai-tts` when configured, unavailable otherwise
- Timing sync validation (overlap, duration fit, rate clamps, warnings)
- Real FFmpeg mix + mux onto video (replace / mix / dialogue-only / original-only)
- Authenticated API + Studio **Dubbing** panel wired to real endpoints
- E2E: import → subtitles → dubbing session → mock TTS → mix → export → playable MP4

## Unsupported / unavailable without external deps

| Capability | Status |
|------------|--------|
| True vocal/music stem separation (Demucs etc.) | **Unavailable** unless `SEPARATION_PROVIDER=demucs` and binary works; default is passthrough fallback |
| Production TTS quality | Requires `TTS_PROVIDER=openai-tts` + `OPENAI_API_KEY` |
| Khmer TTS quality | **Not claimed** until a Khmer-capable provider is configured and tested |
| Accurate speaker ID | Mock/manual only unless a real diarization provider is configured |
| Celebrity / unauthorized voice cloning | **Not implemented** — consent required for any custom clone |

## Required external dependencies

- FFmpeg / ffprobe (required for extract, mock TTS tones, mix, export)
- Optional: `OPENAI_API_KEY` for OpenAI TTS
- Optional: Demucs (or compatible) CLI if separation provider enabled

## Audio quality limitations

- Mock TTS is a **tone placeholder** sized to text length — not speech
- Without stem separation, “replace dialogue” falls back to mixing over full original audio with volume controls
- Aggressive time-stretch is capped; segments that still do not fit emit **warnings**, not silent overlaps
- Limiter reduces clipping risk but is not a mastering chain

## Synchronization limitations

- Alignment uses subtitle cue windows (`startMs`/`endMs`)
- Speaking-rate adjustment limited (default max ~1.35×)
- Overlapping cues are reported; generation may still succeed per-segment with warnings
- Preview uses generated WAV URLs; final A/V sync verified on muxed export

## Tests performed (2026-09-19)

| Suite | Result |
|-------|--------|
| `@sarupak/dubbing-core` | Pass (5) |
| `@sarupak/editor-core` / `subtitle-utils` / `media-utils` | Pass (regression) |
| `@sarupak/api` unit | Pass (12) — includes extract / no-audio / invalid / mock TTS / mix |
| `@sarupak/api` e2e | Pass (26+) — includes missing-voice guard + mix download |
| Live script `phase4-live-validate.mjs` | Pass (23/23) against API on :4002 |

## Commands

```bash
npm run build -w @sarupak/dubbing-core
cd apps/api && npx prisma migrate dev
npm run build -w @sarupak/api
PORT=4002 TTS_PROVIDER=mock STT_PROVIDER=mock node dist/main.js
# other terminal:
node scripts/phase4-live-validate.mjs http://localhost:4002/v1
npm test -w @sarupak/api
npx jest --config jest.e2e.config.js --runInBand  # from apps/api
```

## npm install warnings (EEXIST / tar timeout)

- `EEXIST` on `@sarupak/*` symlinks: race from concurrent installs; links resolve correctly to `packages/*`.
- `onnxruntime-web` tar timeouts: package present after reinstall (`zustand@5.0.8`, onnx dist JS/WASM files on disk). Harmless for Phase 4 dubbing (not used by dubbing pipeline).
- Reinstalled `zustand` into `web/node_modules` (was missing earlier despite install claim).
