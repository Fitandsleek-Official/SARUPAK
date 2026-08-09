# SARUPAK — AI Creative Studio

Multi-tool AI media platform (owned stack · browser + Hugging Face ready).

## Features

| Tool | Route | Status |
|------|-------|--------|
| AI Image Editor | `/editor` | Live — person vs landscape regional edit |
| Background Remover | `/remove-bg` | Live |
| Photo Collage Maker | `/collage` | Live |
| AI Image Generator | `/generate` | Beta UI |
| AI Video Generator | `/video` | Soon |
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

## Structure

```
SARUPAK/
  web/       Next.js app  ← deploy this
  worker/    FastAPI stub (HF later)
  README.md
```

## Notes

- First Background Remover / person segment run downloads ONNX model in the browser (~40MB)
- Optional: `web/.env` from `web/.env.example` for future worker URL
- Worker is not required for current live features
