# Railway — Nest API (`@sarupak/api`)

Root Directory: **`/`** (repo root)

## Settings

| Field | Value |
|-------|--------|
| Build command | `npm run railway:build` |
| Start command | `npm run railway:start` |
| Healthcheck Path | `/v1/health` |
| Watch Paths | `/apps/api/**`, `/packages/**`, `/package.json`, `/package-lock.json` |

`railway.toml` at the repo root sets build/start/healthcheck the same way.

## Required variables (API service)

| Variable | Value |
|----------|--------|
| `DATABASE_URL` | **Reference** the Postgres plugin — see below. Never paste the API public URL. |
| `JWT_SECRET` | Long random string |
| `CORS_ORIGINS` | `https://sarupak.vercel.app` (+ preview URLs if needed) |
| `PORT` | **Leave unset** — Railway injects it |
| `STORAGE_DRIVER` | `local` |
| `STORAGE_LOCAL_PATH` | `./storage` |
| `TTS_PROVIDER` | `mock` (until OpenAI key is set) |
| `STT_PROVIDER` | `mock` |

### Correct `DATABASE_URL` (most common 502 cause)

Wrong (points at the **API** service — Prisma P1001, process crash loop, edge 502):

```text
postgresql://…@sarupakapi.railway.internal:5432/…
```

Right — in the **API** service → Variables, add a **Variable Reference**:

1. Add Postgres (or Railway PostgreSQL) to the **same project**
2. On the API service, set:

```text
DATABASE_URL=${{Postgres.DATABASE_URL}}
```

Use your Postgres service name if it is not `Postgres` (Railway UI shows the exact reference). Private networking host should look like `postgres.railway.internal` or `*.rlwy.net` — **not** `sarupakapi.railway.internal`.

## Healthcheck / “Application failed to respond”

1. Open **Deploy Logs** (not Build) — look for:
   - `SARUPAK API listening on 0.0.0.0:…`
   - `DATABASE_URL host=…`
   - `Postgres $connect failed` / P1001
2. Fix `DATABASE_URL` as above, then **Redeploy**
3. After a good boot: `curl https://<host>/v1/health` should return JSON with `"service":"sarupak-api"` and `"database":"up"`
4. If `"database":"down"` the HTTP server is fine — only the DB URL/link is wrong

## After first healthy deploy

```bash
# Already attempted on every railway:start; re-run if needed:
npm run prisma:deploy -w @sarupak/api
```

Then set Vercel `NEXT_PUBLIC_API_URL=https://<railway-public-host>/v1` and redeploy web.
