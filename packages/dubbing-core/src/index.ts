/** Phase 4 dubbing domain — versioned schemas and pure validation. */

export const DUBBING_SCHEMA_VERSION = 1 as const;

export type DubbingSessionStatus =
  | "draft"
  | "extracting"
  | "separating"
  | "ready"
  | "generating"
  | "mixing"
  | "exporting"
  | "failed"
  | "completed";

export type DialogueSegmentStatus =
  | "pending"
  | "assigned"
  | "generating"
  | "ready"
  | "failed"
  | "warning";

export type MixMode =
  | "replace_dialogue"
  | "mix"
  | "dialogue_only"
  | "original_only";

export type StemKind = "dialogue" | "music" | "sfx" | "ambient" | "full";

export type ProviderKind = "mock" | "openai-tts" | "passthrough" | "demucs" | "manual" | "unavailable";

export interface VoiceCharacter {
  id: string;
  name: string;
  genderLabel?: string;
  language: string;
  provider: ProviderKind | string;
  providerVoiceId: string;
  style: string;
  pitch: number;
  speakingRate: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface VoiceAssignment {
  speakerId: string;
  voiceCharacterId: string;
}

export interface DialogueSegment {
  id: string;
  sourceSubtitleCueId?: string;
  sourceText: string;
  translatedText: string;
  startMs: number;
  endMs: number;
  speakerId?: string;
  voiceCharacterId?: string;
  generatedAudioMediaId?: string;
  audioDurationMs?: number;
  speakingRateApplied?: number;
  status: DialogueSegmentStatus;
  errorMessage?: string;
  warnings: string[];
}

export interface DubbingSpeaker {
  speakerId: string;
  displayName: string;
  voiceCharacterId?: string;
}

export interface AudioStemRef {
  kind: StemKind;
  mediaAssetId?: string;
  /** Relative note only — never expose absolute paths to clients. */
  available: boolean;
  note?: string;
}

export interface DubbingTrack {
  id: string;
  kind: "original" | "background" | "dialogue" | "music_sfx";
  mediaAssetId?: string;
  volume: number;
}

export interface AudioSeparationJobMeta {
  provider: string;
  available: boolean;
  stems: AudioStemRef[];
  warning?: string;
}

export interface TTSJobMeta {
  provider: string;
  segmentId: string;
  mediaAssetId?: string;
  durationMs?: number;
}

export interface DubbingMix {
  mode: MixMode;
  dialogueVolume: number;
  backgroundVolume: number;
  mixedAudioMediaId?: string;
  videoMediaId?: string;
  warnings: string[];
}

export interface DubbingExport {
  jobId: string;
  status: string;
  outputMediaKey?: string;
}

export interface DubbingProject {
  schemaVersion: typeof DUBBING_SCHEMA_VERSION;
  id: string;
  projectId: string;
  mediaAssetId: string;
  subtitleSetId?: string;
  sourceLanguage: string;
  targetLanguage: string;
  status: DubbingSessionStatus;
  mixMode: MixMode;
  /** Explicit TTS provider for this session: openai-tts | mock | unset */
  ttsProvider?: string | null;
  dialogueVolume: number;
  backgroundVolume: number;
  speakers: DubbingSpeaker[];
  voiceAssignments: VoiceAssignment[];
  segments: DialogueSegment[];
  tracks: DubbingTrack[];
  separation?: AudioSeparationJobMeta;
  mix?: DubbingMix;
  extractedAudioMediaId?: string;
  mixedVideoMediaId?: string;
  warnings: string[];
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TimingIssue {
  code:
    | "overlap"
    | "missing_timestamp"
    | "negative_duration"
    | "audio_too_long"
    | "audio_too_short"
    | "multi_speaker_overlap"
    | "impossible_rate";
  segmentId?: string;
  message: string;
  severity: "error" | "warning";
}

export interface TimingValidationResult {
  ok: boolean;
  issues: TimingIssue[];
  suggestedRates: Record<string, number>;
}

/** Max speaking-rate stretch allowed before warning / refuse. */
export const MAX_SPEAKING_RATE = 1.35;
export const MIN_SPEAKING_RATE = 0.75;
/** Tolerance before warning when audio vs window mismatch (ms). */
export const TIMING_TOLERANCE_MS = 80;
export const MAX_TTS_CHARS = 4000;

export function newDialogueSegmentId(): string {
  return `dlg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function segmentsFromSubtitles(
  cues: Array<{
    id: string;
    startMs: number;
    endMs: number;
    text: string;
    speakerId?: string;
  }>,
  options?: { targetLanguage?: string },
): DialogueSegment[] {
  return cues.map((c) => ({
    id: newDialogueSegmentId(),
    sourceSubtitleCueId: c.id,
    sourceText: c.text,
    translatedText: c.text,
    startMs: c.startMs,
    endMs: c.endMs,
    speakerId: c.speakerId ?? "speaker_1",
    status: "pending" as const,
    warnings: [],
  }));
}

export function validateTiming(
  segments: DialogueSegment[],
): TimingValidationResult {
  const issues: TimingIssue[] = [];
  const suggestedRates: Record<string, number> = {};
  const sorted = [...segments].sort((a, b) => a.startMs - b.startMs);

  for (const seg of sorted) {
    if (
      !Number.isFinite(seg.startMs) ||
      !Number.isFinite(seg.endMs) ||
      seg.startMs < 0 ||
      seg.endMs < 0
    ) {
      issues.push({
        code: "missing_timestamp",
        segmentId: seg.id,
        message: `Segment ${seg.id} has invalid timestamps.`,
        severity: "error",
      });
      continue;
    }
    const window = seg.endMs - seg.startMs;
    if (window <= 0) {
      issues.push({
        code: "negative_duration",
        segmentId: seg.id,
        message: `Segment ${seg.id} has non-positive duration.`,
        severity: "error",
      });
      continue;
    }
    if (seg.audioDurationMs != null) {
      const audio = seg.audioDurationMs;
      if (audio > window + TIMING_TOLERANCE_MS) {
        const needed = audio / window;
        if (needed > MAX_SPEAKING_RATE) {
          issues.push({
            code: "impossible_rate",
            segmentId: seg.id,
            message: `Audio (${audio}ms) cannot fit window (${window}ms) within max rate ${MAX_SPEAKING_RATE}.`,
            severity: "warning",
          });
          suggestedRates[seg.id] = MAX_SPEAKING_RATE;
        } else {
          issues.push({
            code: "audio_too_long",
            segmentId: seg.id,
            message: `Audio longer than cue; suggest speakingRate ${needed.toFixed(2)}.`,
            severity: "warning",
          });
          suggestedRates[seg.id] = Number(needed.toFixed(3));
        }
      } else if (audio < window - Math.max(TIMING_TOLERANCE_MS, window * 0.25)) {
        issues.push({
          code: "audio_too_short",
          segmentId: seg.id,
          message: `Audio shorter than cue window; silence padding will be used.`,
          severity: "warning",
        });
      }
    }
  }

  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i]!;
    const b = sorted[i + 1]!;
    if (a.endMs > b.startMs + 1) {
      const multi =
        a.speakerId && b.speakerId && a.speakerId !== b.speakerId
          ? "multi_speaker_overlap"
          : "overlap";
      issues.push({
        code: multi,
        segmentId: a.id,
        message: `Overlap between ${a.id} and ${b.id} (${a.endMs} > ${b.startMs}).`,
        severity: "error",
      });
    }
  }

  const ok = !issues.some((i) => i.severity === "error");
  return { ok, issues, suggestedRates };
}

export function assertTextLength(text: string): void {
  if (!text.trim()) {
    throw new Error("TTS text is empty.");
  }
  if (text.length > MAX_TTS_CHARS) {
    throw new Error(`TTS text exceeds ${MAX_TTS_CHARS} characters.`);
  }
}

export function clampSpeakingRate(rate: number): number {
  if (!Number.isFinite(rate)) return 1;
  return Math.min(MAX_SPEAKING_RATE, Math.max(MIN_SPEAKING_RATE, rate));
}

export function targetWindowMs(seg: DialogueSegment): number {
  return Math.max(1, seg.endMs - seg.startMs);
}

/** Built-in catalog — provider voice IDs only; no celebrity clones. */
export function builtinVoiceCharacters(now = new Date().toISOString()): VoiceCharacter[] {
  const base = (partial: Omit<VoiceCharacter, "createdAt" | "updatedAt" | "enabled">) => ({
    ...partial,
    enabled: true,
    createdAt: now,
    updatedAt: now,
  });
  return [
    base({
      id: "voice_en_alloy",
      name: "Alloy (EN)",
      genderLabel: "neutral",
      language: "en",
      provider: "openai-tts",
      providerVoiceId: "alloy",
      style: "neutral",
      pitch: 0,
      speakingRate: 1,
    }),
    base({
      id: "voice_en_echo",
      name: "Echo (EN)",
      genderLabel: "male",
      language: "en",
      provider: "openai-tts",
      providerVoiceId: "echo",
      style: "clear",
      pitch: 0,
      speakingRate: 1,
    }),
    base({
      id: "voice_en_nova",
      name: "Nova (EN)",
      genderLabel: "female",
      language: "en",
      provider: "openai-tts",
      providerVoiceId: "nova",
      style: "warm",
      pitch: 0,
      speakingRate: 1,
    }),
    base({
      id: "voice_en_onyx",
      name: "Onyx (EN)",
      genderLabel: "male",
      language: "en",
      provider: "openai-tts",
      providerVoiceId: "onyx",
      style: "deep",
      pitch: -1,
      speakingRate: 0.95,
    }),
    base({
      id: "voice_en_shimmer",
      name: "Shimmer (EN)",
      genderLabel: "female",
      language: "en",
      provider: "openai-tts",
      providerVoiceId: "shimmer",
      style: "bright",
      pitch: 1,
      speakingRate: 1.05,
    }),
    base({
      id: "voice_mock_a",
      name: "Mock Tone A (tests)",
      genderLabel: "neutral",
      language: "en",
      provider: "mock",
      providerVoiceId: "tone_a",
      style: "tone",
      pitch: 0,
      speakingRate: 1,
    }),
    base({
      id: "voice_mock_b",
      name: "Mock Tone B (tests)",
      genderLabel: "neutral",
      language: "en",
      provider: "mock",
      providerVoiceId: "tone_b",
      style: "tone",
      pitch: 0,
      speakingRate: 1,
    }),
    base({
      id: "voice_km_placeholder",
      name: "Khmer (requires capable provider)",
      genderLabel: "neutral",
      language: "km",
      provider: "unavailable",
      providerVoiceId: "km_unconfigured",
      style: "unset",
      pitch: 0,
      speakingRate: 1,
    }),
  ];
}

export function languageSupportedByVoice(
  voice: VoiceCharacter,
  language: string,
  ttsProvider: string,
): { ok: boolean; reason?: string } {
  const lang = language.toLowerCase();
  if (voice.language !== lang && voice.language !== "multilingual") {
    if (lang === "km") {
      return {
        ok: false,
        reason:
          "Khmer TTS is not available with the current voice/provider. Configure a Khmer-capable TTS provider before dubbing to km.",
      };
    }
    return {
      ok: false,
      reason: `Voice ${voice.id} is for language "${voice.language}", not "${language}".`,
    };
  }
  if (voice.provider === "unavailable") {
    return {
      ok: false,
      reason: `Voice ${voice.name} has no configured TTS provider.`,
    };
  }
  if (voice.provider === "mock" && ttsProvider !== "mock") {
    return {
      ok: false,
      reason:
        "Mock voices require explicit TTS provider selection of mock (tones only).",
    };
  }
  if (
    voice.provider === "openai-tts" &&
    ttsProvider !== "openai-tts" &&
    ttsProvider !== "openai"
  ) {
    return {
      ok: false,
      reason: "OpenAI voices require TTS provider openai-tts.",
    };
  }
  return { ok: true };
}

export const MIX_MODE_LABELS: Record<MixMode, string> = {
  replace_dialogue:
    "Replace dialogue (needs separation; otherwise mixes over full original)",
  mix: "Mix dubbed dialogue with original audio",
  dialogue_only: "Dubbed dialogue only",
  original_only: "Original audio only",
};

export const CUSTOM_VOICE_CONSENT_NOTE =
  "Custom voice cloning requires documented consent from the voice owner. Celebrity or unauthorized voice imitation is not supported.";
