export type SceneType =
  | "portrait"
  | "nature"
  | "sky_landscape"
  | "indoor"
  | "food"
  | "general";

export type RegionHint = "subject" | "skin" | "sky" | "nature" | "background";

export interface EditParams {
  exposure: number;
  contrast: number;
  highlights: number;
  shadows: number;
  whites: number;
  blacks: number;
  temperature: number;
  tint: number;
  vibrance: number;
  saturation: number;
  clarity: number;
}

export interface RegionEdit {
  target: RegionHint;
  exposure?: number;
  contrast?: number;
  temperature?: number;
  vibrance?: number;
  clarity?: number;
}

export interface AnalysisResult {
  scene: SceneType;
  dominantColors: string[];
  brightness: number;
  contrastScore: number;
  warmth: number;
  greenRatio: number;
  blueRatio: number;
  skinLikelihood: number;
  issues: string[];
  explanation: string;
  confidence: number;
  suggestedEdits: EditParams;
  regionHints: RegionEdit[];
}

export const DEFAULT_EDITS: EditParams = {
  exposure: 0,
  contrast: 0,
  highlights: 0,
  shadows: 0,
  whites: 0,
  blacks: 0,
  temperature: 0,
  tint: 0,
  vibrance: 0,
  saturation: 0,
  clarity: 0,
};

export function scaleEdits(base: EditParams, strength: number): EditParams {
  const s = Math.max(0, Math.min(1, strength / 100));
  return {
    exposure: base.exposure * s,
    contrast: base.contrast * s,
    highlights: base.highlights * s,
    shadows: base.shadows * s,
    whites: base.whites * s,
    blacks: base.blacks * s,
    temperature: base.temperature * s,
    tint: base.tint * s,
    vibrance: base.vibrance * s,
    saturation: base.saturation * s,
    clarity: base.clarity * s,
  };
}
