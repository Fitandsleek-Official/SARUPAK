# Phase 8 — SOTAKA Khmer clone + BGM isolate

**Date:** 2026-09-20  
**Status:** Implemented on API `sarupak-api` **v0.7.0**  
**Scope:** Connect SARUPAK Studio dubbing to SOTAKA HF Space (Speak + Vocal Remover)

## Goals

1. **Khmer TTS clone** via SOTAKA Speak (VoxCPM2) — male/female slots + optional ≤12s reference.
2. **Isolate BGM** via SOTAKA Vocal Remover — keep instrumental, replace dialogue.
3. **Dialogue-first pipeline:** captions → translate KM → separate → assign M/F + clone → generate → mix.
4. No silent mock; SOTAKA must be selected explicitly (or `TTS_PROVIDER=sotaka-tts`).

## Pipeline

```
MP4 → extract audio
    → SOTAKA Vocal Remover (vocals + instrumental)
    → keep instrumental as mix background
    → Translate cues → KM
    → SOTAKA Speak (text + ≤12s ref per M/F)
    → mix replace_dialogue → export MP4
```

## Environment

| Var | Purpose |
|-----|---------|
| `SOTAKA_VOICE_URL` | HF Space base, e.g. `https://kalapak-sotaka-voice-ai.hf.space` |
| `HF_TOKEN` | Optional — private Space / higher rate limits |
| `SOTAKA_TIMEOUT_MS` | Optional (default `600000`) |
| `TTS_PROVIDER` | `sotaka-tts` \| `openai-tts` \| `mock` (empty = UI selects) |
| `SEPARATION_PROVIDER` | `sotaka` \| `auto` \| `passthrough` \| `demucs` |

## API surface

- TTS provider id: `sotaka-tts` (voices `sotaka_male` / `sotaka_female`)
- Separation provider id: `sotaka` (trueIsolation = true when active)
- Assign voice accepts `referenceMediaAssetId` + `referenceText`
- Long cues are split into ~1400-char Speak batches (ZeroGPU session size)

## Honesty

| Claim | Status |
|-------|--------|
| Khmer speech via SOTAKA when URL configured | **Claimed** (`policy.khmerClaimed`) |
| Celebrity / unauthorized clones | **Not supported** (consent note) |
| Song Convert / singing VC | **Out of scope** for Phase 8 |
| Live quality SLA on ZeroGPU | **Not certified** — queue/cold start expected |

## Manual check

1. Set `SOTAKA_VOICE_URL` on API; restart.
2. Studio → Dubbing → TTS **SOTAKA**, target **Khmer**.
3. Extract → Separate → Assign M/F → upload ≤12s clone per gender → Generate → Mix.
