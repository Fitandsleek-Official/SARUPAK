"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type LayoutId = "grid2" | "grid3" | "stack" | "hero";

const LAYOUTS: { id: LayoutId; label: string }[] = [
  { id: "grid2", label: "2×2" },
  { id: "grid3", label: "3 cols" },
  { id: "stack", label: "Stack" },
  { id: "hero", label: "Hero+" },
];

export function CollageTool() {
  const [urls, setUrls] = useState<string[]>([]);
  const [layout, setLayout] = useState<LayoutId>("grid2");
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const onFiles = useCallback(async (files: FileList | null) => {
    if (!files?.length) return;
    const next: string[] = [];
    for (const file of Array.from(files).slice(0, 6)) {
      next.push(URL.createObjectURL(file));
    }
    setUrls((prev) => [...prev, ...next].slice(0, 6));
  }, []);

  const draw = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas || urls.length === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = 1200;
    const H = 1200;
    canvas.width = W;
    canvas.height = H;
    ctx.fillStyle = "#141210";
    ctx.fillRect(0, 0, W, H);

    const images = await Promise.all(
      urls.map(
        (src) =>
          new Promise<HTMLImageElement>((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = src;
          }),
      ),
    );

    const gap = 16;
    const drawCover = (
      img: HTMLImageElement,
      x: number,
      y: number,
      w: number,
      h: number,
    ) => {
      const scale = Math.max(w / img.width, h / img.height);
      const sw = w / scale;
      const sh = h / scale;
      const sx = (img.width - sw) / 2;
      const sy = (img.height - sh) / 2;
      ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
    };

    if (layout === "grid2") {
      const cols = 2;
      const rows = Math.ceil(images.length / cols);
      const cellW = (W - gap * (cols + 1)) / cols;
      const cellH = (H - gap * (rows + 1)) / rows;
      images.forEach((img, i) => {
        const c = i % cols;
        const r = Math.floor(i / cols);
        drawCover(
          img,
          gap + c * (cellW + gap),
          gap + r * (cellH + gap),
          cellW,
          cellH,
        );
      });
    } else if (layout === "grid3") {
      const cols = 3;
      const rows = Math.ceil(Math.max(images.length, 3) / cols);
      const cellW = (W - gap * (cols + 1)) / cols;
      const cellH = (H - gap * (rows + 1)) / rows;
      images.forEach((img, i) => {
        const c = i % cols;
        const r = Math.floor(i / cols);
        drawCover(
          img,
          gap + c * (cellW + gap),
          gap + r * (cellH + gap),
          cellW,
          cellH,
        );
      });
    } else if (layout === "stack") {
      const cellH = (H - gap * (images.length + 1)) / images.length;
      images.forEach((img, i) => {
        drawCover(img, gap, gap + i * (cellH + gap), W - gap * 2, cellH);
      });
    } else {
      const main = images[0];
      const rest = images.slice(1);
      drawCover(main, gap, gap, W - gap * 2, H * 0.62);
      if (rest.length) {
        const cellW = (W - gap * (rest.length + 1)) / rest.length;
        const y = H * 0.62 + gap * 2;
        const h = H - y - gap;
        rest.forEach((img, i) => {
          drawCover(img, gap + i * (cellW + gap), y, cellW, h);
        });
      }
    }
  }, [urls, layout]);

  useEffect(() => {
    void draw();
  }, [draw]);

  const exportPng = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = "sarupak-collage.png";
    a.click();
  };

  return (
    <div className="tool-page">
      <header className="tool-hero">
        <p className="tool-kicker">Live</p>
        <h1>Photo Collage Maker</h1>
        <p>រៀបរូបច្រើនជា layout — export PNG មួយចុច</p>
      </header>

      <div className="tool-stage collage-stage">
        <div className="collage-controls">
          <label className="btn-primary">
            បន្ថែមរូប
            <input
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => onFiles(e.target.files)}
            />
          </label>
          <div className="layout-row">
            {LAYOUTS.map((l) => (
              <button
                key={l.id}
                type="button"
                className={`btn-ghost ${layout === l.id ? "is-active" : ""}`}
                onClick={() => setLayout(l.id)}
              >
                {l.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="btn-ghost"
            onClick={() => setUrls([])}
            disabled={!urls.length}
          >
            Clear
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={exportPng}
            disabled={!urls.length}
          >
            Export
          </button>
        </div>

        <div className="collage-preview">
          <canvas ref={canvasRef} />
          {!urls.length && (
            <p className="collage-empty">បន្ថែមរូប ២–៦ សន្លឹកដើម្បីចាប់ផ្តើម</p>
          )}
        </div>
      </div>
    </div>
  );
}
