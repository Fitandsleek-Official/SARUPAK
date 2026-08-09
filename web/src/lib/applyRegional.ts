import { applyEditsToImageData } from "./applyEdits";
import type { EffectsParams, ImageMasks, RegionalRecipe } from "./regionalTypes";
import { DEFAULT_EDITS, type EditParams } from "./types";

function clamp(n: number, min = 0, max = 255) {
  return Math.max(min, Math.min(max, n));
}

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

function sampleMask(
  mask: Float32Array,
  mw: number,
  mh: number,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const fx = (x / Math.max(1, w - 1)) * (mw - 1);
  const fy = (y / Math.max(1, h - 1)) * (mh - 1);
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const x1 = Math.min(mw - 1, x0 + 1);
  const y1 = Math.min(mh - 1, y0 + 1);
  const tx = fx - x0;
  const ty = fy - y0;
  const a = mask[y0 * mw + x0];
  const b = mask[y0 * mw + x1];
  const c = mask[y1 * mw + x0];
  const d = mask[y1 * mw + x1];
  return a * (1 - tx) * (1 - ty) + b * tx * (1 - ty) + c * (1 - tx) * ty + d * tx * ty;
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

function hsvToRgb(h: number, s: number, v: number) {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let rp = 0;
  let gp = 0;
  let bp = 0;
  if (h < 60) [rp, gp, bp] = [c, x, 0];
  else if (h < 120) [rp, gp, bp] = [x, c, 0];
  else if (h < 180) [rp, gp, bp] = [0, c, x];
  else if (h < 240) [rp, gp, bp] = [0, x, c];
  else if (h < 300) [rp, gp, bp] = [x, 0, c];
  else [rp, gp, bp] = [c, 0, x];
  return {
    r: (rp + m) * 255,
    g: (gp + m) * 255,
    b: (bp + m) * 255,
  };
}

function boxBlurRegion(
  src: Uint8ClampedArray,
  width: number,
  height: number,
  amount: number,
  backgroundMask: (x: number, y: number) => number,
) {
  if (amount < 2) return src;
  const radius = Math.min(18, Math.max(1, Math.round(amount / 8)));
  const copy = new Uint8ClampedArray(src);
  const out = src;

  // Separable-ish small blur weighted by background mask
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const bg = backgroundMask(x, y);
      if (bg < 0.08) continue;
      let r = 0;
      let g = 0;
      let b = 0;
      let n = 0;
      for (let ky = -radius; ky <= radius; ky += 2) {
        const yy = Math.min(height - 1, Math.max(0, y + ky));
        for (let kx = -radius; kx <= radius; kx += 2) {
          const xx = Math.min(width - 1, Math.max(0, x + kx));
          const idx = (yy * width + xx) * 4;
          r += copy[idx];
          g += copy[idx + 1];
          b += copy[idx + 2];
          n++;
        }
      }
      const i = (y * width + x) * 4;
      const t = clamp01(bg * clamp01(amount / 70));
      out[i] = copy[i] * (1 - t) + (r / n) * t;
      out[i + 1] = copy[i + 1] * (1 - t) + (g / n) * t;
      out[i + 2] = copy[i + 2] * (1 - t) + (b / n) * t;
    }
  }
  return out;
}

function applyRegionalEffects(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  masks: ImageMasks,
  effects: EffectsParams,
  mode: "person" | "landscape",
) {
  const { width: mw, height: mh } = masks;
  const get = (mask: Float32Array, x: number, y: number) =>
    sampleMask(mask, mw, mh, x, y, width, height);

  const person = mode === "person";

  // Pass 1: tonal / color per region
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      let r = data[i];
      let g = data[i + 1];
      let b = data[i + 2];

      const subject = person ? get(masks.subject, x, y) : 0;
      const bg = person ? get(masks.background, x, y) : 0;
      const skin = person ? get(masks.skin, x, y) : 0;
      const foliage = get(masks.foliage, x, y);
      const flower = get(masks.flower, x, y);

      if (person && effects.subjectLift > 0 && subject > 0.05) {
        const lift = 1 + (effects.subjectLift / 100) * 0.28 * subject;
        r *= lift;
        g *= lift;
        b *= lift;
        const mid = 128;
        const c = 1 + (effects.subjectLift / 100) * 0.12 * subject;
        r = (r - mid) * c + mid;
        g = (g - mid) * c + mid;
        b = (b - mid) * c + mid;
      }

      if (person && effects.backgroundDim > 0 && bg > 0.05) {
        const dim = 1 - (effects.backgroundDim / 100) * 0.22 * bg;
        r *= dim;
        g *= dim;
        b *= dim;
      }

      if (person && effects.skinGlow > 0 && skin > 0.05) {
        const t = (effects.skinGlow / 100) * skin;
        r = r * (1 + t * 0.12) + t * 10;
        g = g * (1 + t * 0.06) + t * 4;
        b = b * (1 - t * 0.04);
        const avg = (r + g + b) / 3;
        r = avg + (r - avg) * (1 - t * 0.15);
        g = avg + (g - avg) * (1 - t * 0.15);
        b = avg + (b - avg) * (1 - t * 0.15);
      }

      if (effects.foliagePop > 0 && foliage > 0.05) {
        let { h, s, v } = rgbToHsv(r, g, b);
        const t = (effects.foliagePop / 100) * foliage;
        s = clamp01(s * (1 + t * 0.45) + t * 0.05);
        v = clamp01(v * (1 + t * 0.04));
        ({ r, g, b } = hsvToRgb(h, s, v));
      }

      if (effects.flowerPop > 0 && flower > 0.05) {
        let { h, s, v } = rgbToHsv(r, g, b);
        const t = (effects.flowerPop / 100) * flower;
        s = clamp01(s * (1 + t * 0.7) + t * 0.08);
        v = clamp01(v * (1 + t * 0.08));
        ({ r, g, b } = hsvToRgb(h, s, v));
      }

      const sky = get(masks.sky, x, y);
      if ((effects.skyPop ?? 0) > 0 && sky > 0.05) {
        let { h, s, v } = rgbToHsv(r, g, b);
        const t = (effects.skyPop / 100) * sky;
        s = clamp01(s * (1 + t * 0.35) + t * 0.03);
        // gently deepen sky without white blotches
        v = clamp01(v * (1 - t * 0.08));
        ({ r, g, b } = hsvToRgb(h, s, v));
      }

      data[i] = clamp(r);
      data[i + 1] = clamp(g);
      data[i + 2] = clamp(b);
    }
  }

  if (person) {
    const subjectMean = meanMask(masks.subject);
    if (effects.backgroundBlur > 1 && subjectMean > 0.04 && subjectMean < 0.72) {
      boxBlurRegion(data, width, height, effects.backgroundBlur, (x, y) =>
        get(masks.background, x, y),
      );
    }
    if (effects.rimGlow > 1 && subjectMean > 0.05) {
      applyRimGlow(data, width, height, masks, effects.rimGlow);
    }
  }
}

function meanMask(mask: Float32Array) {
  let s = 0;
  for (let i = 0; i < mask.length; i++) s += mask[i];
  return s / Math.max(1, mask.length);
}

function applyRimGlow(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  masks: ImageMasks,
  amount: number,
) {
  const { width: mw, height: mh, subject, sky, background } = masks;
  const glow = new Float32Array(width * height);
  const radius = Math.max(4, Math.round(Math.min(width, height) * 0.022));

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const core = sampleMask(subject, mw, mh, x, y, width, height);
      if (core > 0.55) {
        glow[y * width + x] = 0;
        continue;
      }

      // Only near a strong subject edge
      let maxS = 0;
      for (let ky = -radius; ky <= radius; ky += 2) {
        const yy = Math.min(height - 1, Math.max(0, y + ky));
        for (let kx = -radius; kx <= radius; kx += 2) {
          const xx = Math.min(width - 1, Math.max(0, x + kx));
          const s = sampleMask(subject, mw, mh, xx, yy, width, height);
          if (s < 0.5) continue;
          const dist = Math.sqrt(kx * kx + ky * ky) / radius;
          maxS = Math.max(maxS, s * (1 - dist));
        }
      }

      const skyW = sampleMask(sky, mw, mh, x, y, width, height);
      const bgW = sampleMask(background, mw, mh, x, y, width, height);
      // Suppress glow in sky / empty background — this was the white blotch bug
      const edge = clamp01(maxS - core);
      glow[y * width + x] = edge * (1 - skyW * 0.95) * clamp01(0.35 + bgW * 0.2);
    }
  }

  // Soften glow map
  const soft = new Float32Array(glow.length);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const p = y * width + x;
      soft[p] =
        (glow[p] +
          glow[p - 1] +
          glow[p + 1] +
          glow[p - width] +
          glow[p + width]) /
        5;
    }
  }

  const strength = Math.min(0.7, amount / 100);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const g = soft[p] * strength;
    if (g < 0.02) continue;
    data[i] = clamp(data[i] + g * 42);
    data[i + 1] = clamp(data[i + 1] + g * 34);
    data[i + 2] = clamp(data[i + 2] + g * 22);
  }
}

export function renderRegionalImage(
  source: HTMLImageElement | ImageBitmap,
  recipe: RegionalRecipe,
  masks: ImageMasks | null,
  maxSide = 1600,
): HTMLCanvasElement {
  const sw = source.width;
  const sh = source.height;
  const scale = Math.min(1, maxSide / Math.max(sw, sh));
  const w = Math.max(1, Math.round(sw * scale));
  const h = Math.max(1, Math.round(sh * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas unavailable");
  ctx.drawImage(source as CanvasImageSource, 0, 0, w, h);

  let imageData = ctx.getImageData(0, 0, w, h);
  imageData = applyEditsToImageData(imageData, recipe.global);

  if (masks) {
    applyRegionalEffects(
      imageData.data,
      w,
      h,
      masks,
      recipe.effects,
      recipe.mode ?? "landscape",
    );
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

/** Convenience when only global edits (no masks yet) */
export function renderWithOptionalMasks(
  source: HTMLImageElement | ImageBitmap,
  global: EditParams,
  effects: EffectsParams | null,
  masks: ImageMasks | null,
  maxSide = 1600,
) {
  return renderRegionalImage(
    source,
    {
      mode: "landscape",
      global: global ?? DEFAULT_EDITS,
      effects: effects ?? {
        subjectLift: 0,
        backgroundDim: 0,
        backgroundBlur: 0,
        foliagePop: 0,
        flowerPop: 0,
        skinGlow: 0,
        rimGlow: 0,
        skyPop: 0,
      },
    },
    masks,
    maxSide,
  );
}
