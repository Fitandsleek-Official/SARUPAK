# SARUPAK — AI Video Studio

CapCut-inspired AI video editor (PWA) with creative tools. Built in phases.

## Current status

| Phase | Status |
|-------|--------|
| 0 Architecture | Done |
| 1 Foundation | Done — auth, projects, media, PWA |
| 2 Basic editor | Done — timeline, preview, trim/split, export |
| 3 Subtitles | Done — STT adapters, edit, SRT/VTT, burn-in |
| 4 AI Dubbing | Done — extract, adapters, mock/OpenAI TTS, mix, export |
| 5 Real TTS | Done — explicit provider selection; OpenAI when keyed |
| 5.2 Dev env | Done — stable ports API **4003** / web **3010** |
| 6 Studio shell | Done — CapCut-style layout (PWA/Web only; no Tauri) |

## Quick start

```bash
cp apps/api/.env.example apps/api/.env
cp web/.env.example web/.env.local
npm install
npm run build -w @sarupak/shared-types && npm run build -w @sarupak/media-utils && npm run build -w @sarupak/editor-core && npm run build -w @sarupak/subtitle-utils && npm run build -w @sarupak/dubbing-core
cd apps/api && npx prisma migrate dev && cd ../..

# Terminal A
npm run dev:api    # http://localhost:4003/v1

# Terminal B
npm run dev:web    # http://localhost:3010

# Identity check
npm run smoke:api
```

Studio: http://localhost:3010/studio  

Ports & stale-process safety: [`docs/development/PORTS.md`](docs/development/PORTS.md)

For local dubbing without cloud TTS, set `TTS_PROVIDER=mock` (tone placeholders — not speech).  
For subtitle generation without cloud ASR, set `STT_PROVIDER=mock` or leave unset for silence-segment fallback.

Details: [`docs/development/SETUP.md`](docs/development/SETUP.md) · Phase 5: [`docs/architecture/PHASE-5.md`](docs/architecture/PHASE-5.md) · Phase 6: [`docs/architecture/PHASE-6-STUDIO-SHELL.md`](docs/architecture/PHASE-6-STUDIO-SHELL.md)
