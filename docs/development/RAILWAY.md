# Railway — Nest API (`@sarupak/api`)

Root Directory: **`/`** (repo root)

## Settings

| Field | Value |
|-------|--------|
| Build command | `npm run railway:build` |
| Start command | `npm run railway:start` |
| Healthcheck Path | `/v1/health` |
| Watch Paths | `/apps/api/**`, `/packages/**`, `/package.json`, `/package-lock.json` |

## Required variables

- `DATABASE_URL` — from Railway Postgres plugin (required or boot fails at Prisma `$connect`)
- `JWT_SECRET` — long random string
- `CORS_ORIGINS` — include `https://sarupak.vercel.app` (and preview URLs if needed)
- Do **not** hardcode `PORT` unless you know Railway’s assigned port — prefer Railway’s injected `PORT`
- `STORAGE_DRIVER=local`
- `STORAGE_LOCAL_PATH=./storage`
- `TTS_PROVIDER=mock` (until OpenAI key is set)
- `STT_PROVIDER=mock`

## Healthcheck failing (“service unavailable”)

1. Open **Deploy Logs** (not only Build) — look for `Prisma` / `Can't reach database`
2. Confirm Postgres plugin is linked and `DATABASE_URL` is set
3. Pre-deploy / one-shot: `npm run prisma:deploy -w @sarupak/api`
4. App listens on `0.0.0.0:$PORT` (required on Railway)
5. Healthcheck path must be `/v1/health`

## After first deploy

```bash
# one-time / release command (Railway pre-deploy):
npm run prisma:deploy -w @sarupak/api
```

Then set Vercel `NEXT_PUBLIC_API_URL=https://<railway-public-host>/v1` and redeploy web.
