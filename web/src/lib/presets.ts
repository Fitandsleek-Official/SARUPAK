import { DEFAULT_EFFECTS, type EffectsParams } from "./regionalTypes";
import { DEFAULT_EDITS, EditParams } from "./types";

export interface StylePreset {
  id: string;
  label: string;
  labelKm: string;
  description: string;
  look: Partial<EditParams>;
  effects?: Partial<EffectsParams>;
}

/**
 * Looks inspired by pro portrait / garden / editorial grading.
 * Effects drive regional subject/skin/foliage/flower/background edits.
 */
export const STYLE_PRESETS: StylePreset[] = [
  {
    id: "portrait_pro",
    label: "Portrait Pro",
    labelKm: "រូបមនុស្ស Pro",
    description: "Subject ភ្លឺ — BG soft — skin ស្អាត (ដូចឧទាហរណ៍)",
    look: {
      exposure: 0.06,
      contrast: 12,
      shadows: 24,
      highlights: -22,
      whites: 4,
      blacks: -4,
      temperature: 10,
      tint: 2,
      vibrance: 10,
      saturation: -6,
      clarity: 4,
    },
    effects: {
      subjectLift: 42,
      backgroundDim: 28,
      backgroundBlur: 36,
      foliagePop: 22,
      flowerPop: 10,
      skinGlow: 38,
      rimGlow: 8,
      skyPop: 12,
    },
  },
  {
    id: "garden_bloom",
    label: "Garden Bloom",
    labelKm: "សួនផ្កា",
    description: "ផ្កាពណ៌លេច — ស្លឹករស់ — subject ច្បាស់",
    look: {
      contrast: 14,
      vibrance: 18,
      saturation: 2,
      clarity: 8,
      highlights: -18,
      shadows: 18,
      temperature: 4,
      blacks: -4,
    },
    effects: {
      subjectLift: 34,
      backgroundDim: 18,
      backgroundBlur: 28,
      foliagePop: 48,
      flowerPop: 62,
      skinGlow: 30,
      rimGlow: 6,
    },
  },
  {
    id: "golden_portrait",
    label: "Golden Portrait",
    labelKm: "មាសបញ្ឈរ",
    description: "Golden hour + subject separation",
    look: {
      temperature: 22,
      tint: 6,
      exposure: 0.08,
      contrast: 12,
      highlights: -16,
      shadows: 22,
      vibrance: 14,
      saturation: -4,
      clarity: 6,
    },
    effects: {
      subjectLift: 38,
      backgroundDim: 24,
      backgroundBlur: 32,
      foliagePop: 30,
      flowerPop: 12,
      skinGlow: 36,
      rimGlow: 14,
    },
  },
  {
    id: "editorial_glow",
    label: "Editorial Glow",
    labelKm: "Glow អាជីព",
    description: "Halo / rim light + contrast ស្អាត",
    look: {
      exposure: 0.1,
      contrast: 18,
      highlights: -12,
      shadows: 16,
      whites: 8,
      blacks: -8,
      vibrance: 12,
      saturation: -2,
      clarity: 10,
      temperature: 4,
    },
    effects: {
      subjectLift: 46,
      backgroundDim: 36,
      backgroundBlur: 44,
      foliagePop: 16,
      flowerPop: 8,
      skinGlow: 28,
      rimGlow: 58,
    },
  },
  {
    id: "natural",
    label: "Natural",
    labelKm: "ធម្មជាតិ",
    description: "ស្អាត មានជម្រៅ មិនលើស",
    look: {
      contrast: 14,
      vibrance: 16,
      saturation: 2,
      clarity: 8,
      highlights: -18,
      shadows: 16,
      whites: -4,
      blacks: -6,
      temperature: 3,
    },
    effects: {
      subjectLift: 22,
      backgroundDim: 14,
      backgroundBlur: 18,
      foliagePop: 18,
      flowerPop: 12,
      skinGlow: 18,
      rimGlow: 0,
    },
  },
  {
    id: "vivid",
    label: "Vivid",
    labelKm: "ភ្លឺច្បាស់",
    description: "ពណ៌រស់ — nature / travel",
    look: {
      contrast: 18,
      vibrance: 28,
      saturation: 4,
      clarity: 12,
      highlights: -22,
      shadows: 18,
      whites: -8,
      blacks: -8,
      temperature: 2,
    },
    effects: {
      subjectLift: 20,
      backgroundDim: 12,
      backgroundBlur: 16,
      foliagePop: 40,
      flowerPop: 36,
      skinGlow: 12,
      rimGlow: 0,
    },
  },
  {
    id: "cinematic",
    label: "Cinematic",
    labelKm: "ភាពយន្ត",
    description: "Drama + background dim",
    look: {
      exposure: -0.06,
      contrast: 22,
      highlights: -26,
      shadows: 12,
      blacks: 8,
      whites: -10,
      temperature: -6,
      tint: 5,
      vibrance: 10,
      saturation: -6,
      clarity: 12,
    },
    effects: {
      subjectLift: 18,
      backgroundDim: 22,
      backgroundBlur: 10,
      foliagePop: 10,
      flowerPop: 6,
      skinGlow: 8,
      rimGlow: 0,
      skyPop: 18,
    },
  },
  {
    id: "soft_portrait",
    label: "Soft Portrait",
    labelKm: "សុភាព",
    description: "Skin soft + gentle separation",
    look: {
      exposure: 0.1,
      contrast: 8,
      shadows: 26,
      highlights: -20,
      whites: 6,
      temperature: 12,
      tint: 3,
      vibrance: 8,
      saturation: -8,
      clarity: -4,
    },
    effects: {
      subjectLift: 36,
      backgroundDim: 22,
      backgroundBlur: 34,
      foliagePop: 14,
      flowerPop: 10,
      skinGlow: 44,
      rimGlow: 10,
    },
  },
  {
    id: "moody",
    label: "Moody",
    labelKm: "ងងឹតអារម្មណ៍",
    description: "Dark drama",
    look: {
      exposure: -0.2,
      contrast: 20,
      highlights: -22,
      shadows: -4,
      blacks: -12,
      vibrance: 8,
      clarity: 14,
      saturation: -4,
      temperature: -4,
    },
    effects: {
      subjectLift: 26,
      backgroundDim: 48,
      backgroundBlur: 26,
      foliagePop: 8,
      flowerPop: 4,
      skinGlow: 14,
      rimGlow: 16,
    },
  },
  {
    id: "bright_air",
    label: "Bright & Airy",
    labelKm: "ភ្លឺស្រាល",
    description: "High-key lifestyle",
    look: {
      exposure: 0.26,
      contrast: 4,
      highlights: -10,
      shadows: 30,
      whites: 10,
      blacks: 8,
      vibrance: 12,
      saturation: -4,
      clarity: -2,
      temperature: 8,
    },
    effects: {
      subjectLift: 28,
      backgroundDim: 8,
      backgroundBlur: 22,
      foliagePop: 16,
      flowerPop: 20,
      skinGlow: 26,
      rimGlow: 4,
    },
  },
];

export function getPreset(id: string | null | undefined): StylePreset | null {
  if (!id) return null;
  return STYLE_PRESETS.find((p) => p.id === id) ?? null;
}

export function composeEffects(
  base: Partial<EffectsParams> | undefined,
  sceneBoost: Partial<EffectsParams> = {},
): EffectsParams {
  return {
    subjectLift: clamp(
      (base?.subjectLift ?? 0) + (sceneBoost.subjectLift ?? 0),
      0,
      100,
    ),
    backgroundDim: clamp(
      (base?.backgroundDim ?? 0) + (sceneBoost.backgroundDim ?? 0),
      0,
      100,
    ),
    backgroundBlur: clamp(
      (base?.backgroundBlur ?? 0) + (sceneBoost.backgroundBlur ?? 0),
      0,
      100,
    ),
    foliagePop: clamp(
      (base?.foliagePop ?? 0) + (sceneBoost.foliagePop ?? 0),
      0,
      100,
    ),
    flowerPop: clamp(
      (base?.flowerPop ?? 0) + (sceneBoost.flowerPop ?? 0),
      0,
      100,
    ),
    skinGlow: clamp(
      (base?.skinGlow ?? 0) + (sceneBoost.skinGlow ?? 0),
      0,
      100,
    ),
    rimGlow: clamp((base?.rimGlow ?? 0) + (sceneBoost.rimGlow ?? 0), 0, 100),
    skyPop: clamp((base?.skyPop ?? 0) + (sceneBoost.skyPop ?? 0), 0, 100),
  };
}

export function composeEdits(
  technical: EditParams,
  creative: Partial<EditParams>,
  promptMods: Partial<EditParams> = {},
): EditParams {
  const techW = 0.55;
  const mix = (t: number, c: number | undefined, w = techW) => {
    if (c === undefined) return t;
    return t * w + c * (1 - w);
  };

  const c = creative;
  const out: EditParams = {
    exposure: mix(technical.exposure, c.exposure, 0.7) + (promptMods.exposure ?? 0),
    contrast: mix(technical.contrast, c.contrast, 0.35) + (promptMods.contrast ?? 0),
    highlights:
      mix(technical.highlights, c.highlights, 0.55) + (promptMods.highlights ?? 0),
    shadows: mix(technical.shadows, c.shadows, 0.5) + (promptMods.shadows ?? 0),
    whites: mix(technical.whites, c.whites, 0.45) + (promptMods.whites ?? 0),
    blacks: mix(technical.blacks, c.blacks, 0.35) + (promptMods.blacks ?? 0),
    temperature:
      mix(technical.temperature, c.temperature, 0.6) + (promptMods.temperature ?? 0),
    tint: mix(technical.tint, c.tint, 0.45) + (promptMods.tint ?? 0),
    vibrance: mix(technical.vibrance, c.vibrance, 0.25) + (promptMods.vibrance ?? 0),
    saturation:
      mix(technical.saturation, c.saturation, 0.3) + (promptMods.saturation ?? 0),
    clarity: mix(technical.clarity, c.clarity, 0.35) + (promptMods.clarity ?? 0),
  };

  return sanitizeEdits(out);
}

export function sanitizeEdits(e: EditParams): EditParams {
  return {
    exposure: clamp(e.exposure, -1.6, 1.6),
    contrast: clamp(e.contrast, -60, 60),
    highlights: clamp(e.highlights, -80, 40),
    shadows: clamp(e.shadows, -40, 70),
    whites: clamp(e.whites, -50, 40),
    blacks: clamp(e.blacks, -40, 40),
    temperature: clamp(e.temperature, -50, 50),
    tint: clamp(e.tint, -40, 40),
    vibrance: clamp(e.vibrance, -40, 50),
    saturation: clamp(e.saturation, -40, 30),
    clarity: clamp(e.clarity, -40, 40),
  };
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

void DEFAULT_EFFECTS;
void DEFAULT_EDITS;
