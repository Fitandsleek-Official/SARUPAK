# SARUPAK development ports (Phase 5.2)

Stable local defaults — **do not** share ports with unrelated projects.

| Service | Port | URL |
|---------|------|-----|
| SARUPAK API | **4003** | http://localhost:4003/v1 |
| SARUPAK Web | **3010** | http://localhost:3010 |
| Studio | 3010 | http://localhost:3010/studio |
| Health | 4003 | http://localhost:4003/v1/health |

## Ports that often belong to *other* apps on this machine

| Port | Typical occupant | Action |
|------|------------------|--------|
| **4000** | Norng Downloader API | **Leave alone** — not SARUPAK |
| **3000** | Norng Downloader frontend | **Leave alone** — `/studio` is not SARUPAK |
| **4002** | Stale SARUPAK API (older build) | Identify, then stop *only* if you confirm it is SARUPAK |

Never kill a process solely because a port is busy. Identify the binary/cwd first.

## Identify a listener

```bash
lsof -nP -iTCP:4003 -sTCP:LISTEN
lsof -nP -iTCP:3010 -sTCP:LISTEN
# Also check lookalikes
lsof -nP -iTCP:4000,4002,3000 -sTCP:LISTEN
```

Confirm SARUPAK identity:

```bash
curl -s http://127.0.0.1:4003/v1/health
# Expect: {"status":"ok","service":"sarupak-api","version":"0.5.2",...}

npm run smoke:api
# or: node scripts/smoke-api.mjs http://localhost:4003/v1
```

If `service` is missing or not `sarupak-api`, you are talking to the wrong process.

## Stop a stale SARUPAK process safely

1. Confirm health/`ps`/`lsof` shows a Node process serving SARUPAK (cwd under this repo), not Norng/Python.
2. Stop only that PID:

```bash
# Example — replace PID after you verify it
kill <PID>
# If still listening after a few seconds:
# kill -9 <PID>
```

Do **not** bulk-kill ports 3000 or 4000 — those are frequently other projects.

## Startup

```bash
# From repo root (after cp .env.example → .env / .env.local)
npm run dev:api    # → :4003
npm run dev:web    # → :3010
```

Environment:

- `apps/api/.env` → `PORT=4003`, `CORS_ORIGINS` includes `http://localhost:3010` and `http://127.0.0.1:3010`
- `web/.env.local` → `NEXT_PUBLIC_API_URL=http://localhost:4003/v1`

**Restart Next.js after any change to `NEXT_PUBLIC_*`** — those values are inlined at process start.

## CORS

API default origins (when `CORS_ORIGINS` unset):

- `http://localhost:3010`
- `http://127.0.0.1:3010`
- `http://localhost:3000` / `http://127.0.0.1:3000` (legacy; prefer 3010)

Quick check:

```bash
curl -sI -H "Origin: http://127.0.0.1:3010" \
  -H "Access-Control-Request-Method: GET" \
  -X OPTIONS http://127.0.0.1:4003/v1/health
# Expect Access-Control-Allow-Origin reflecting the request Origin
```
