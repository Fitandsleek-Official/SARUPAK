# Phase 1+ local setup

## Prerequisites

- Node.js 20+
- npm 10+
- PostgreSQL 16 (local DB `sarupak`)
- FFmpeg (system) — used heavily from Phase 2+
- Docker Desktop (optional) for Redis / MinIO / alternate Postgres

See also: [PORTS.md](./PORTS.md) for the Phase 5.2 stable port map.

## First-time setup

```bash
# From repo root
cp apps/api/.env.example apps/api/.env
cp web/.env.example web/.env.local

# Adjust DATABASE_URL if needed (default uses host Postgres user trust auth)
createdb sarupak   # if not already created

# API + packages (workspaces). Web keeps its own node_modules under web/.
npm install
npm run build -w @sarupak/shared-types
npm run build -w @sarupak/media-utils
npm run build -w @sarupak/config
npm run build -w @sarupak/editor-core
npm run build -w @sarupak/subtitle-utils
npm run build -w @sarupak/dubbing-core
npm run db:generate
cd apps/api && npx prisma migrate dev && cd ../..

# Web deps (if needed)
cd web && npm install && cd ..
```

Confirm `.env` ports:

| File | Key | Value |
|------|-----|-------|
| `apps/api/.env` | `PORT` | `4003` |
| `apps/api/.env` | `CORS_ORIGINS` | include `http://localhost:3010` and `http://127.0.0.1:3010` |
| `web/.env.local` | `NEXT_PUBLIC_API_URL` | `http://localhost:4003/v1` |

Restart Next after editing `NEXT_PUBLIC_*`.

## Run

```bash
# Terminal A — SARUPAK API (:4003)
npm run dev:api

# Terminal B — SARUPAK Web (:3010)
npm run dev:web

# Optional identity smoke
npm run smoke:api
```

- Web: http://localhost:3010  
- Studio: http://localhost:3010/studio  
- API health: http://localhost:4003/v1/health  

Do **not** use `:3000` / `:4000` for SARUPAK when those ports belong to other local apps (e.g. Norng Downloader). See [PORTS.md](./PORTS.md).

## Docker Compose (when Docker Desktop is running)

```bash
docker compose up -d
# Then point apps/api/.env DATABASE_URL to port 5433 and set REDIS_URL=redis://127.0.0.1:6379
```

## Tests

```bash
npm test
npm run test:e2e -w @sarupak/api
npm run smoke:api   # against a running API
```

## Phase 1 API surface

| Method | Path | Auth |
|--------|------|------|
| GET | `/v1/health` | no — returns `service`, `version`, `phase` |
| POST | `/v1/auth/register` | no |
| POST | `/v1/auth/login` | no |
| GET | `/v1/auth/me` | JWT |
| CRUD | `/v1/projects` | JWT |
| GET/POST | `/v1/projects/:id/snapshots…` | JWT |
| GET/POST/DELETE | `/v1/projects/:id/media` | JWT |
| GET | `/v1/projects/:id/jobs` | JWT |

## Phase 3 subtitles

- Generate: `POST /v1/projects/:id/subtitles/generate` `{ mediaAssetId, language? }`
- Edit: `PATCH .../subtitles/:setId/segments/:segmentId`, split/merge endpoints
- Export: `GET .../export.srt` · `GET .../export.vtt`
- Burn-in: `POST .../burn-in` then poll job and `GET .../subtitles/burn-in/:jobId/download`
- Providers: configure `STT_PROVIDER` / `OPENAI_API_KEY` (see `.env.example`). Silence fallback is timing-only, not ASR.
