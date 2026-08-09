import { parsePrompt } from "./promptParse";
import { composeEdits, composeEffects, getPreset, STYLE_PRESETS } from "./presets";
import {
  DEFAULT_EFFECTS,
  landscapeEffects,
  type EffectsParams,
  type RegionalRecipe,
} from "./regionalTypes";
import {
  AnalysisResult,
  DEFAULT_EDITS,
  EditParams,
  RegionEdit,
  SceneType,
} from "./types";

export type GenerateMode = "auto" | "guided";

export interface GenerateInput {
  source: HTMLImageElement | ImageBitmap;
  mode: GenerateMode;
  prompt?: string;
  presetId?: string | null;
}

export interface GenerateResult extends AnalysisResult {
  mode: GenerateMode;
  presetId: string | null;
  promptUsed: string;
  styleName: string;
  effects: EffectsParams;
  recipe: RegionalRecipe;
  maskNote: string;
  hasPerson: boolean;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function rgbToHsl(r: number, g: number, b: number) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  switch (max) {
    case r:
      h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
      break;
    case g:
      h = ((b - r) / d + 2) / 6;
      break;
    default:
      h = ((r - g) / d + 4) / 6;
  }
  return { h: h * 360, s, l };
}

function toHex(r: number, g: number, b: number) {
  return (
    "#" +
    [r, g, b]
      .map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, "0"))
      .join("")
  );
}

function percentile(sorted: number[], p: number) {
  if (!sorted.length) return 0;
  const i = (sorted.length - 1) * p;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  if (lo === hi) return sorted[lo];
  return sorted[lo] * (1 - (i - lo)) + sorted[hi] * (i - lo);
}

interface FrameStats {
  brightness: number;
  contrastScore: number;
  warmth: number;
  greenRatio: number;
  blueRatio: number;
  skinLikelihood: number;
  topSkyRatio: number;
  centerBrightness: number;
  edgeBrightness: number;
  meanSaturation: number;
  p5: number;
  p50: number;
  p95: number;
  dominantColors: string[];
  scene: SceneType;
  issues: string[];
  hasPerson: boolean;
}

function readStats(source: HTMLImageElement | ImageBitmap): FrameStats {
  const maxSide = 320;
  const sw = source.width;
  const sh = source.height;
  const scale = Math.min(1, maxSide / Math.max(sw, sh));
  const w = Math.max(1, Math.round(sw * scale));
  const h = Math.max(1, Math.round(sh * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas not available");
  ctx.drawImage(source as CanvasImageSource, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);

  const luminances: number[] = [];
  let sumL = 0;
  let sumL2 = 0;
  let warm = 0;
  let cool = 0;
  let green = 0;
  let blue = 0;
  let skin = 0;
  let topBlue = 0;
  let topCount = 0;
  let centerL = 0;
  let centerN = 0;
  let edgeL = 0;
  let edgeN = 0;
  let satSum = 0;
  const buckets = new Map<string, number>();
  const n = w * h;
  const cx0 = w * 0.3;
  const cx1 = w * 0.7;
  const cy0 = h * 0.25;
  const cy1 = h * 0.75;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const px = i / 4;
    const x = px % w;
    const y = Math.floor(px / w);
    const { h: hue, s, l } = rgbToHsl(r, g, b);

    luminances.push(l);
    sumL += l;
    sumL2 += l * l;
    satSum += s;

    if (r > b + 10) warm += 1;
    if (b > r + 10) cool += 1;

    if (hue > 70 && hue < 170 && s > 0.18 && l > 0.12 && l < 0.78) green += 1;
    if (hue > 185 && hue < 250 && s > 0.14 && l > 0.32) blue += 1;

    // Broader skin detection (Asian + varied tones)
    const skinLike =
      r > 45 &&
      g > 25 &&
      b > 15 &&
      r >= g &&
      g >= b * 0.85 &&
      r - b > 15 &&
      s > 0.08 &&
      s < 0.7 &&
      l > 0.18 &&
      l < 0.88;
    if (skinLike) skin += 1;

    if (y < h * 0.33) {
      topCount += 1;
      if (hue > 185 && hue < 255 && s > 0.08 && l > 0.28) topBlue += 1;
    }

    if (x >= cx0 && x <= cx1 && y >= cy0 && y <= cy1) {
      centerL += l;
      centerN += 1;
    } else {
      edgeL += l;
      edgeN += 1;
    }

    const key = toHex(
      Math.round(r / 36) * 36,
      Math.round(g / 36) * 36,
      Math.round(b / 36) * 36,
    );
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }

  luminances.sort((a, b) => a - b);
  const brightness = sumL / n;
  const variance = sumL2 / n - brightness * brightness;
  const contrastScore = Math.sqrt(Math.max(0, variance));
  const warmth = (warm - cool) / n;
  const greenRatio = green / n;
  const blueRatio = blue / n;
  const skinLikelihood = skin / n;
  const topSkyRatio = topCount ? topBlue / topCount : 0;
  const centerBrightness = centerN ? centerL / centerN : brightness;
  const edgeBrightness = edgeN ? edgeL / edgeN : brightness;
  const meanSaturation = satSum / n;
  const p5 = percentile(luminances, 0.05);
  const p50 = percentile(luminances, 0.5);
  const p95 = percentile(luminances, 0.95);

  const dominantColors = [...buckets.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([c]) => c);

  let scene: SceneType = "general";
  // Person only when skin is clearly present — avoid temples/stone false positives
  const hasPerson =
    skinLikelihood > 0.07 ||
    (skinLikelihood > 0.045 && centerBrightness >= edgeBrightness - 0.02);

  if (hasPerson && skinLikelihood > 0.05) {
    scene = "portrait";
  } else if (topSkyRatio > 0.18 || (blueRatio > 0.08 && topSkyRatio > 0.12)) {
    scene = "sky_landscape";
  } else if (greenRatio > 0.16) {
    scene = "nature";
  } else if (brightness < 0.36 && meanSaturation < 0.22) {
    scene = "indoor";
  } else if (
    meanSaturation > 0.28 &&
    warmth > 0.05 &&
    skinLikelihood < 0.04 &&
    greenRatio < 0.12
  ) {
    scene = "food";
  }

  const issues: string[] = [];
  if (p50 < 0.36 || brightness < 0.4) issues.push("underexposed");
  if (p95 > 0.92 || brightness > 0.74) issues.push("overexposed");
  if (contrastScore < 0.11 || p95 - p5 < 0.35) issues.push("flat_midtones");
  if (contrastScore > 0.27 || p95 - p5 > 0.78) issues.push("harsh_contrast");
  if (warmth < -0.1) issues.push("cool_cast");
  if (warmth > 0.16) issues.push("warm_cast");
  if (topSkyRatio > 0.28 || (scene === "sky_landscape" && p95 > 0.85))
    issues.push("bright_sky_risk");
  if (hasPerson && centerBrightness + 0.04 < edgeBrightness)
    issues.push("subject_dark");
  if (meanSaturation < 0.12) issues.push("muted_colors");
  if (meanSaturation > 0.45) issues.push("oversaturated");
  if (!hasPerson) issues.push("no_person");

  return {
    brightness,
    contrastScore,
    warmth,
    greenRatio,
    blueRatio,
    skinLikelihood,
    topSkyRatio,
    centerBrightness,
    edgeBrightness,
    meanSaturation,
    p5,
    p50,
    p95,
    dominantColors,
    scene,
    issues,
    hasPerson,
  };
}

/** Gentle technical fix only — creative look comes from preset blend. */
function buildCorrection(stats: FrameStats): EditParams {
  const e: EditParams = { ...DEFAULT_EDITS };

  const targetMid = stats.scene === "portrait" ? 0.5 : 0.46;
  e.exposure = clamp((targetMid - stats.p50) * 1.55, -0.7, 0.85);

  e.shadows = clamp((0.18 - stats.p5) * 110, -8, 42);
  e.highlights = clamp((0.9 - stats.p95) * 100, -42, 10);

  if (stats.issues.includes("subject_dark")) {
    e.exposure += 0.1;
    e.shadows += 12;
  }
  if (stats.issues.includes("bright_sky_risk")) {
    e.highlights = Math.min(e.highlights, -28);
    e.whites = -10;
  }

  const range = stats.p95 - stats.p5;
  if (range < 0.38) {
    e.contrast = 12;
    e.clarity = 8;
    e.blacks = -6;
  } else if (range > 0.78) {
    e.contrast = -4;
    e.highlights -= 6;
    e.clarity = 3;
  } else {
    e.contrast = 6;
    e.clarity = 5;
  }

  // Neutralize cast, then slight warm preference for skin
  e.temperature = clamp(-stats.warmth * 42, -24, 24);
  if (stats.issues.includes("cool_cast")) e.temperature += 10;
  if (stats.issues.includes("warm_cast")) e.temperature -= 8;
  if (stats.scene === "portrait") e.temperature += 4;

  if (stats.issues.includes("muted_colors")) {
    e.vibrance = 14;
  } else if (stats.issues.includes("oversaturated")) {
    e.vibrance = -4;
    e.saturation = -6;
  } else {
    e.vibrance = 6;
  }

  switch (stats.scene) {
    case "portrait":
      e.shadows = Math.max(e.shadows, 16);
      e.highlights = Math.min(e.highlights, -14);
      e.saturation = -4;
      e.clarity = Math.min(e.clarity, 3);
      e.tint = 2;
      break;
    case "nature":
      e.vibrance = Math.max(e.vibrance, 12);
      e.clarity = Math.max(e.clarity, 8);
      e.highlights = Math.min(e.highlights, -12);
      break;
    case "sky_landscape":
      e.highlights = Math.min(e.highlights, -30);
      e.whites = -10;
      e.shadows = Math.max(e.shadows, 12);
      e.vibrance = Math.max(e.vibrance, 10);
      break;
    case "indoor":
      e.exposure += 0.12;
      e.shadows += 10;
      e.temperature += 6;
      break;
    case "food":
      e.vibrance = Math.max(e.vibrance, 12);
      e.clarity = Math.max(e.clarity, 8);
      e.temperature += 3;
      break;
    default:
      break;
  }

  if (stats.skinLikelihood > 0.05) {
    e.saturation = Math.min(e.saturation, -2);
    e.clarity = Math.min(e.clarity, 4);
  }

  return e;
}

function pickAutoStyle(stats: FrameStats): string {
  if (!stats.hasPerson) {
    if (stats.scene === "sky_landscape" || stats.topSkyRatio > 0.15)
      return "cinematic";
    if (stats.greenRatio > 0.16)
      return stats.meanSaturation > 0.22 ? "garden_bloom" : "vivid";
    if (stats.issues.includes("underexposed")) return "bright_air";
    return "natural";
  }
  if (stats.scene === "portrait") {
    if (stats.greenRatio > 0.12) return "golden_portrait";
    return "portrait_pro";
  }
  if (stats.scene === "nature" || stats.greenRatio > 0.2) {
    return stats.meanSaturation > 0.22 ? "garden_bloom" : "vivid";
  }
  if (stats.scene === "sky_landscape") return "cinematic";
  if (stats.scene === "indoor") return "soft_portrait";
  if (stats.scene === "food") return "vivid";
  if (stats.issues.includes("underexposed") && stats.contrastScore < 0.14)
    return "bright_air";
  if (stats.issues.includes("harsh_contrast")) return "natural";
  return "portrait_pro";
}

const PERSON_PRESETS = new Set([
  "portrait_pro",
  "golden_portrait",
  "soft_portrait",
  "editorial_glow",
]);

function coercePresetForScene(
  presetId: string | null,
  hasPerson: boolean,
): string {
  const id = presetId || (hasPerson ? "portrait_pro" : "natural");
  if (!hasPerson && PERSON_PRESETS.has(id)) {
    return id === "editorial_glow" || id === "golden_portrait"
      ? "cinematic"
      : "natural";
  }
  return id;
}

function sceneEffectBoost(stats: FrameStats): Partial<EffectsParams> {
  const boost: Partial<EffectsParams> = {};
  if (!stats.hasPerson) {
    if (stats.greenRatio > 0.12) boost.foliagePop = 14;
    if (stats.topSkyRatio > 0.12 || stats.scene === "sky_landscape")
      boost.skyPop = 16;
    return boost;
  }
  if (stats.skinLikelihood > 0.05) {
    boost.skinGlow = 8;
    boost.subjectLift = 6;
  }
  if (stats.greenRatio > 0.14) boost.foliagePop = 10;
  if (stats.issues.includes("subject_dark")) {
    boost.subjectLift = (boost.subjectLift ?? 0) + 12;
    boost.backgroundDim = 8;
  }
  return boost;
}

function buildRegionHints(scene: SceneType, edits: EditParams): RegionEdit[] {
  const hints: RegionEdit[] = [
    {
      target: "subject",
      exposure: Math.max(0.05, edits.exposure * 0.35),
      clarity: Math.max(0, edits.clarity * 0.5),
    },
    {
      target: "background",
      exposure: -0.08,
      contrast: 6,
      vibrance: -2,
    },
  ];
  if (scene === "portrait") {
    hints.push({
      target: "skin",
      temperature: 4,
      vibrance: -6,
      clarity: -4,
    });
  }
  if (scene === "sky_landscape" || scene === "nature" || scene === "portrait") {
    hints.push({
      target: "nature",
      vibrance: 10,
      clarity: 8,
    });
  }
  if (scene === "sky_landscape" || scene === "nature") {
    hints.push({
      target: "sky",
      exposure: -0.12,
      contrast: 10,
      vibrance: 8,
    });
  }
  return hints;
}

function explain(result: {
  scene: SceneType;
  issues: string[];
  styleName: string;
  mode: GenerateMode;
  promptNotes: string[];
  edits: EditParams;
}): string {
  const sceneLabel: Record<SceneType, string> = {
    portrait: "រូបមនុស្ស",
    nature: "ធម្មជាតិ",
    sky_landscape: "ទេសភាព/មេឃ",
    indoor: "ក្នុងផ្ទះ",
    food: "អាហារ",
    general: "រូបទូទៅ",
  };

  const parts: string[] = [];
  if (result.mode === "auto") {
    parts.push(
      `Generate Auto: រកឃើញ${sceneLabel[result.scene]} → រចនា «${result.styleName}»។`,
    );
  } else {
    parts.push(
      `Generate: ${sceneLabel[result.scene]} + «${result.styleName}»។`,
    );
  }

  if (result.issues.includes("underexposed"))
    parts.push(`លើកពន្លឺ (exposure ${result.edits.exposure >= 0 ? "+" : ""}${result.edits.exposure.toFixed(2)})។`);
  if (result.issues.includes("subject_dark"))
    parts.push("Subject ងងឹតជាងផ្ទៃក្រោយ — លើក shadows។");
  if (result.issues.includes("bright_sky_risk"))
    parts.push("បន្ថយ highlights រក្សា detail មេឃ។");
  if (result.issues.includes("flat_midtones"))
    parts.push("បង្កើន contrast/clarity ឱ្យមានជម្រៅ។");
  if (result.issues.includes("muted_colors"))
    parts.push("លើក vibrance ឱ្យពណ៌រស់។");
  if (result.scene === "portrait")
    parts.push("ការពារ skin — sat ស្រាល clarity មិនខ្លាំង។");
  if (result.issues.includes("no_person")) {
    parts.push(
      "រកមិនឃើញមនុស្ស → កែបែបទេសភាព (មេឃ/ធម្មជាតិ) — ឥត subject glow។",
    );
  } else {
    parts.push("កែតាមតំបន់: subject / skin / foliage / flower / sky។");
  }
  if (result.promptNotes.length)
    parts.push(`Prompt: ${result.promptNotes.slice(0, 3).join(", ")}។`);

  return parts.join(" ");
}

/**
 * Main entry: analyze image + optional prompt/preset → edit recipe.
 */
export async function generateGrade(
  input: GenerateInput,
): Promise<GenerateResult> {
  const stats = readStats(input.source);
  const technical = buildCorrection(stats);
  const intent = parsePrompt(input.prompt ?? "");
  const hasPerson = stats.hasPerson;

  let presetId: string | null = null;
  if (input.mode === "auto") {
    presetId = pickAutoStyle(stats);
  } else {
    presetId = coercePresetForScene(
      input.presetId || intent.lookId || pickAutoStyle(stats),
      hasPerson,
    );
  }
  presetId = coercePresetForScene(presetId, hasPerson);

  const preset = getPreset(presetId);
  const styleName = preset ? `${preset.label} · ${preset.labelKm}` : "Custom";

  const suggestedEdits = composeEdits(
    technical,
    preset?.look ?? {},
    input.mode === "guided" ? intent.modifiers : {},
  );

  let effects = composeEffects(
    preset?.effects ?? DEFAULT_EFFECTS,
    sceneEffectBoost(stats),
  );

  const p = (input.prompt ?? "").toLowerCase();
  if (hasPerson) {
    if (/glow|halo|editorial|ភ្លឺក្រោយ/.test(p))
      effects.rimGlow = Math.max(effects.rimGlow, 50);
    if (/blur|bokeh|dof|ផ្ទៃក្រោយស្រអាប់/.test(p))
      effects.backgroundBlur = Math.max(effects.backgroundBlur, 45);
  }
  if (/flower|ផ្កា|bloom/.test(p))
    effects.flowerPop = Math.max(effects.flowerPop, 55);
  if (/green|nature|ស្លឹក|ធម្មជាតិ/.test(p))
    effects.foliagePop = Math.max(effects.foliagePop, 40);
  if (/sky|មេឃ/.test(p)) effects.skyPop = Math.max(effects.skyPop, 28);

  const mode = hasPerson ? "person" : "landscape";
  if (!hasPerson) {
    effects = landscapeEffects(effects);
  }

  const recipe: RegionalRecipe = {
    global: suggestedEdits,
    effects,
    mode,
  };

  const confidence = clamp(
    0.72 +
      (stats.scene !== "general" ? 0.12 : 0) +
      (hasPerson ? 0.08 : 0.1) +
      (preset ? 0.06 : 0),
    0.65,
    0.97,
  );

  const explanation = explain({
    scene: stats.scene,
    issues: stats.issues,
    styleName,
    mode: input.mode,
    promptNotes: intent.notes,
    edits: suggestedEdits,
  });

  return {
    mode: input.mode,
    presetId,
    promptUsed: input.prompt?.trim() ?? "",
    styleName,
    effects,
    recipe,
    hasPerson,
    maskNote: hasPerson
      ? "រកឃើញមនុស្ស → កែ subject / skin / BG"
      : "គ្មានមនុស្ស → កែទេសភាព (sky / nature) តែប៉ុណ្ណោះ",
    scene: stats.scene,
    dominantColors: stats.dominantColors,
    brightness: stats.brightness,
    contrastScore: stats.contrastScore,
    warmth: stats.warmth,
    greenRatio: stats.greenRatio,
    blueRatio: stats.blueRatio,
    skinLikelihood: stats.skinLikelihood,
    issues: stats.issues,
    explanation,
    confidence,
    suggestedEdits,
    regionHints: buildRegionHints(stats.scene, suggestedEdits),
  };
}

export { STYLE_PRESETS };
