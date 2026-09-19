# Phase 0 — Architecture & Planning

**Product:** SARUPAK (AI Video Studio)  
**Date:** 2026-09-19  
**Status:** Inspection complete · Plan approved for Phase 1 implementation  
**Honesty rule:** Nothing below is “done” until implemented and tested in later phases.

---

## 1. Repository inspection summary

### Current state (as found)

| Area | Finding |
|------|---------|
| Layout | Flat repo: `web/` + `worker/` only — **not** a video-editor monorepo |
| Product | **AI Creative Studio** (image tools + browser video converter) |
| Frontend | Next.js **16.3.0**, React **19.2.8**, Tailwind **4**, TypeScript |
| PWA | **Not present** (no manifest / service worker) |
| Auth / projects | **Not present** |
| NestJS API | **Not present** |
| PostgreSQL / Prisma | Client installed locally (PostgreSQL **16.11**); **no schema/app DB** |
| Redis / BullMQ | **Redis not installed** on this machine |
| AI worker | FastAPI stub (`/v1/analyze`, `/v1/segment`) for **images** on HF Spaces |
| Video | Client-side **FFmpeg WASM** converter only (`web/src/lib/videoConvert.ts`) |
| Timeline editor | **Not present** |
| Subtitles / dubbing / STT / TTS | **Not present** |
| Tests | No project/unit/e2e suite for editor workflows |
| Package manager | **npm** (no pnpm/yarn) |
| Node | **v22.17.0** / npm **10.9.2** |
| System FFmpeg | **8.1.2** at `/opt/homebrew/bin/ffmpeg` |
| Docker | **28.5.1** available |
| Python | **3.14.7** |
| Deploy notes | Web → Vercel (`web` root); Worker → Hugging Face Docker Space |

### What is reusable

- Next.js + React + Tailwind + TypeScript baseline in `web/`
- Browser FFmpeg WASM experience and post-target presets (useful for **preview / light client ops**, not final server render)
- FastAPI worker pattern + CORS + health endpoint (evolve into AI microservice)
- Brand fonts (Syne / Figtree) and existing Khmer-aware UI copy patterns
- Existing image tools (preserve; do not break)

### What is missing for CapCut-class AI Video Studio

- Monorepo (`apps/`, `services/`, `packages/`)
- NestJS API, auth, project CRUD, autosave
- Object storage abstraction + media upload pipeline
- Redis + job queue + media worker (server FFmpeg)
- Domain packages: timeline model, shared types, media utils
- STT / diarization / separation / TTS provider adapters
- Professional multi-track editor UI + preview/render split
- PWA installability and offline **editing** (not offline AI)
- Test harness and production config docs

### Important constraint (Next.js)

`web/AGENTS.md` states this Next.js version has breaking changes vs training data. Before Phase 1 UI work, read guides under `web/node_modules/next/dist/docs/` when dependencies are installed.

---

## 2. Strategic decision: evolve, do not throw away

**Decision:** Transform SARUPAK into a **monorepo** centered on AI Video Studio, while **preserving** existing creative tools as a secondary product surface.

| Option | Choice |
|--------|--------|
| Greenfield wipe | Rejected — violates “preserve working features” |
| Parallel disconnected apps | Rejected — duplicates stack |
| **Monorepo evolution** | **Selected** — `apps/web` keeps tools; new studio routes + new `apps/api` + AI/media services |

Existing routes (`/editor`, `/remove-bg`, `/collage`, `/video`, …) remain available. New primary surface: `/studio` (dashboard + editor).

---

## 3. Target repository structure

```
SARUPAK/
  apps/
    web/                 # Next.js PWA (moved from ./web)
    api/                 # NestJS REST + WS/SSE gateway
  services/
    ai/                  # FastAPI: STT, diarization, TTS, separation adapters
    media-worker/        # BullMQ consumer: FFmpeg probe/transcode/export/mix
  packages/
    shared-types/        # Zod/TS contracts shared FE↔API↔workers
    editor-core/         # Timeline model, ops, undo, pure functions
    media-utils/         # Validation helpers, MIME, safe paths (no secrets)
    config/              # Shared env schema helpers
  docs/
    architecture/
    api/
    development/
  docker-compose.yml     # Postgres + Redis + MinIO (local)
  package.json           # npm workspaces root
```

**Migration note:** Phase 1 moves `web/` → `apps/web/` carefully (update Vercel root, paths, lockfile). Until move, Phase 0 docs may reference current `web/` path.

**Why not Tauri now:** Desktop is optional later; share `editor-core` + UI packages. No duplicate app in MVP.

---

## 4. Runtime architecture

```
┌─────────────────┐     HTTPS/WS      ┌──────────────────┐
│  apps/web (PWA) │ ◄──────────────► │  apps/api NestJS │
│  editor-core    │                  │  auth · projects │
│  local preview  │                  │  media · jobs    │
└────────┬────────┘                  └────┬─────┬───────┘
         │ browser FFmpeg WASM            │     │
         │ (light ops only)               │     │ BullMQ
         │                          ┌─────▼──┐ ┌▼──────────────┐
         │                          │ Redis  │ │ media-worker  │
         │                          └────────┘ │ FFmpeg server │
         │                                     └───────┬───────┘
         │                          ┌──────────────────▼───────┐
         │                          │ services/ai (FastAPI)    │
         │                          │ STT · TTS · diarize ·    │
         │                          │ separation adapters      │
         │                          └──────────────────────────┘
         │
         ▼
   Object storage (local disk / S3-compatible)
   PostgreSQL (metadata only — never large media blobs)
```

### Separation of concerns

| Concern | Owner |
|---------|--------|
| Editor UI state | Zustand in web + `editor-core` |
| Project persistence | NestJS + Prisma + Postgres |
| Preview | Client compositor (HTML5 + canvas overlays) |
| Final render | `media-worker` + FFmpeg |
| AI inference | `services/ai` via provider adapters |
| Job orchestration | NestJS enqueues → Redis/BullMQ → workers |

---

## 5. MVP scope (Phase 1–2 gate)

### In MVP (shippable, real)

1. Auth (register/login/session), user isolation  
2. Projects CRUD + versioned timeline JSON + autosave  
3. Media upload (validated) + library + local/object storage  
4. Multi-track timeline: video/audio/text/captions basics  
5. Trim, split, delete, move, volume, mute/solo, undo/redo, zoom, playhead  
6. Preview (playhead-accurate clip visibility; text overlay)  
7. Server export: MP4 H.264 + AAC; 16:9 / 9:16 / 1:1  
8. Job status (upload + process + render) via polling or SSE  
9. PWA install + offline shell (not offline AI)  
10. STT adapter interface + one working provider (Faster-Whisper **or** cloud) for Phase 3 start  

### Explicitly out of MVP (Phases 4–5)

- Production-grade dubbing quality claims  
- Perfect stem separation  
- Unsupervised auto-cut applying without approval  
- Full Tauri desktop  
- Advanced GPU compositing  

### Honesty boundaries

- Khmer ASR quality: **unproven until tested** with real Khmer audio  
- Audio separation: **experimental**; UI must expose review/manual mix  
- Voice cloning: **authorized voices only**; provider capabilities documented, never invented  

---

## 6. Database schema (draft — Prisma)

Versionable project document + relational metadata.

```prisma
// Draft — implement in Phase 1 with migrations

model User {
  id           String    @id @default(cuid())
  email        String    @unique
  passwordHash String
  displayName  String?
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt
  projects     Project[]
  voices       VoiceProfile[]
}

model Project {
  id              String   @id @default(cuid())
  userId          String
  user            User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  name            String
  schemaVersion   Int      @default(1)
  width           Int      @default(1920)
  height          Int      @default(1080)
  frameRate       Float    @default(30)
  durationMs      Int      @default(0)
  timeline        Json     // versioned editor-core document
  status          ProjectStatus @default(DRAFT)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  mediaAssets     MediaAsset[]
  subtitleSets    SubtitleSet[]
  characters      Character[]
  jobs            Job[]
  snapshots       ProjectSnapshot[]

  @@index([userId, updatedAt])
}

model ProjectSnapshot {
  id        String   @id @default(cuid())
  projectId String
  project   Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  label     String?
  timeline  Json
  createdAt DateTime @default(now())
  @@index([projectId, createdAt])
}

enum ProjectStatus {
  DRAFT
  PROCESSING
  READY
  FAILED
}

model MediaAsset {
  id           String   @id @default(cuid())
  projectId    String
  project      Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  userId       String
  kind         MediaKind
  storageKey   String
  originalName String
  mimeType     String
  sizeBytes    BigInt
  durationMs   Int?
  width        Int?
  height       Int?
  checksum     String?
  createdAt    DateTime @default(now())
  @@index([projectId])
  @@index([userId])
}

enum MediaKind {
  VIDEO
  AUDIO
  IMAGE
  STEM
  GENERATED_SPEECH
}

model SubtitleSet {
  id        String   @id @default(cuid())
  projectId String
  project   Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  language  String
  segments  Json     // [{id,startMs,endMs,text,speakerId?}]
  style     Json?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model Character {
  id             String  @id @default(cuid())
  projectId      String
  project        Project @relation(fields: [projectId], references: [id], onDelete: Cascade)
  name           String
  voiceProfileId String?
  voiceProfile   VoiceProfile? @relation(fields: [voiceProfileId], references: [id])
  meta           Json?
}

model VoiceProfile {
  id              String   @id @default(cuid())
  userId          String
  user            User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  provider        String
  providerVoiceId String
  language        String
  status          VoiceStatus
  consentRecord   Json?
  characters      Character[]
  createdAt       DateTime @default(now())
}

enum VoiceStatus {
  PENDING
  READY
  DISABLED
  REVOKED
}

model Job {
  id          String    @id @default(cuid())
  projectId   String
  project     Project   @relation(fields: [projectId], references: [id], onDelete: Cascade)
  userId      String
  type        JobType
  status      JobStatus @default(QUEUED)
  progress    Float     @default(0)
  input       Json?
  output      Json?
  error       String?
  attempts    Int       @default(0)
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  @@index([userId, status])
  @@index([projectId, createdAt])
}

enum JobType {
  PROBE
  TRANSCODE
  EXTRACT_AUDIO
  STT
  SEPARATE_AUDIO
  DIARIZE
  TTS
  MIX
  RENDER
  AUTO_CUT_ANALYZE
}

enum JobStatus {
  QUEUED
  RUNNING
  SUCCEEDED
  FAILED
  CANCELLED
}
```

**Timeline JSON (`schemaVersion`):** owned by `packages/editor-core` — tracks, clips, transitions placeholders, voice assignments references. Migrations of timeline shape bump `schemaVersion` with upgrade functions.

---

## 7. Provider adapter boundaries (AI)

All AI features go through interfaces in `services/ai` (and mirrored types in `shared-types`):

| Interface | Methods (contract) | Planned adapters |
|-----------|--------------------|------------------|
| `SpeechToTextProvider` | `transcribe(audio) → segments` | Faster-Whisper (local/worker), optional cloud |
| `DiarizationProvider` | `diarize(audio) → speakers` | pyannote / cloud (eval in Phase 4) |
| `SeparationProvider` | `separate(audio) → stems` | Demucs (experimental) |
| `VoiceProvider` | `createVoiceProfile`, `synthesizeSpeech`, `get`, `delete` | Cloud TTS + self-hosted stub |
| `AssistantToolRunner` | structured tools → **validated** editor ops | Phase 5 |

**Setup requirement pattern:** `.env.example` + `docs/development/providers.md` listing required keys, what works without keys (stubs/local), and unsupported claims (e.g. Khmer cloning if provider lacks it).

---

## 8. Dependencies & local prerequisites

### Present on this machine

- Node 22, npm 10  
- PostgreSQL 16 client/server tooling  
- FFmpeg 8.1.2  
- Docker 28.5  

### Must install / provision for Phase 1

| Dependency | Purpose | Action |
|------------|---------|--------|
| Redis | Job queue | `brew install redis` or Docker Compose service |
| MinIO or local `./storage` | Object storage | Compose MinIO recommended |
| NestJS app scaffold | API | Create `apps/api` |
| Prisma | ORM | Add with Postgres URL |
| npm workspaces | Monorepo | Root `package.json` workspaces |

### Optional later

- CUDA / Apple Silicon acceleration for Whisper/Demucs  
- Cloud STT/TTS API keys  
- Hugging Face token for model downloads  

---

## 9. Risks & mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Scope explosion (full CapCut + dubbing) | Never ships | Strict phase gates; MVP = Phase 1–2 |
| Next.js 16 API drift | Broken builds | Read local Next docs; small vertical slices |
| Large media on Vercel serverless | Timeouts / size limits | API + workers on long-running hosts; web on Vercel OK |
| FFmpeg argument injection | RCE | Allowlisted args; never shell-interpolate user strings |
| Redis missing locally | Jobs blocked | docker-compose Redis from day 1 of Phase 1 |
| Python 3.14 bleeding edge | Package wheels missing | Pin AI service to **3.11/3.12** in Docker |
| Claiming Khmer ASR quality | Trust damage | Feature flag + “experimental” UX until eval set |
| Existing Vercel root `web/` | Deploy break on move | Document Root Directory change to `apps/web` |

---

## 10. Phase roadmap (execution order)

| Phase | Goal | Exit criteria |
|-------|------|---------------|
| **0** | Plan (this doc) | Structure, schema, MVP, risks agreed |
| **1** | Foundation | Auth, projects, upload, storage, PWA shell, compose |
| **2** | Basic editor | Timeline ops + preview + server MP4 export |
| **3** | Subtitles | Extract → STT adapter → edit → SRT/VTT → optional burn-in |
| **4** | Dubbing | Diarize → separate → voice assign → TTS → mix + review |
| **5** | AI editing | Suggestions + assistant tools with confirmation |
| **6** | Quality | Tests, security, perf, production config |

**Do not skip Phase 1–2 for UI spectacle.**

---

## 11. Phase 0 deliverables checklist

- [x] Inspect repository & environment  
- [x] Document current vs target architecture  
- [x] Define monorepo structure  
- [x] Define MVP scope  
- [x] Draft database schema  
- [x] Identify dependencies & gaps (Redis, NestJS, Prisma, monorepo)  
- [x] Identify risks  
- [ ] User confirmation to start **Phase 1** implementation  

---

## 12. Recommended next step

**Phase 1 kickoff (after approval):**

1. Add root npm workspaces + `docker-compose.yml` (Postgres, Redis, MinIO).  
2. Scaffold `apps/api` (NestJS) + Prisma schema from draft above.  
3. Keep `web/` in place initially **or** move to `apps/web` in the same PR with Vercel path update.  
4. Implement auth + projects + media upload + job record stubs.  
5. Add PWA manifest + basic SW caching for app shell.  
6. Write setup docs in `docs/development/SETUP.md`.  

No production secrets in the repo; only `.env.example` templates.
