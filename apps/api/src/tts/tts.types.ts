export type TTSProviderState =
  | "configured"
  | "not_configured"
  | "unsupported_language"
  | "provider_error"
  | "mock_mode"
  | "unavailable";

export interface TTSVoiceInfo {
  id: string;
  name: string;
  genderLabel?: string;
  languages: string[];
}

export interface TTSCapabilities {
  provider: string;
  available: boolean;
  /** High-level UI/API state for this provider. */
  state: TTSProviderState;
  languages: string[];
  voices: string[];
  voiceDetails: TTSVoiceInfo[];
  outputFormats: Array<"wav" | "mp3">;
  isMock: boolean;
  maxChars: number;
  notes: string[];
  /** Never includes secrets — only whether a key is present. */
  apiKeyConfigured?: boolean;
}

export interface TTSInput {
  text: string;
  language: string;
  voiceId: string;
  speakingRate: number;
  pitch: number;
  outputFormat: "wav" | "mp3";
  outputPath: string;
  /** Optional local path to ≤12s reference wav (SOTAKA clone). */
  referenceAudioPath?: string;
  referenceText?: string;
  /** Optional voice-design instruct string (SOTAKA). */
  instruct?: string;
}

export interface TTSResult {
  provider: string;
  outputPath: string;
  durationMs: number;
  sampleRate: number | null;
  channels: number | null;
  codec: string | null;
  isMock: boolean;
  warnings: string[];
}

export interface TTSProvider {
  readonly name: string;
  getCapabilities(language?: string): Promise<TTSCapabilities>;
  isAvailable(): Promise<boolean>;
  synthesize(input: TTSInput): Promise<TTSResult>;
}

export interface TTSSynthesizeOptions {
  /** Required — never inferred as mock silently. */
  provider: string;
}
