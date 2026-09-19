import { createWriteStream } from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";
import type { SubtitleSegment, SubtitleStyle } from "@sarupak/subtitle-utils";

/**
 * Lightweight PNG cue renderer (ASCII + basic Latin).
 * For Khmer / complex scripts, prefer a font-capable renderer later.
 * Used for burn-in overlays when FFmpeg lacks libass.
 */
export async function renderCueOverlayPng(input: {
  text: string;
  width: number;
  style: SubtitleStyle;
  outPath: string;
}): Promise<{ path: string; height: number }> {
  const fontSize = Math.max(18, Math.min(72, input.style.fontSize));
  const paddingX = 24;
  const paddingY = 14;
  const lineHeight = Math.round(fontSize * 1.25);
  const maxTextWidth = Math.max(120, input.width - paddingX * 2);
  const lines = wrapText(input.text || "…", Math.floor(maxTextWidth / (fontSize * 0.55)));
  const boxW = Math.min(
    input.width - 40,
    Math.max(
      80,
      Math.min(maxTextWidth, longestLine(lines) * fontSize * 0.55) + paddingX * 2,
    ),
  );
  const boxH = lines.length * lineHeight + paddingY * 2;

  const png = new PNG({ width: Math.round(boxW), height: Math.round(boxH) });
  const bg = parseRgba(input.style.backgroundColor, { r: 0, g: 0, b: 0, a: 140 });
  const fg = parseRgba(input.style.fontColor, { r: 255, g: 255, b: 255, a: 255 });

  // fill background
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const idx = (png.width * y + x) << 2;
      png.data[idx] = bg.r;
      png.data[idx + 1] = bg.g;
      png.data[idx + 2] = bg.b;
      png.data[idx + 3] = bg.a;
    }
  }

  // Draw approximate glyphs as blocks (readable for Latin digits/letters; Khmer shows as boxes)
  lines.forEach((line, li) => {
    const y0 = paddingY + li * lineHeight;
    drawString(png, line, paddingX, y0, fontSize, fg, Boolean(input.style.bold));
  });

  await fs.mkdir(path.dirname(input.outPath), { recursive: true });
  await new Promise<void>((resolve, reject) => {
    png
      .pack()
      .pipe(createWriteStream(input.outPath))
      .on("finish", () => resolve())
      .on("error", reject);
  });

  return { path: input.outPath, height: png.height };
}

export async function renderSegmentOverlays(input: {
  segments: SubtitleSegment[];
  width: number;
  style: SubtitleStyle;
  workDir: string;
}): Promise<Array<{ path: string; startSec: number; endSec: number }>> {
  const out: Array<{ path: string; startSec: number; endSec: number }> = [];
  for (const [i, seg] of input.segments.entries()) {
    if (seg.endMs <= seg.startMs) continue;
    const file = path.join(input.workDir, `cue_${i}.png`);
    await renderCueOverlayPng({
      text: seg.text,
      width: input.width,
      style: input.style,
      outPath: file,
    });
    out.push({
      path: file,
      startSec: seg.startMs / 1000,
      endSec: seg.endMs / 1000,
    });
  }
  return out;
}

function wrapText(text: string, maxChars: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return ["…"];
  const lines: string[] = [];
  let current = "";
  for (const w of words) {
    const next = current ? `${current} ${w}` : w;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = w;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, 4);
}

function longestLine(lines: string[]): number {
  return lines.reduce((m, l) => Math.max(m, l.length), 0);
}

function parseRgba(
  value: string,
  fallback: { r: number; g: number; b: number; a: number },
) {
  const hex = value.trim();
  if (hex.startsWith("#") && (hex.length === 7 || hex.length === 4)) {
    const full =
      hex.length === 4
        ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`
        : hex;
    return {
      r: parseInt(full.slice(1, 3), 16),
      g: parseInt(full.slice(3, 5), 16),
      b: parseInt(full.slice(5, 7), 16),
      a: 255,
    };
  }
  const m = hex.match(
    /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([0-9.]+))?\s*\)/i,
  );
  if (m) {
    return {
      r: Number(m[1]),
      g: Number(m[2]),
      b: Number(m[3]),
      a: m[4] != null ? Math.round(Number(m[4]) * 255) : 255,
    };
  }
  return fallback;
}

/** Very small 5x7-style bitmap for A-Z, a-z, 0-9 and punctuation. */
function drawString(
  png: PNG,
  text: string,
  x: number,
  y: number,
  size: number,
  color: { r: number; g: number; b: number; a: number },
  bold: boolean,
) {
  const scale = Math.max(1, Math.round(size / 10));
  let cursor = x;
  for (const ch of text) {
    const glyph = GLYPHS[ch] ?? GLYPHS["?"]!;
    for (let row = 0; row < 7; row++) {
      for (let col = 0; col < 5; col++) {
        if (((glyph[row]! >> (4 - col)) & 1) === 0) continue;
        for (let dy = 0; dy < scale; dy++) {
          for (let dx = 0; dx < scale + (bold ? 1 : 0); dx++) {
            const px = cursor + col * scale + dx;
            const py = y + row * scale + dy;
            if (px < 0 || py < 0 || px >= png.width || py >= png.height) continue;
            const idx = (png.width * py + px) << 2;
            png.data[idx] = color.r;
            png.data[idx + 1] = color.g;
            png.data[idx + 2] = color.b;
            png.data[idx + 3] = color.a;
          }
        }
      }
    }
    cursor += 6 * scale;
  }
}

// Each glyph: 7 rows of 5-bit patterns
const GLYPHS: Record<string, number[]> = {
  " ": [0, 0, 0, 0, 0, 0, 0],
  "?": [0x0e, 0x11, 0x01, 0x02, 0x04, 0x00, 0x04],
  ".": [0, 0, 0, 0, 0, 0x04, 0x04],
  ",": [0, 0, 0, 0, 0x04, 0x04, 0x08],
  "!": [0x04, 0x04, 0x04, 0x04, 0, 0, 0x04],
  "-": [0, 0, 0, 0x1f, 0, 0, 0],
  ":": [0, 0x04, 0, 0, 0x04, 0, 0],
  "'": [0x04, 0x04, 0, 0, 0, 0, 0],
  "0": [0x0e, 0x11, 0x13, 0x15, 0x19, 0x11, 0x0e],
  "1": [0x04, 0x0c, 0x04, 0x04, 0x04, 0x04, 0x0e],
  "2": [0x0e, 0x11, 0x01, 0x06, 0x08, 0x10, 0x1f],
  "3": [0x1f, 0x02, 0x04, 0x02, 0x01, 0x11, 0x0e],
  "4": [0x02, 0x06, 0x0a, 0x12, 0x1f, 0x02, 0x02],
  "5": [0x1f, 0x10, 0x1e, 0x01, 0x01, 0x11, 0x0e],
  "6": [0x06, 0x08, 0x10, 0x1e, 0x11, 0x11, 0x0e],
  "7": [0x1f, 0x01, 0x02, 0x04, 0x08, 0x08, 0x08],
  "8": [0x0e, 0x11, 0x11, 0x0e, 0x11, 0x11, 0x0e],
  "9": [0x0e, 0x11, 0x11, 0x0f, 0x01, 0x02, 0x0c],
  A: [0x0e, 0x11, 0x11, 0x1f, 0x11, 0x11, 0x11],
  B: [0x1e, 0x11, 0x11, 0x1e, 0x11, 0x11, 0x1e],
  C: [0x0e, 0x11, 0x10, 0x10, 0x10, 0x11, 0x0e],
  D: [0x1e, 0x11, 0x11, 0x11, 0x11, 0x11, 0x1e],
  E: [0x1f, 0x10, 0x10, 0x1e, 0x10, 0x10, 0x1f],
  F: [0x1f, 0x10, 0x10, 0x1e, 0x10, 0x10, 0x10],
  G: [0x0e, 0x11, 0x10, 0x17, 0x11, 0x11, 0x0f],
  H: [0x11, 0x11, 0x11, 0x1f, 0x11, 0x11, 0x11],
  I: [0x0e, 0x04, 0x04, 0x04, 0x04, 0x04, 0x0e],
  J: [0x01, 0x01, 0x01, 0x01, 0x11, 0x11, 0x0e],
  K: [0x11, 0x12, 0x14, 0x18, 0x14, 0x12, 0x11],
  L: [0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x1f],
  M: [0x11, 0x1b, 0x15, 0x15, 0x11, 0x11, 0x11],
  N: [0x11, 0x19, 0x15, 0x13, 0x11, 0x11, 0x11],
  O: [0x0e, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0e],
  P: [0x1e, 0x11, 0x11, 0x1e, 0x10, 0x10, 0x10],
  Q: [0x0e, 0x11, 0x11, 0x11, 0x15, 0x12, 0x0d],
  R: [0x1e, 0x11, 0x11, 0x1e, 0x14, 0x12, 0x11],
  S: [0x0f, 0x10, 0x10, 0x0e, 0x01, 0x01, 0x1e],
  T: [0x1f, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04],
  U: [0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0e],
  V: [0x11, 0x11, 0x11, 0x11, 0x11, 0x0a, 0x04],
  W: [0x11, 0x11, 0x11, 0x15, 0x15, 0x1b, 0x11],
  X: [0x11, 0x11, 0x0a, 0x04, 0x0a, 0x11, 0x11],
  Y: [0x11, 0x11, 0x0a, 0x04, 0x04, 0x04, 0x04],
  Z: [0x1f, 0x01, 0x02, 0x04, 0x08, 0x10, 0x1f],
};
for (const [k, v] of Object.entries(GLYPHS)) {
  if (/^[A-Z]$/.test(k)) GLYPHS[k.toLowerCase()] = v;
}
