export interface SeparationStem {
  kind: "dialogue" | "music" | "sfx" | "ambient" | "full";
  path?: string;
  available: boolean;
  note?: string;
}

export interface SeparationResult {
  provider: string;
  available: boolean;
  stems: SeparationStem[];
  warning?: string;
}

export interface SeparationInput {
  audioPath: string;
  workDir: string;
}

export interface AudioSeparationProvider {
  readonly name: string;
  isAvailable(): Promise<boolean>;
  separate(input: SeparationInput): Promise<SeparationResult>;
}
