# Phase 7 — Multi-language captions, Khmer SRT, speaker slots

**Date:** 2026-09-20  
**Status:** Implemented on API `sarupak-api` **v0.6.0**  
**Scope:** Professional Studio standards for ASR languages + translate-to-Khmer + clearer male/female dubbing UX

## Goals delivered

1. **ASR language picker:** `en` / `zh` / `ja` / `km` / `auto` in Captions panel (Whisper when keyed).
2. **Translate → Khmer SRT:** `POST /v1/projects/:id/subtitles/:setId/translate` creates a new `language=km` subtitle set (timing preserved). Requires `OPENAI_API_KEY`.
3. **Male / female speaker slots:** Manual diarization seeds `speaker_male` + `speaker_female`; UI assigns voices by gender label and per-cue speaker.
4. **Editor API offline banner:** Studio editor runs `verifyExpectedApi()` and shows Offline/503-style failures clearly.
5. **Honesty:** No silent mock translate; Khmer TTS still **not claimed**; true Demucs isolation still **not claimed**.

## Pipeline

```
MP4 → STT (en|zh|ja|km|auto)
    → edit cues
    → Translate → KM (new SubtitleSet)
    → export SRT/VTT / burn-in
    → Dubbing session (male/female slots)
    → mix (background preserved when separation unavailable)
```

## Environment

| Var | Purpose |
|-----|---------|
| `OPENAI_API_KEY` | Whisper STT + Chat translate + OpenAI TTS |
| `OPENAI_TRANSLATE_MODEL` | Optional (default `gpt-4o-mini`) |
| `OPENAI_BASE_URL` | Optional API base |

## Known limitations

| Feature | Status |
|---------|--------|
| Auto gender / multi-speaker ML diarization | **Not implemented** — manual M/F slots |
| True dialogue vs foley separation | Passthrough only |
| Khmer TTS speech | **Phase 8:** claimed when `SOTAKA_VOICE_URL` is set (`sotaka-tts`) |
| ASR quality for km/zh/ja | Depends on Whisper; live quality not certified here |
| `ws://127.0.0.1:5500` errors | **Not SARUPAK** — VS Code Live Server; ignore for Studio |
| Project `503 Offline` | Usually Railway API down / wrong `NEXT_PUBLIC_API_URL` / cold start |

## Tests

```bash
npm test -w @sarupak/api
# includes openai-translate.provider.spec.ts
```

## Manual check

1. Open `/studio` → project → Captions.
2. Set language Chinese/Japanese/English → Generate (needs STT).
3. Click **Translate → KM** → export SRT.
4. Dubbing → Diarize → assign Male/Female voices → set cue speaker → mix.
