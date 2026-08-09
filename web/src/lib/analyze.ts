import {
  AnalysisResult,
  DEFAULT_EDITS,
  EditParams,
  RegionEdit,
  SceneType,
} from "./types";

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
      .map((v) => Math.round(v).toString(16).padStart(2, "0"))
      .join("")
  );
}

/**
 * Client-side scene + color analysis (MVP).
 * Later: replace/extend with Hugging Face worker segmentation.
 */
export async function analyzeImage(
  source: HTMLImageElement | ImageBitmap,
): Promise<AnalysisResult> {
  const maxSide = 256;
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

  let sumL = 0;
  let sumL2 = 0;
  let warm = 0;
  let cool = 0;
  let green = 0;
  let blue = 0;
  let skin = 0;
  let topBlue = 0;
  let topCount = 0;
  const buckets = new Map<string, number>();
  const n = w * h;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const px = i / 4;
    const y = Math.floor(px / w);
    const { h: hue, s, l } = rgbToHsl(r, g, b);

    sumL += l;
    sumL2 += l * l;

    if (r > b + 8) warm += 1;
    if (b > r + 8) cool += 1;

    if (hue > 70 && hue < 170 && s > 0.15 && l > 0.15 && l < 0.75) green += 1;
    if (hue > 185 && hue < 250 && s > 0.12 && l > 0.35) blue += 1;

    if (
      r > 60 &&
      g > 30 &&
      b > 20 &&
      r > g &&
      g > b &&
      r - g > 15 &&
      r - b > 25 &&
      s > 0.1 &&
      s < 0.65 &&
      l > 0.2 &&
      l < 0.82
    ) {
      skin += 1;
    }

    if (y < h * 0.35) {
      topCount += 1;
      if (hue > 185 && hue < 255 && s > 0.1) topBlue += 1;
    }

    const key = toHex(
      Math.round(r / 32) * 32,
      Math.round(g / 32) * 32,
      Math.round(b / 32) * 32,
    );
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }

  const brightness = sumL / n;
  const variance = sumL2 / n - brightness * brightness;
  const contrastScore = Math.sqrt(Math.max(0, variance));
  const warmth = (warm - cool) / n;
  const greenRatio = green / n;
  const blueRatio = blue / n;
  const skinLikelihood = skin / n;
  const topSkyRatio = topCount ? topBlue / topCount : 0;

  const dominantColors = [...buckets.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([c]) => c);

  let scene: SceneType = "general";
  if (skinLikelihood > 0.08 && greenRatio < 0.35) scene = "portrait";
  else if (topSkyRatio > 0.25 && blueRatio > 0.12) scene = "sky_landscape";
  else if (greenRatio > 0.18) scene = "nature";
  else if (brightness < 0.35 && contrastScore < 0.18) scene = "indoor";

  const issues: string[] = [];
  if (brightness < 0.38) issues.push("underexposed");
  if (brightness > 0.72) issues.push("overexposed");
  if (contrastScore < 0.12) issues.push("flat_midtones");
  if (contrastScore > 0.28) issues.push("harsh_contrast");
  if (warmth < -0.12) issues.push("cool_cast");
  if (warmth > 0.18) issues.push("warm_cast");
  if (scene === "sky_landscape" || topSkyRatio > 0.3)
    issues.push("bright_sky_risk");

  const edits = buildRecipe({
    scene,
    brightness,
    contrastScore,
    warmth,
    greenRatio,
    skinLikelihood,
    issues,
  });

  return {
    scene,
    dominantColors,
    brightness,
    contrastScore,
    warmth,
    greenRatio,
    blueRatio,
    skinLikelihood,
    issues,
    explanation: buildExplanation(scene, issues, edits),
    confidence: clamp(
      0.55 +
        (scene !== "general" ? 0.15 : 0) +
        (issues.length ? 0.1 : 0) +
        (skinLikelihood > 0.05 || greenRatio > 0.15 ? 0.08 : 0),
      0.45,
      0.92,
    ),
    suggestedEdits: edits,
    regionHints: buildRegionHints(scene, edits),
  };
}

function buildRecipe(input: {
  scene: SceneType;
  brightness: number;
  contrastScore: number;
  warmth: number;
  greenRatio: number;
  skinLikelihood: number;
  issues: string[];
}): EditParams {
  const e: EditParams = { ...DEFAULT_EDITS };

  e.exposure = clamp((0.48 - input.brightness) * 1.4, -0.8, 0.9);
  e.shadows =
    input.brightness < 0.45
      ? clamp((0.45 - input.brightness) * 80, 0, 45)
      : 8;
  e.highlights = input.issues.includes("bright_sky_risk")
    ? -28
    : input.brightness > 0.65
      ? -18
      : -8;

  if (input.contrastScore < 0.14) {
    e.contrast = 14;
    e.clarity = 8;
  } else if (input.contrastScore > 0.26) {
    e.contrast = -6;
    e.clarity = -2;
  } else {
    e.contrast = 6;
    e.clarity = 4;
  }

  e.temperature = clamp(-input.warmth * 40, -25, 25);
  if (input.issues.includes("cool_cast")) e.temperature += 10;
  if (input.issues.includes("warm_cast")) e.temperature -= 8;

  switch (input.scene) {
    case "portrait":
      e.vibrance = 8;
      e.saturation = -2;
      e.clarity = Math.min(e.clarity, 5);
      e.shadows = Math.max(e.shadows, 18);
      e.temperature = clamp(e.temperature + 4, -20, 20);
      break;
    case "nature":
      e.vibrance = 14;
      e.saturation = 4;
      e.clarity = 10;
      e.contrast = Math.max(e.contrast, 10);
      break;
    case "sky_landscape":
      e.highlights = Math.min(e.highlights, -30);
      e.vibrance = 12;
      e.contrast = Math.max(e.contrast, 12);
      e.clarity = Math.max(e.clarity, 10);
      break;
    case "indoor":
      e.exposure += 0.15;
      e.shadows += 12;
      e.temperature += 6;
      e.vibrance = 6;
      break;
    default:
      e.vibrance = 10;
  }

  if (input.skinLikelihood > 0.06) {
    e.saturation = Math.min(e.saturation, 2);
    e.vibrance = Math.min(e.vibrance, 12);
  }

  if (input.greenRatio > 0.2) {
    e.vibrance = Math.max(e.vibrance, 12);
  }

  e.whites = input.brightness > 0.6 ? -8 : 4;
  e.blacks = input.contrastScore < 0.14 ? -6 : 0;

  return e;
}

function buildRegionHints(scene: SceneType, edits: EditParams): RegionEdit[] {
  const hints: RegionEdit[] = [
    {
      target: "subject",
      exposure: edits.exposure * 0.3,
      clarity: Math.max(0, edits.clarity),
    },
    {
      target: "background",
      exposure: -0.05,
      contrast: 4,
    },
  ];

  if (scene === "portrait") {
    hints.push({
      target: "skin",
      temperature: 3,
      vibrance: -4,
      clarity: -2,
    });
  }
  if (scene === "sky_landscape" || scene === "nature") {
    hints.push({
      target: "sky",
      exposure: -0.1,
      contrast: 8,
      vibrance: 6,
    });
    hints.push({
      target: "nature",
      vibrance: 8,
      clarity: 6,
    });
  }
  return hints;
}

function buildExplanation(
  scene: SceneType,
  issues: string[],
  edits: EditParams,
): string {
  const sceneLabel: Record<SceneType, string> = {
    portrait: "រូបបញ្ឈរ (portrait)",
    nature: "ធម្មជាតិ / ទេសភាពបៃតង",
    sky_landscape: "ទេសភាពមានមេឃ",
    indoor: "ក្នុងផ្ទះ",
    food: "អាហារ",
    general: "រូបទូទៅ",
  };

  const parts: string[] = [`AI ចាត់ទុកថាជា${sceneLabel[scene]}។`];

  if (issues.includes("underexposed")) {
    parts.push(
      `បង្កើនពន្លឺ (exposure ${edits.exposure >= 0 ? "+" : ""}${edits.exposure.toFixed(2)}) និងលើក shadows។`,
    );
  }
  if (issues.includes("overexposed"))
    parts.push("បន្ថយ highlights ដើម្បីរក្សា detail។");
  if (issues.includes("flat_midtones"))
    parts.push("បង្កើន contrast / clarity បន្តិច។");
  if (issues.includes("cool_cast")) parts.push("កែ temperature ឱ្យកក់ខ្លះ។");
  if (issues.includes("warm_cast")) parts.push("បន្ថយ warmth បន្តិច។");
  if (issues.includes("bright_sky_risk"))
    parts.push("បន្ថយ highlights លើមេឃ។");
  if (scene === "portrait")
    parts.push("ការពារ skin — vibrance ស្រាល មិន saturate ខ្លាំង។");
  if (scene === "nature")
    parts.push("លើកពណ៌បៃតងតាម vibrance ដោយប្រុង។");

  if (parts.length === 1) parts.push("កែសមតុល្យពណ៌ និង tone ឱ្យមើលធម្មជាតិ។");
  return parts.join(" ");
}
