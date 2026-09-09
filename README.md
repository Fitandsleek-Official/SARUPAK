# SARUPAK — AI Creative Studio

Multi-tool AI media platform (owned stack · browser + Hugging Face ready).

## Features

| Tool | Route | Status |
|------|-------|--------|
| AI Image Editor | `/editor` | Live — person vs landscape regional edit |
| Background Remover | `/remove-bg` | Live |
| Photo Collage Maker | `/collage` | Live |
| AI Image Generator | `/generate` | Beta UI |
| Video Converter | `/video` | Live — TikTok 120Hz / Facebook post quality, compress, 24–240 FPS, HD–8K |
| AI Face Swap | `/face-swap` | Beta UI |

## Local develop

```bash
cd web
npm install
npm run dev
```

Open http://localhost:3000

## Host on Vercel (recommended)

1. Push this repo to GitHub
2. [vercel.com/new](https://vercel.com/new) → Import repo
3. **Root Directory:** `web`
4. Framework: Next.js (auto)
5. Deploy

Or CLI:

```bash
cd web
npx vercel
```

Production build check:

```bash
cd web
npm run build
npm start
```

## Worker on Hugging Face Spaces

1. https://huggingface.co/new-space → name `sarupak-worker` → SDK **Docker**
2. Upload files from `worker/` (`Dockerfile`, `app.py`, `requirements.txt`, `README.md`)
3. Wait for build → copy Space URL
4. Vercel → SARUPAK project → Environment Variable:

```
NEXT_PUBLIC_WORKER_URL=https://YOUR_USER-sarupak-worker.hf.space
```

5. Redeploy web

Health check: `https://YOUR_USER-sarupak-worker.hf.space/health`

## Structure

```
SARUPAK/
  web/       Next.js  ← Vercel https://sarupak.vercel.app
  worker/    FastAPI  ← Hugging Face Space (Docker)
  README.md
```

## Notes

- First Background Remover / person segment run downloads ONNX model in the browser (~40MB)
- First Video Converter run downloads FFmpeg WASM in the browser (~31MB)
- Optional: `web/.env` from `web/.env.example` for future worker URL
- Worker is not required for current live features
