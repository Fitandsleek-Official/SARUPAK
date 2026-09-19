export interface DiarizationSegment {
  startMs: number;
  endMs: number;
  speakerId: string;
}

export interface DiarizationResult {
  provider: string;
  available: boolean;
  isMock: boolean;
  speakers: Array<{ speakerId: string; displayName: string }>;
  segments: DiarizationSegment[];
  warning?: string;
}

export interface DiarizationInput {
  audioPath: string;
  /** Optional subtitle cue windows to map speakers onto. */
  cues?: Array<{ id: string; startMs: number; endMs: number }>;
}

export interface DiarizationProvider {
  readonly name: string;
  isAvailable(): Promise<boolean>;
  diarize(input: DiarizationInput): Promise<DiarizationResult>;
}
