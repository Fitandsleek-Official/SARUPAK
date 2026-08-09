"""
SARUPAK AI Worker — FastAPI stub for local / Hugging Face Spaces.

MVP web app analyzes in-browser. This worker is the future home for:
  - person / skin / sky / nature segmentation
  - richer auto-grade recipes

Deploy later as a Hugging Face Space (Docker / Gradio / FastAPI).
"""

from __future__ import annotations

from typing import Any

from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

app = FastAPI(
    title="SARUPAK Worker",
    description="Owned AI photo analysis / segmentation worker",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
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


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "sarupak-worker"}


@app.post("/v1/analyze", response_model=AnalyzeResponse)
async def analyze(file: UploadFile = File(...)) -> AnalyzeResponse:
    """
    Placeholder: accepts an image and returns a recipe-shaped response.

    Next steps (owned / open-source):
      1. rembg or BiRefNet → subject mask
      2. SAM 2 / SegFormer → sky, vegetation
      3. face parsing → skin
      4. build EditParams JSON for the Next.js renderer
    """
    _ = await file.read()

    return AnalyzeResponse(
        scene="general",
        confidence=0.4,
        explanation=(
            "Worker stub — មិនទាន់រត់ segmentation។ "
            "ភ្ជាប់ open-source models នៅទីនេះ មុន deploy Hugging Face."
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
        provider="stub",
    )


@app.post("/v1/segment")
async def segment(file: UploadFile = File(...)) -> dict[str, Any]:
    """Return mask metadata later (PNG base64 per class)."""
    _ = await file.read()
    return {
        "masks": {},
        "classes": ["subject", "skin", "sky", "nature", "background"],
        "status": "not_implemented",
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app:app", host="0.0.0.0", port=7860, reload=True)
