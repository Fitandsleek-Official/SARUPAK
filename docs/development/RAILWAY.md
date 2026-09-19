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
| `CORS_ORIGINS` | Optional — API already allows `https://sarupak.vercel.app` and `*.vercel.app` |
| `PORT` | **Leave unset** — Railway injects it (often `8080`) |

### Public domain Target port (required for Studio on Vercel)

Deploy Logs showing `listening on 0.0.0.0:8080` while the browser shows CORS / “Cannot reach API” usually means the **edge cannot reach Nest** (HTTP 502 with no CORS headers).

1. Open Deploy Logs → note the port in `SARUPAK API listening on 0.0.0.0:<PORT>`
2. API service → **Settings → Networking → Public Networking**
3. Click the `*.up.railway.app` domain → set **Target port** to that `<PORT>` (e.g. **8080**)
4. Or delete the domain and **Generate Domain** again so Railway picks the correct port
5. Verify: `curl https://sarupakapi-production.up.railway.app/v1/health` returns JSON (not 502)
| `STORAGE_DRIVER` | `local` |
| `STORAGE_LOCAL_PATH` | **`/data/storage`** (must match the volume mount below) |
| `TTS_PROVIDER` | `mock` (until OpenAI key is set) |
| `STT_PROVIDER` | `mock` |

### Persistent media (required — otherwise Studio 404s after redeploy)

Railway’s container disk is **ephemeral**. Uploaded videos live only until the next deploy/restart unless you mount a **Volume**:

1. API service → **Settings → Volumes** → **Add Volume**
2. Mount path: `/data`
3. Set variable: `STORAGE_LOCAL_PATH=/data/storage`
4. Redeploy, then **re-import** any media (old DB rows still point at files that no longer exist)

Without a volume, Studio will show *Media failed to load* / content `404` after each deploy even though the project timeline still lists clips.

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

App can be healthy in **Deploy Logs** and still 502 publicly if the **public domain target port** does not match the listen port.

1. In Deploy Logs, find: `SARUPAK API listening on 0.0.0.0:<PORT>/v1`
2. API service → **Settings → Networking → Public Networking** → domain → **Target port** = that same `<PORT>` (often `8080`). Not `3000` / `4003` unless you forced `PORT` to that value.
3. Confirm logs show `DATABASE_URL host=postgres.railway.internal` and `Postgres connected`
4. `curl https://<host>/v1/health` → `"service":"sarupak-api"` and `"database":"up"`
5. If `"database":"down"` the HTTP server is fine — only the DB URL/link is wrong

## After first healthy deploy

```bash
# Already attempted on every railway:start; re-run if needed:
npm run prisma:deploy -w @sarupak/api
```

Then set Vercel `NEXT_PUBLIC_API_URL=https://<railway-public-host>/v1` and redeploy web.
