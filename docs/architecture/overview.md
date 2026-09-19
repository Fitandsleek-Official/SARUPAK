# Architecture overview

SARUPAK is evolving from an **AI Creative Studio** (browser image tools + FFmpeg WASM converter) into a **CapCut-inspired AI Video Studio** with PWA frontend, NestJS API, queue-backed media processing, and a FastAPI AI microservice.

Canonical Phase 0 plan: [PHASE-0.md](./PHASE-0.md)

## System layers

1. **Presentation** — `apps/web` Next.js PWA (editor UI, project dashboard, preserved creative tools).
2. **Domain** — `packages/editor-core` pure timeline operations; `packages/shared-types` API contracts.
3. **Application API** — `apps/api` NestJS (auth, projects, media metadata, job enqueue, SSE/WS status).
4. **Workers** — `services/media-worker` (FFmpeg), `services/ai` (STT/TTS/diarization/separation adapters).
5. **Data** — PostgreSQL (metadata), Redis (queues), object storage (media bytes).

## Non-negotiables

- Large media never stored in Postgres.
- Long FFmpeg/AI work never blocks the API process.
- AI providers are swappable adapters; capabilities must be documented, not invented.
- Destructive AI edits require user confirmation.
- Existing live image/video-converter tools must keep working during the migration.
