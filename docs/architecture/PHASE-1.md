# Phase 1 — Foundation (complete)

**Date:** 2026-09-19  
**Status:** Implemented and tested (see checklist below)

## Implemented features

- Monorepo root with npm workspaces (`apps/*`, `packages/*`; `web/` kept at repo root for Vercel)
- `docker-compose.yml` for Postgres / Redis / MinIO (optional; Docker Desktop was not running on this host)
- Packages: `@sarupak/shared-types`, `@sarupak/media-utils`, `@sarupak/config`
- NestJS API (`apps/api`) with Prisma + PostgreSQL
- Auth: register, login, JWT, `/auth/me`, bcrypt password hashing
- Projects: create, list, get, update (autosave + snapshots), delete, recover from snapshot
- Media upload: MIME/size validation, local storage abstraction, ownership checks, probe job records
- Jobs table + list endpoints (queue worker deferred until Redis)
- PWA: manifest, service worker (app-shell only), offline page, install metadata
- Web `/studio` dashboard + `/studio/[projectId]` workspace (auth, projects, upload, autosave UI)

## Files created / modified (high level)

- `package.json`, `docker-compose.yml`, `.gitignore`, `README.md`
- `apps/api/**` (NestJS + Prisma migration)
- `packages/shared-types/**`, `packages/media-utils/**`, `packages/config/**`
- `web/public/manifest.webmanifest`, `web/public/sw.js`, `web/public/icons/*`
- `web/src/app/studio/**`, `web/src/app/offline/**`, `web/src/lib/api.ts`, studio components
- `web/src/app/layout.tsx`, `features.ts`, `SiteNav.tsx`, `globals.css`
- `docs/development/SETUP.md`

## Commands

```bash
npm install
npm run build -w @sarupak/shared-types
npm run build -w @sarupak/media-utils
npm run build -w @sarupak/config
npm run db:generate
cd apps/api && npx prisma migrate dev
npm run dev:api
npm run dev:web
npm test
npm run test:e2e -w @sarupak/api
```

## Environment variables

See `apps/api/.env.example` and `web/.env.example`.

Required for API: `DATABASE_URL`, `JWT_SECRET`, `PORT`, `CORS_ORIGINS`, `STORAGE_DRIVER=local`, `STORAGE_LOCAL_PATH`.

## Tests performed

| Suite | Result |
|-------|--------|
| `@sarupak/media-utils` (6 tests) | Pass |
| `@sarupak/api` unit (4 tests) | Pass |
| `@sarupak/api` e2e (10 tests) | Pass — health, register, duplicate, login, project CRUD, autosave snapshot, authz, media upload + probe job |

## Known limitations

- Redis / Docker not available on this host → no BullMQ worker yet; jobs stay `QUEUED`
- Storage is local disk only (S3/MinIO adapter not implemented)
- No timeline editor UI yet (Phase 2)
- No STT / dubbing / export pipeline yet (Phases 3–4)
- PWA offline does **not** run AI processing
- Root workspaces intentionally exclude `web/` to avoid npm lock fights with the large Next install; use `npm run dev --prefix web`

## Next step (Phase 2)

Basic multi-track editor: media library wiring into timeline, preview, trim/split/move, undo/redo, and server-side MP4 export via media-worker + FFmpeg.
