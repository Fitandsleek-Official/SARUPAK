# SARUPAK Worker (Hugging Face ready)

## Local

```bash
cd worker
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python app.py
```

Health: http://localhost:7860/health

## Hugging Face Space (later)

1. Create a new Space (Docker or FastAPI template)
2. Upload `app.py` + `requirements.txt`
3. Point the Next.js app at the Space URL via `NEXT_PUBLIC_WORKER_URL`

Open models to plug in next: rembg / BiRefNet, SAM 2, SegFormer.
