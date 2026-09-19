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

- `DATABASE_URL` — from Railway Postgres plugin
- `JWT_SECRET` — long random string
- `CORS_ORIGINS` — include `https://sarupak.vercel.app` (and preview URLs if needed)
- `PORT` — Railway sets this; Nest reads `PORT` (default 4003 locally)
- `STORAGE_DRIVER=local`
- `STORAGE_LOCAL_PATH=./storage`
- `TTS_PROVIDER=mock` (until OpenAI key is set)
- `STT_PROVIDER=mock`

## After first deploy

```bash
# one-time / release command (Railway pre-deploy):
npm run prisma:deploy -w @sarupak/api
```

Then set Vercel `NEXT_PUBLIC_API_URL=https://<railway-public-host>/v1` and redeploy web.
