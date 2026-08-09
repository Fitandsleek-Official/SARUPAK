import { EditParams } from "./types";

export type MaskQuality = "ml" | "heuristic";

export interface EffectsParams {
  /** Brighten / pop the person */
  subjectLift: number;
  /** Darken background slightly for separation */
  backgroundDim: number;
  /** Extra background blur (DOF boost) 0–100 */
  backgroundBlur: number;
  /** Boost greens / leaves */
  foliagePop: number;
  /** Boost pink / flower hues */
  flowerPop: number;
  /** Soft warm lift on skin */
  skinGlow: number;
  /** Soft halo / rim light behind subject (editorial) */
  rimGlow: number;
  /** Boost sky blues separately from other BG */
  skyPop: number;
}

export interface RegionalRecipe {
  global: EditParams;
  effects: EffectsParams;
  /** person = subject/skin effects; landscape = sky/nature only */
  mode: "person" | "landscape";
}

export const DEFAULT_EFFECTS: EffectsParams = {
  subjectLift: 0,
  backgroundDim: 0,
  backgroundBlur: 0,
  foliagePop: 0,
  flowerPop: 0,
  skinGlow: 0,
  rimGlow: 0,
  skyPop: 0,
};

export function scaleEffects(
  base: EffectsParams,
  strength: number,
): EffectsParams {
  const s = Math.max(0, Math.min(1, strength / 100));
  return {
    subjectLift: base.subjectLift * s,
    backgroundDim: base.backgroundDim * s,
    backgroundBlur: base.backgroundBlur * s,
    foliagePop: base.foliagePop * s,
    flowerPop: base.flowerPop * s,
    skinGlow: base.skinGlow * s,
    rimGlow: base.rimGlow * s,
    skyPop: base.skyPop * s,
  };
}

export interface ImageMasks {
  width: number;
  height: number;
  /** 0–1 soft alpha */
  subject: Float32Array;
  background: Float32Array;
  skin: Float32Array;
  foliage: Float32Array;
  flower: Float32Array;
  sky: Float32Array;
  quality: MaskQuality;
}

export function scaleRecipe(
  recipe: RegionalRecipe,
  strength: number,
): RegionalRecipe {
  const s = Math.max(0, Math.min(1, strength / 100));
  const g = recipe.global;
  return {
    mode: recipe.mode,
    global: {
      exposure: g.exposure * s,
      contrast: g.contrast * s,
      highlights: g.highlights * s,
      shadows: g.shadows * s,
      whites: g.whites * s,
      blacks: g.blacks * s,
      temperature: g.temperature * s,
      tint: g.tint * s,
      vibrance: g.vibrance * s,
      saturation: g.saturation * s,
      clarity: g.clarity * s,
    },
    effects: scaleEffects(recipe.effects, strength),
  };
}

/** Strip all person-only effects for landscape photos */
export function landscapeEffects(base: EffectsParams): EffectsParams {
  return {
    subjectLift: 0,
    backgroundDim: 0,
    backgroundBlur: 0,
    skinGlow: 0,
    rimGlow: 0,
    foliagePop: Math.max(base.foliagePop, 18),
    flowerPop: base.flowerPop,
    skyPop: Math.max(base.skyPop, 22),
  };
}
