"""
SARUPAK AI Worker — FastAPI for Hugging Face Spaces / local.

Endpoints:
  GET  /health
  GET  /          (Space landing)
  POST /v1/analyze
  POST /v1/segment
"""

from __future__ import annotations

from typing import Any

from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, Field

app = FastAPI(
    title="SARUPAK Worker",
    description="Owned AI photo analysis / segmentation worker",
    version="0.1.1",
)

ALLOWED_ORIGINS = [
    "https://sarupak.vercel.app",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_methods=["*"],
    allow_headers=["*"],
)


class RegionHint(BaseModel):
    target: str
    note: str = ""


class AnalyzeResponse(BaseModel):
    scene: str = "general"
    confidence: float = 0.5
    explanation: str
    issues: list[str] = Field(default_factory=list)
    region_hints: list[RegionHint] = Field(default_factory=list)
    suggested_edits: dict[str, float] = Field(default_factory=dict)
    masks_available: bool = False
    provider: str = "stub"


@app.get("/", response_class=HTMLResponse)
def root() -> str:
    return """
    <!doctype html>
    <html><head><meta charset="utf-8"><title>SARUPAK Worker</title>
    <style>
      body{font-family:system-ui;background:#12110f;color:#f3efe6;
      max-width:640px;margin:3rem auto;padding:0 1rem;line-height:1.5}
      a{color:#e8a045} code{background:#1e1c18;padding:.15rem .4rem;border-radius:6px}
    </style></head>
    <body>
      <h1>SARUPAK Worker</h1>
      <p>API online. Web app: <a href="https://sarupak.vercel.app">sarupak.vercel.app</a></p>
      <ul>
        <li><code>GET /health</code></li>
        <li><code>POST /v1/analyze</code></li>
        <li><code>POST /v1/segment</code></li>
        <li><a href="/docs">OpenAPI docs</a></li>
      </ul>
    </body></html>
    """


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "sarupak-worker"}


@app.post("/v1/analyze", response_model=AnalyzeResponse)
async def analyze(file: UploadFile = File(...)) -> AnalyzeResponse:
    """
    Accepts an image; returns recipe-shaped JSON.
    Stub now — plug rembg / SAM / SegFormer next.
    """
    _ = await file.read()

    return AnalyzeResponse(
        scene="general",
        confidence=0.4,
        explanation=(
            "Worker hosted — stub analyze។ "
            "បន្ទាប់: open-source segmentation models នៅទីនេះ។"
        ),
        issues=["worker_stub"],
        region_hints=[
            RegionHint(target="subject", note="planned: SAM / rembg"),
            RegionHint(target="skin", note="planned: face parsing"),
            RegionHint(target="sky", note="planned: semantic seg"),
            RegionHint(target="nature", note="planned: vegetation class"),
        ],
        suggested_edits={
            "exposure": 0.2,
            "contrast": 8,
            "highlights": -10,
            "shadows": 15,
            "temperature": 4,
            "vibrance": 10,
            "saturation": 0,
            "clarity": 5,
            "whites": 0,
            "blacks": 0,
            "tint": 0,
        },
        masks_available=False,
        provider="huggingface-space",
    )


@app.post("/v1/segment")
async def segment(file: UploadFile = File(...)) -> dict[str, Any]:
    """Return mask metadata later (PNG base64 per class)."""
    _ = await file.read()
    return {
        "masks": {},
        "classes": ["subject", "skin", "sky", "nature", "background"],
        "status": "not_implemented",
        "provider": "huggingface-space",
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app:app", host="0.0.0.0", port=7860, reload=True)
