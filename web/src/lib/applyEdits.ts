import { EditParams } from "./types";

function clamp(n: number, min = 0, max = 255) {
  return Math.max(min, Math.min(max, n));
}

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

/** sRGB <-> approximate linear */
function toLinear(v: number) {
  const x = v / 255;
  return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
}

function toSRGB(v: number) {
  const x = Math.max(0, v);
  const s = x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
  return clamp(s * 255);
}

function lumaLin(r: number, g: number, b: number) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function smoothstep(edge0: number, edge1: number, x: number) {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

/** Filmic S-curve around mid-gray */
function sCurve(x: number, amount: number) {
  // amount -1..1
  if (Math.abs(amount) < 0.001) return x;
  const mid = 0.435;
  const sign = amount > 0 ? 1 : -1;
  const a = Math.abs(amount);
  const gamma = 1 + a * 1.35;
  if (x < mid) {
    const t = x / mid;
    const y = sign > 0 ? Math.pow(t, gamma) : 1 - Math.pow(1 - t, gamma);
    return y * mid;
  }
  const t = (x - mid) / (1 - mid);
  const y = sign > 0 ? 1 - Math.pow(1 - t, gamma) : Math.pow(t, gamma);
  return mid + y * (1 - mid);
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

function hueWeight(h: number, center: number, width: number) {
  let d = Math.abs(h - center);
  if (d > 180) d = 360 - d;
  return clamp01(1 - d / width);
}

/**
 * High-quality Lightroom-like grade pipeline.
 */
export function applyEditsToImageData(
  imageData: ImageData,
  edits: EditParams,
): ImageData {
  const out = new ImageData(
    new Uint8ClampedArray(imageData.data),
    imageData.width,
    imageData.height,
  );
  const d = out.data;
  const w = out.width;
  const h = out.height;

  const contrastA = edits.contrast / 100;
  const temp = edits.temperature / 100;
  const tint = edits.tint / 100;
  const vib = edits.vibrance / 100;
  const sat = edits.saturation / 100;
  const fade = Math.max(0, edits.blacks) / 100; // positive blacks ≈ lift/fade
  const crush = Math.max(0, -edits.blacks) / 100;
  const vignetteAmt =
    Math.max(0, edits.contrast) * 0.00009 +
    Math.max(0, edits.clarity) * 0.00007;

  // Precompute vignette falloff
  const cx = (w - 1) / 2;
  const cy = (h - 1) / 2;
  const maxR = Math.sqrt(cx * cx + cy * cy);

  for (let i = 0; i < d.length; i += 4) {
    let r = d[i];
    let g = d[i + 1];
    let b = d[i + 2];

    // --- 1) Exposure in linear light ---
    let lr = toLinear(r);
    let lg = toLinear(g);
    let lb = toLinear(b);
    const expMul = Math.pow(2, edits.exposure);
    lr *= expMul;
    lg *= expMul;
    lb *= expMul;

    let Y = lumaLin(lr, lg, lb);

    // --- 2) Shadows / Highlights (luma masks) ---
    const sh = edits.shadows / 100;
    const hi = edits.highlights / 100;
    const wh = edits.whites / 100;
    const shadowMask = Math.pow(1 - clamp01(Y / 0.55), 1.6);
    const highlightMask = Math.pow(clamp01((Y - 0.35) / 0.65), 1.5);
    const whiteMask = Math.pow(clamp01(Y), 2.2);

    const toneGain =
      1 +
      sh * 0.55 * shadowMask +
      hi * 0.5 * highlightMask +
      wh * 0.35 * whiteMask -
      crush * 0.4 * Math.pow(1 - clamp01(Y), 2);

    Y = Math.max(0, Y * toneGain);

    // keep chroma ratio while shifting luma
    const y0 = lumaLin(lr, lg, lb) + 1e-6;
    const ratio = Y / y0;
    lr *= ratio;
    lg *= ratio;
    lb *= ratio;

    // --- 3) Contrast S-curve on luma ---
    Y = lumaLin(lr, lg, lb);
    const Yc = sCurve(clamp01(Y), contrastA * 0.85);
    const cRatio = Yc / (Y + 1e-6);
    lr *= cRatio;
    lg *= cRatio;
    lb *= cRatio;

    // Soft highlight rolloff (filmic shoulder)
    const soft = (v: number) => {
      if (v <= 1) return v;
      return 1 + (v - 1) / (1 + (v - 1) * 1.8);
    };
    lr = soft(lr);
    lg = soft(lg);
    lb = soft(lb);

    // --- 4) Temperature / Tint (channel balance in linear) ---
    lr *= 1 + temp * 0.22;
    lg *= 1 + temp * 0.04 - tint * 0.1;
    lb *= 1 - temp * 0.22 + tint * 0.06;

    r = toSRGB(lr);
    g = toSRGB(lg);
    b = toSRGB(lb);

    // --- 5) Vibrance + saturation with skin / selective hue ---
    let { h: hue, s, v } = rgbToHsv(r, g, b);

    const skinW = hueWeight(hue, 28, 42) * smoothstep(0.05, 0.25, s);
    const greenW = hueWeight(hue, 115, 55) * smoothstep(0.08, 0.3, s);
    const skyW = hueWeight(hue, 210, 50) * smoothstep(0.08, 0.28, s);

    // Vibrance: boost low sat more, protect skin
    const vibGain =
      vib * (1 - s) * (1 - skinW * 0.85) +
      vib * 0.25 * greenW +
      vib * 0.2 * skyW;

    // Global sat with skin dampen
    const satGain = sat * (1 - skinW * 0.7);

    // Scene pop baked from vibrance sign on greens/sky
    const selective =
      Math.max(0, vib) * 0.18 * greenW + Math.max(0, vib) * 0.14 * skyW;

    s = clamp01(s * (1 + vibGain + satGain + selective));

    // Soften skin value a touch when clarity negative handled later
    if (skinW > 0.2 && vib > 0) {
      s *= 1 - skinW * 0.08;
    }

    ({ r, g, b } = hsvToRgb(hue, s, v));

    // --- 6) Fade (matte) ---
    if (fade > 0.001) {
      const lift = fade * 28;
      r = r * (1 - fade * 0.15) + lift;
      g = g * (1 - fade * 0.15) + lift;
      b = b * (1 - fade * 0.15) + lift;
    }

    // --- 7) Soft vignette for depth (tied lightly to positive clarity) ---
    if (vignetteAmt > 0.0005) {
      const px = (i / 4) % w;
      const py = Math.floor(i / 4 / w);
      const rr = Math.sqrt((px - cx) ** 2 + (py - cy) ** 2) / maxR;
      const vig = 1 - Math.min(0.28, vignetteAmt * 22) * Math.pow(rr, 1.7);
      r *= vig;
      g *= vig;
      b *= vig;
    }

    d[i] = clamp(r);
    d[i + 1] = clamp(g);
    d[i + 2] = clamp(b);
  }

  applyLocalContrast(d, w, h, edits.clarity);
  return out;
}

/** Luminance-only local contrast (prettier than RGB sharpen) */
function applyLocalContrast(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  clarity: number,
) {
  if (Math.abs(clarity) < 0.8) return;
  const amount = clamp01(Math.abs(clarity) / 100) * Math.sign(clarity) * 0.55;
  const copy = new Uint8ClampedArray(data);

  // 5-tap box blur of luma then unsharp
  const luma = new Float32Array(width * height);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    luma[p] =
      0.2126 * copy[i] + 0.7152 * copy[i + 1] + 0.0722 * copy[i + 2];
  }

  const blur = new Float32Array(luma.length);
  const radius = 2;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      let n = 0;
      for (let ky = -radius; ky <= radius; ky++) {
        const yy = Math.min(height - 1, Math.max(0, y + ky));
        for (let kx = -radius; kx <= radius; kx++) {
          const xx = Math.min(width - 1, Math.max(0, x + kx));
          sum += luma[yy * width + xx];
          n++;
        }
      }
      blur[y * width + x] = sum / n;
    }
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = y * width + x;
      const i = p * 4;
      const detail = luma[p] - blur[p];
      const boost = detail * amount;
      // Protect very bright skin-ish oranges somewhat via low boost on warm hi-luma
      data[i] = clamp(copy[i] + boost);
      data[i + 1] = clamp(copy[i + 1] + boost);
      data[i + 2] = clamp(copy[i + 2] + boost);
    }
  }
}

export function renderEditedImage(
  source: HTMLImageElement | ImageBitmap,
  edits: EditParams,
  maxSide = 1600,
): HTMLCanvasElement {
  const sw = source.width;
  const sh = source.height;
  const scale = Math.min(1, maxSide / Math.max(sw, sh));
  const w = Math.max(1, Math.round(sw * scale));
  const h = Math.max(1, Math.round(sh * scale));

  const base = document.createElement("canvas");
  base.width = w;
  base.height = h;
  const ctx = base.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas not available");
  ctx.drawImage(source as CanvasImageSource, 0, 0, w, h);

  const edited = applyEditsToImageData(ctx.getImageData(0, 0, w, h), edits);
  ctx.putImageData(edited, 0, 0);
  return base;
}
