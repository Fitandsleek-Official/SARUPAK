# Development prerequisites (Phase 0 inventory)

## Verified on inspection host (2026-09-19)

| Tool | Version / path | Status |
|------|----------------|--------|
| Node.js | v22.17.0 | OK |
| npm | 10.9.2 | OK (use npm workspaces) |
| pnpm / yarn | — | Not installed (not required) |
| FFmpeg | 8.1.2 (`/opt/homebrew/bin/ffmpeg`) | OK |
| PostgreSQL | 16.11 (Homebrew) | Server accepting on `127.0.0.1:5432`; app DB not created yet |
| FFmpeg encoders | `libx264`, `aac`, `libmp3lame` | OK for MP4 H.264 + AAC export target |
| Redis | — | **Missing** on host; jobs recorded in Postgres only until Redis/BullMQ (Phase 2+) |
| Docker daemon | installed, not running | `docker compose up` blocked until Docker Desktop starts |
| Local DB | `sarupak` on `127.0.0.1:5432` | Phase 1 migration applied |
| Docker | 28.5.1 | OK |
| Python | 3.14.7 | Host OK; **pin AI images to 3.11/3.12** |
| `web/node_modules` | present (~762M `web/`) | OK |
| Git | `main` ahead of `origin/main` by 1 | Uncommitted video-converter WIP + untracked `.tmp-pkgs/` |

## Phase 1 environment variables (planned templates)

Do not commit secrets. Create `.env.example` files per app in Phase 1.

### `apps/api`

- `DATABASE_URL` — Postgres connection string  
- `REDIS_URL` — Redis for BullMQ  
- `JWT_SECRET` / session secret  
- `STORAGE_DRIVER` — `local` \| `s3`  
- `STORAGE_LOCAL_PATH` — local media root  
- `S3_ENDPOINT` / `S3_BUCKET` / `S3_ACCESS_KEY` / `S3_SECRET_KEY`  
- `AI_SERVICE_URL` — FastAPI base URL  
- `CORS_ORIGINS` — web origins  

### `apps/web`

- `NEXT_PUBLIC_API_URL` — NestJS API  
- `NEXT_PUBLIC_WORKER_URL` — legacy HF worker (existing creative tools)  

### `services/ai`

- Provider keys only as needed (`OPENAI_API_KEY`, `ELEVENLABS_API_KEY`, etc.)  
- `WHISPER_MODEL` — local model name when using Faster-Whisper  

## Recommended local stack

Prefer `docker compose up` for Postgres + Redis + MinIO even if host Postgres exists — matches production-shaped topology and avoids polluting the host DB.
