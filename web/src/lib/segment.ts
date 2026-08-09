import type { ImageMasks, MaskQuality } from "./regionalTypes";

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

function rgbToHsv(r: number, g: number, b: number) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const s = max === 0 ? 0 : d / max;
  return { h, s, v: max };
}

function featherMask(mask: Float32Array, width: number, height: number, passes = 2) {
  let cur = mask;
  for (let p = 0; p < passes; p++) {
    const next = new Float32Array(cur.length);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let sum = 0;
        let n = 0;
        for (let ky = -1; ky <= 1; ky++) {
          const yy = Math.min(height - 1, Math.max(0, y + ky));
          for (let kx = -1; kx <= 1; kx++) {
            const xx = Math.min(width - 1, Math.max(0, x + kx));
            sum += cur[yy * width + xx];
            n++;
          }
        }
        next[y * width + x] = sum / n;
      }
    }
    cur = next;
  }
  return cur;
}

function imageToCanvas(
  source: HTMLImageElement | ImageBitmap,
  maxSide: number,
) {
  const scale = Math.min(1, maxSide / Math.max(source.width, source.height));
  const w = Math.max(1, Math.round(source.width * scale));
  const h = Math.max(1, Math.round(source.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas unavailable");
  ctx.drawImage(source as CanvasImageSource, 0, 0, w, h);
  return { canvas, ctx, w, h, data: ctx.getImageData(0, 0, w, h).data };
}

function heuristicSubject(
  data: Uint8ClampedArray,
  w: number,
  h: number,
): Float32Array {
  const out = new Float32Array(w * h);
  const cx = w * 0.5;
  const cy = h * 0.45;
  const rx = w * 0.38;
  const ry = h * 0.48;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const { h: hue, s, v } = rgbToHsv(r, g, b);

      const nx = (x - cx) / rx;
      const ny = (y - cy) / ry;
      const center = clamp01(1 - Math.sqrt(nx * nx + ny * ny));

      // Skin-ish boost for portraits
      const skin =
        r > 45 &&
        g > 25 &&
        b > 15 &&
        r >= g * 0.9 &&
        r > b &&
        s > 0.08 &&
        s < 0.7 &&
        v > 0.18 &&
        v < 0.95
          ? clamp01((r - b) / 80) * clamp01(s * 2)
          : 0;

      // Push down pure foliage as subject
      const foliage =
        hue > 70 && hue < 170 && s > 0.2 && v > 0.15 && v < 0.85 ? 1 : 0;

      let score = center * 0.55 + skin * 0.55 - foliage * 0.25;
      // Prefer mid saturation clothing vs green bg
      if (s < 0.45 && v > 0.12 && v < 0.85 && foliage < 0.5) score += 0.12;
      out[y * w + x] = clamp01(score);
    }
  }

  return featherMask(out, w, h, 3);
}

async function mlSubjectMask(
  source: HTMLImageElement | ImageBitmap,
  w: number,
  h: number,
): Promise<Float32Array | null> {
  try {
    const { segmentForeground } = await import("@imgly/background-removal");
    const tmp = document.createElement("canvas");
    const tw = Math.min(source.width, 720);
    const th = Math.round((source.height / source.width) * tw);
    tmp.width = tw;
    tmp.height = th;
    const tctx = tmp.getContext("2d");
    if (!tctx) return null;
    tctx.drawImage(source as CanvasImageSource, 0, 0, tw, th);

    const blob = await new Promise<Blob | null>((resolve) =>
      tmp.toBlob(resolve, "image/jpeg", 0.92),
    );
    if (!blob) return null;

    const maskBlob = await segmentForeground(blob, {
      model: "isnet_quint8",
      output: { format: "image/png" },
    });

    const url = URL.createObjectURL(maskBlob);
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("mask load failed"));
      el.src = url;
    });
    URL.revokeObjectURL(url);

    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, w, h);
    const pixels = ctx.getImageData(0, 0, w, h).data;
    const out = new Float32Array(w * h);
    for (let i = 0, p = 0; i < pixels.length; i += 4, p++) {
      // alpha mask or white-on-black
      const a = pixels[i + 3] / 255;
      const lum = pixels[i] / 255;
      out[p] = Math.max(a, lum);
    }
    return featherMask(out, w, h, 2);
  } catch {
    return null;
  }
}

function cleanupSubjectMask(
  mask: Float32Array,
  w: number,
  h: number,
): Float32Array {
  // Harder threshold + remove tiny speckles that cause sky blotches
  const hard = new Float32Array(mask.length);
  for (let i = 0; i < mask.length; i++) {
    hard[i] = mask[i] > 0.42 ? mask[i] : 0;
  }

  // Morphological open-ish: erode then dilate lightly
  const eroded = new Float32Array(hard.length);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      let minV = 1;
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          minV = Math.min(minV, hard[(y + ky) * w + (x + kx)]);
        }
      }
      eroded[y * w + x] = minV;
    }
  }
  const opened = new Float32Array(hard.length);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      let maxV = 0;
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          maxV = Math.max(maxV, eroded[(y + ky) * w + (x + kx)]);
        }
      }
      opened[y * w + x] = maxV;
    }
  }

  return featherMask(opened, w, h, 2);
}

function colorRegionMasks(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  subject: Float32Array,
) {
  const skin = new Float32Array(w * h);
  const foliage = new Float32Array(w * h);
  const flower = new Float32Array(w * h);
  const sky = new Float32Array(w * h);
  const background = new Float32Array(w * h);

  for (let p = 0; p < w * h; p++) {
    const i = p * 4;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const { h: hue, s, v } = rgbToHsv(r, g, b);
    const sub = subject[p];
    background[p] = 1 - sub;

    const skinScore =
      r > 50 &&
      g > 30 &&
      b > 20 &&
      r > g &&
      g >= b * 0.8 &&
      r - b > 12 &&
      s > 0.1 &&
      s < 0.65 &&
      v > 0.2 &&
      v < 0.92
        ? clamp01(((r - b) / 90) * (1 - Math.abs(s - 0.35)))
        : 0;
    skin[p] = skinScore * clamp01(sub + 0.15);

    const green =
      hue > 75 && hue < 165 && s > 0.18 && v > 0.12 && v < 0.9
        ? clamp01((s - 0.1) * 1.6)
        : 0;
    foliage[p] = green * (0.35 + background[p] * 0.65);

    const pink =
      ((hue < 25 || hue > 320) && s > 0.25 && v > 0.25) ||
      (hue > 300 && hue < 340 && s > 0.2)
        ? clamp01(s * 1.4)
        : 0;
    flower[p] = pink * (0.4 + background[p] * 0.6 + sub * 0.2);

    const y = Math.floor(p / w);
    const topBias = clamp01(1 - y / (h * 0.55));
    // Blue sky OR pale/grey overcast sky (temples, travel)
    const skyScore =
      hue > 185 && hue < 250 && s > 0.08 && v > 0.28
        ? clamp01(s * 1.2 + (v - 0.3) * 0.5)
        : s < 0.22 && v > 0.55 && topBias > 0.35
          ? clamp01((v - 0.5) * 1.8) * topBias
          : hue > 195 && s < 0.15 && v > 0.55
            ? clamp01((v - 0.5) * 1.5) * 0.6
            : 0;
    sky[p] = skyScore * (0.4 + topBias * 0.6);
  }

  return {
    skin: featherMask(skin, w, h, 2),
    foliage: featherMask(foliage, w, h, 2),
    flower: featherMask(flower, w, h, 2),
    sky: featherMask(sky, w, h, 2),
    background,
  };
}

/**
 * Build soft masks. When personMode=false (landscape), skip ML subject
 * entirely — prevents temple/sky blotches from false subject masks.
 */
export async function buildMasks(
  source: HTMLImageElement | ImageBitmap,
  maxSide = 512,
  personMode = true,
): Promise<ImageMasks> {
  const { w, h, data } = imageToCanvas(source, maxSide);

  let subject: Float32Array;
  let quality: MaskQuality = "heuristic";

  if (!personMode) {
    subject = new Float32Array(w * h); // all zeros — no subject effects
    quality = "heuristic";
  } else {
    let ml: Float32Array | null = null;
    ml = await mlSubjectMask(source, w, h);
    if (ml) {
      subject = cleanupSubjectMask(ml, w, h);
      quality = "ml";
    } else {
      subject = heuristicSubject(data, w, h);
      quality = "heuristic";
    }
  }

  const regions = colorRegionMasks(data, w, h, subject);

  // Landscape: treat full frame as background for nature/sky only
  if (!personMode) {
    for (let i = 0; i < regions.background.length; i++) {
      regions.background[i] = 1;
    }
  }

  return {
    width: w,
    height: h,
    subject,
    background: regions.background,
    skin: personMode ? regions.skin : new Float32Array(w * h),
    foliage: regions.foliage,
    flower: regions.flower,
    sky: regions.sky,
    quality,
  };
}
