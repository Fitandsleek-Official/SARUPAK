---
title: SARUPAK Worker
emoji: 🎨
colorFrom: yellow
colorTo: gray
sdk: docker
pinned: false
app_port: 7860
---

# SARUPAK Worker

FastAPI AI worker for **[SARUPAK](https://sarupak.vercel.app)** — analyze / segment API.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| POST | `/v1/analyze` | Image → edit recipe JSON |
| POST | `/v1/segment` | Image → region masks (soon) |
| GET | `/docs` | OpenAPI |

## Connect to Vercel

In Vercel → Project → Settings → Environment Variables:

```
NEXT_PUBLIC_WORKER_URL=https://kalapak-sarupak-worker.hf.space
```

Space: https://huggingface.co/spaces/Kalapak/sarupak-worker

Then redeploy the web app.

## Local

```bash
pip install -r requirements.txt
python app.py
```
