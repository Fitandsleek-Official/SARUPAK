import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  StreamableFile,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma } from "@prisma/client";
import {
  CUSTOM_VOICE_CONSENT_NOTE,
  builtinVoiceCharacters,
  clampSpeakingRate,
  languageSupportedByVoice,
  segmentsFromSubtitles,
  validateTiming,
  type DialogueSegment,
  type DubbingProject,
  type DubbingSpeaker,
  type MixMode,
  type VoiceAssignment,
  type VoiceCharacter,
} from "@sarupak/dubbing-core";
import type { SubtitleSegment } from "@sarupak/subtitle-utils";
import { createReadStream } from "node:fs";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createId } from "../media/create-id";
import { DiarizationService } from "../diarization/diarization.service";
import { FfmpegService } from "../ffmpeg/ffmpeg.service";
import { JobsService } from "../jobs/jobs.service";
import { PrismaService } from "../prisma/prisma.service";
import { ProjectsService } from "../projects/projects.service";
import { SeparationService } from "../separation/separation.service";
import {
  STORAGE_SERVICE,
  type StorageService,
} from "../storage/storage.tokens";
import { TtsService } from "../tts/tts.service";
import { buildStorageKey } from "@sarupak/media-utils";

@Injectable()
export class DubbingService {
  private readonly logger = new Logger(DubbingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly projects: ProjectsService,
    private readonly jobs: JobsService,
    private readonly ffmpeg: FfmpegService,
    private readonly tts: TtsService,
    private readonly separation: SeparationService,
    private readonly diarization: DiarizationService,
    private readonly config: ConfigService,
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
  ) {}

  listVoices(): VoiceCharacter[] {
    return builtinVoiceCharacters();
  }

  async providers(userId: string, projectId: string) {
    await this.projects.getOwned(userId, projectId);
    const tts = await this.tts.capabilities();
    const sep = await this.separation.resolve();
    const dia = await this.diarization.resolve();
    const trueIsolation = sep.name === "demucs" || sep.name === "sotaka";
    return {
      tts: {
        ...tts,
        openaiConfigured: tts.status.openaiConfigured,
        sotakaConfigured: tts.status.sotakaConfigured,
        suggestedProvider: tts.status.suggestedProvider,
        policy: tts.status.policy,
      },
      separation: {
        active: sep.name,
        trueIsolation,
        note:
          sep.name === "passthrough"
            ? "Passthrough fallback — original audio preserved; dialogue not isolated."
            : sep.name === "sotaka"
              ? "SOTAKA Vocal Remover — vocals vs instrumental (BGM kept for mix)."
              : undefined,
      },
      diarization: { active: dia.name },
      consentNote: CUSTOM_VOICE_CONSENT_NOTE,
    };
  }

  async listSessions(userId: string, projectId: string) {
    await this.projects.getOwned(userId, projectId);
    const rows = await this.prisma.dubbingSession.findMany({
      where: { projectId },
      orderBy: { updatedAt: "desc" },
    });
    return rows.map((r) => this.toDto(r));
  }

  async getSession(userId: string, projectId: string, sessionId: string) {
    await this.projects.getOwned(userId, projectId);
    const row = await this.prisma.dubbingSession.findFirst({
      where: { id: sessionId, projectId },
    });
    if (!row) throw new NotFoundException("Dubbing session not found.");
    return this.toDto(row);
  }

  async createSession(
    userId: string,
    projectId: string,
    input: {
      mediaAssetId: string;
      subtitleSetId?: string;
      sourceLanguage?: string;
      targetLanguage?: string;
      ttsProvider?: string;
    },
  ) {
    await this.projects.getOwned(userId, projectId);
    const asset = await this.prisma.mediaAsset.findFirst({
      where: { id: input.mediaAssetId, projectId, userId },
    });
    if (!asset) throw new NotFoundException("Media asset not found.");

    let cues: SubtitleSegment[] = [];
    if (input.subtitleSetId) {
      const set = await this.prisma.subtitleSet.findFirst({
        where: { id: input.subtitleSetId, projectId },
      });
      if (!set) throw new NotFoundException("Subtitle set not found.");
      cues = set.segments as unknown as SubtitleSegment[];
    }

    // Only set provider when explicitly requested. Env TTS_PROVIDER=mock is for
    // automated tests — still treat as explicit via input or leave null for UI.
    const ttsProvider = input.ttsProvider ?? null;
    if (ttsProvider) {
      await this.assertTtsProviderAllowed(ttsProvider, input.targetLanguage ?? "en");
    }

    const segments = segmentsFromSubtitles(cues);
    const speakers: DubbingSpeaker[] = [
      { speakerId: "speaker_male", displayName: "Male (manual)" },
      { speakerId: "speaker_female", displayName: "Female (manual)" },
    ];
    const row = await this.prisma.dubbingSession.create({
      data: {
        projectId,
        mediaAssetId: asset.id,
        subtitleSetId: input.subtitleSetId ?? null,
        sourceLanguage: input.sourceLanguage ?? "en",
        targetLanguage: input.targetLanguage ?? "en",
        status: "draft",
        mixMode: "mix",
        ttsProvider,
        dialogueVolume: 1,
        backgroundVolume: 0.6,
        speakers: speakers as unknown as Prisma.InputJsonValue,
        voiceAssignments: [] as unknown as Prisma.InputJsonValue,
        segments: segments as unknown as Prisma.InputJsonValue,
        tracks: [
          { id: "track_original", kind: "original", volume: 1 },
          { id: "track_dialogue", kind: "dialogue", volume: 1 },
        ] as unknown as Prisma.InputJsonValue,
        warnings: [] as unknown as Prisma.InputJsonValue,
      },
    });
    return this.toDto(row);
  }

  async extractAudio(userId: string, projectId: string, sessionId: string) {
    const session = await this.requireSession(userId, projectId, sessionId);
    if (!this.storage.resolvePath) {
      throw new BadRequestException("Storage cannot resolve media paths.");
    }
    const asset = await this.prisma.mediaAsset.findFirst({
      where: { id: session.mediaAssetId, projectId, userId },
    });
    if (!asset) throw new NotFoundException("Media asset not found.");

    const job = await this.jobs.enqueue({
      userId,
      projectId,
      type: "EXTRACT_AUDIO",
      input: { sessionId, mediaAssetId: asset.id },
    });
    await this.prisma.job.update({
      where: { id: job.id },
      data: { status: "RUNNING", progress: 0.1 },
    });

    const mediaPath = this.storage.resolvePath(asset.storageKey);
    const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "sarupak-dub-"));
    const wavPath = path.join(workDir, "extract.wav");

    try {
      await this.prisma.dubbingSession.update({
        where: { id: sessionId },
        data: { status: "extracting" },
      });

      const probe = await this.ffmpeg.extractAudioValidated(mediaPath, wavPath, {
        expectDurationMs: asset.durationMs ?? undefined,
        toleranceMs: 750,
      });

      const audioId = createId();
      const storageKey = buildStorageKey({
        userId,
        projectId,
        assetId: audioId,
        safeBaseName: "extracted-audio.wav",
      });
      const buf = await fs.readFile(wavPath);
      await this.storage.putObject(storageKey, buf, "audio/wav");
      await this.prisma.mediaAsset.create({
        data: {
          id: audioId,
          projectId,
          userId,
          kind: "AUDIO",
          storageKey,
          originalName: "extracted-audio.wav",
          mimeType: "audio/wav",
          sizeBytes: BigInt(buf.length),
          durationMs: probe.durationMs,
        },
      });

      await this.prisma.job.update({
        where: { id: job.id },
        data: {
          status: "SUCCEEDED",
          progress: 1,
          output: {
            mediaAssetId: audioId,
            sampleRate: probe.sampleRate,
            channels: probe.channels,
            codec: probe.codec,
          },
        },
      });

      const updated = await this.prisma.dubbingSession.update({
        where: { id: sessionId },
        data: {
          extractedAudioMediaId: audioId,
          status: "ready",
        },
      });
      return { session: this.toDto(updated), jobId: job.id, audio: probe };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Extract failed";
      await this.prisma.job.update({
        where: { id: job.id },
        data: { status: "FAILED", error: message, progress: 0 },
      });
      await this.prisma.dubbingSession.update({
        where: { id: sessionId },
        data: { status: "failed", errorMessage: message },
      });
      throw new BadRequestException(message);
    } finally {
      await fs.rm(workDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  async separateAudio(userId: string, projectId: string, sessionId: string) {
    const session = await this.requireSession(userId, projectId, sessionId);
    if (!session.extractedAudioMediaId) {
      throw new BadRequestException("Extract audio first.");
    }
    if (!this.storage.resolvePath) {
      throw new BadRequestException("Storage cannot resolve media paths.");
    }

    const audio = await this.prisma.mediaAsset.findFirst({
      where: { id: session.extractedAudioMediaId, projectId, userId },
    });
    if (!audio) throw new NotFoundException("Extracted audio not found.");

    const job = await this.jobs.enqueue({
      userId,
      projectId,
      type: "SEPARATE_AUDIO",
      input: { sessionId },
    });
    await this.prisma.job.update({
      where: { id: job.id },
      data: { status: "RUNNING", progress: 0.2 },
    });

    const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "sarupak-sep-"));
    try {
      const result = await this.separation.separate({
        audioPath: this.storage.resolvePath(audio.storageKey),
        workDir,
      });

      const stemRefs: Array<{
        kind: string;
        available: boolean;
        note?: string;
        mediaAssetId?: string;
      }> = [];

      for (const s of result.stems) {
        let mediaAssetId: string | undefined;
        if (s.available && s.path && (s.kind === "music" || s.kind === "dialogue")) {
          try {
            const buf = await fs.readFile(s.path);
            if (buf.length > 64) {
              const stemId = createId();
              const storageKey = buildStorageKey({
                userId,
                projectId,
                assetId: stemId,
                safeBaseName: `stem-${s.kind}.wav`,
              });
              await this.storage.putObject(storageKey, buf, "audio/wav");
              const probe = await this.ffmpeg.probeAudio(s.path);
              await this.prisma.mediaAsset.create({
                data: {
                  id: stemId,
                  projectId,
                  userId,
                  kind: "AUDIO",
                  storageKey,
                  originalName: `stem-${s.kind}.wav`,
                  mimeType: "audio/wav",
                  sizeBytes: BigInt(buf.length),
                  durationMs: probe.durationMs,
                },
              });
              mediaAssetId = stemId;
            }
          } catch {
            // Keep stem metadata without media id
          }
        }
        stemRefs.push({
          kind: s.kind,
          available: s.available,
          note: s.note,
          mediaAssetId,
        });
      }

      const separation = {
        provider: result.provider,
        available: result.available,
        stems: stemRefs,
        warning: result.warning,
      };

      await this.prisma.job.update({
        where: { id: job.id },
        data: {
          status: "SUCCEEDED",
          progress: 1,
          output: separation as unknown as Prisma.InputJsonValue,
        },
      });

      const warnings = [
        ...((session.warnings as string[]) ?? []),
        ...(result.warning ? [result.warning] : []),
      ];

      // Prefer instrumental as mix background when available
      const musicStem = stemRefs.find(
        (s) => s.kind === "music" && s.available && s.mediaAssetId,
      );
      const trackPatch =
        musicStem?.mediaAssetId &&
        Array.isArray(session.tracks)
          ? ((session.tracks as unknown as Array<Record<string, unknown>>) ?? []).map(
              (t) =>
                t.kind === "background" || t.kind === "music_sfx"
                  ? { ...t, mediaAssetId: musicStem.mediaAssetId }
                  : t,
            )
          : undefined;

      const updated = await this.prisma.dubbingSession.update({
        where: { id: sessionId },
        data: {
          status: "ready",
          separation: separation as unknown as Prisma.InputJsonValue,
          warnings: warnings as unknown as Prisma.InputJsonValue,
          ...(trackPatch
            ? { tracks: trackPatch as unknown as Prisma.InputJsonValue }
            : {}),
          ...(result.available && result.provider === "sotaka"
            ? { mixMode: "replace_dialogue" }
            : {}),
        },
      });
      return { session: this.toDto(updated), jobId: job.id };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Separation failed";
      await this.prisma.job.update({
        where: { id: job.id },
        data: { status: "FAILED", error: message },
      });
      throw new BadRequestException(message);
    } finally {
      await fs.rm(workDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  async diarize(userId: string, projectId: string, sessionId: string) {
    const session = await this.requireSession(userId, projectId, sessionId);
    if (!session.extractedAudioMediaId) {
      throw new BadRequestException("Extract audio first.");
    }
    if (!this.storage.resolvePath) {
      throw new BadRequestException("Storage cannot resolve media paths.");
    }
    const audio = await this.prisma.mediaAsset.findFirst({
      where: { id: session.extractedAudioMediaId, projectId, userId },
    });
    if (!audio) throw new NotFoundException("Extracted audio not found.");

    const segments = session.segments as unknown as DialogueSegment[];
    const job = await this.jobs.enqueue({
      userId,
      projectId,
      type: "DIARIZE",
      input: { sessionId },
    });

    const result = await this.diarization.diarize({
      audioPath: this.storage.resolvePath(audio.storageKey),
      cues: segments.map((s) => ({
        id: s.id,
        startMs: s.startMs,
        endMs: s.endMs,
      })),
    });

    const nextSegments = segments.map((s) => {
      const hit = result.segments.find(
        (d) => d.startMs === s.startMs && d.endMs === s.endMs,
      );
      return {
        ...s,
        speakerId: hit?.speakerId ?? s.speakerId ?? "speaker_male",
      };
    });

    const speakers: DubbingSpeaker[] = result.speakers.map((s) => ({
      speakerId: s.speakerId,
      displayName: s.displayName,
    }));

    const warnings = [
      ...((session.warnings as string[]) ?? []),
      ...(result.warning ? [result.warning] : []),
    ];

    await this.prisma.job.update({
      where: { id: job.id },
      data: {
        status: "SUCCEEDED",
        progress: 1,
        output: {
          provider: result.provider,
          isMock: result.isMock,
          speakers,
        } as unknown as Prisma.InputJsonValue,
      },
    });

    const updated = await this.prisma.dubbingSession.update({
      where: { id: sessionId },
      data: {
        speakers: speakers as unknown as Prisma.InputJsonValue,
        segments: nextSegments as unknown as Prisma.InputJsonValue,
        warnings: warnings as unknown as Prisma.InputJsonValue,
      },
    });
    return { session: this.toDto(updated), jobId: job.id, isMock: result.isMock };
  }

  async updateSession(
    userId: string,
    projectId: string,
    sessionId: string,
    patch: {
      mixMode?: MixMode;
      ttsProvider?: string;
      dialogueVolume?: number;
      backgroundVolume?: number;
      targetLanguage?: string;
      segments?: Array<{
        id: string;
        translatedText?: string;
        speakerId?: string;
        voiceCharacterId?: string;
        startMs?: number;
        endMs?: number;
      }>;
      voiceAssignments?: VoiceAssignment[];
      speakers?: DubbingSpeaker[];
    },
  ) {
    const session = await this.requireSession(userId, projectId, sessionId);
    let segments = session.segments as unknown as DialogueSegment[];

    if (patch.ttsProvider) {
      await this.assertTtsProviderAllowed(
        patch.ttsProvider,
        patch.targetLanguage ?? session.targetLanguage,
      );
    }

    if (patch.segments) {
      const map = new Map(patch.segments.map((s) => [s.id, s]));
      segments = segments.map((s) => {
        const p = map.get(s.id);
        if (!p) return s;
        return {
          ...s,
          translatedText: p.translatedText ?? s.translatedText,
          speakerId: p.speakerId ?? s.speakerId,
          voiceCharacterId: p.voiceCharacterId ?? s.voiceCharacterId,
          startMs: p.startMs ?? s.startMs,
          endMs: p.endMs ?? s.endMs,
          status:
            p.voiceCharacterId || p.speakerId ? "assigned" : s.status,
        };
      });
    }

    const timing = validateTiming(segments);
    const warnings = [
      ...timing.issues.map((i) => i.message),
      ...((session.warnings as string[]) ?? []).filter(
        (w) => !w.startsWith("Overlap") && !w.includes("non-positive"),
      ),
    ];

    const updated = await this.prisma.dubbingSession.update({
      where: { id: sessionId },
      data: {
        mixMode: patch.mixMode ?? session.mixMode,
        ttsProvider: patch.ttsProvider ?? session.ttsProvider,
        dialogueVolume: patch.dialogueVolume ?? session.dialogueVolume,
        backgroundVolume: patch.backgroundVolume ?? session.backgroundVolume,
        targetLanguage: patch.targetLanguage ?? session.targetLanguage,
        segments: segments as unknown as Prisma.InputJsonValue,
        voiceAssignments: (patch.voiceAssignments ??
          session.voiceAssignments) as unknown as Prisma.InputJsonValue,
        speakers: (patch.speakers ??
          session.speakers) as unknown as Prisma.InputJsonValue,
        warnings: warnings as unknown as Prisma.InputJsonValue,
      },
    });
    return {
      session: this.toDto(updated),
      timing,
    };
  }

  async assignVoice(
    userId: string,
    projectId: string,
    sessionId: string,
    input: {
      speakerId: string;
      voiceCharacterId: string;
      referenceMediaAssetId?: string;
      referenceText?: string;
    },
  ) {
    const session = await this.requireSession(userId, projectId, sessionId);
    const voice = builtinVoiceCharacters().find(
      (v) => v.id === input.voiceCharacterId,
    );
    if (!voice || !voice.enabled) {
      throw new BadRequestException("Unknown or disabled voice character.");
    }
    const providerName =
      session.ttsProvider ??
      (await this.tts.capabilities(session.targetLanguage)).active;
    if (!providerName) {
      throw new BadRequestException(
        "Select a TTS provider before assigning voices (sotaka-tts, openai-tts, or mock).",
      );
    }
    if (voice.provider === "unavailable") {
      throw new BadRequestException(
        `Voice ${voice.name} has no configured TTS provider.`,
      );
    }
    if (voice.provider === "mock" && providerName !== "mock") {
      throw new BadRequestException(
        "Mock voices can only be used when TTS provider is explicitly set to mock.",
      );
    }
    if (
      voice.provider === "openai-tts" &&
      providerName !== "openai-tts" &&
      providerName !== "openai"
    ) {
      throw new BadRequestException(
        "OpenAI voices require TTS provider openai-tts.",
      );
    }
    if (
      voice.provider === "sotaka-tts" &&
      providerName !== "sotaka-tts" &&
      providerName !== "sotaka"
    ) {
      throw new BadRequestException(
        "SOTAKA voices require TTS provider sotaka-tts.",
      );
    }
    const langCheck = languageSupportedByVoice(
      voice,
      session.targetLanguage,
      providerName,
    );
    if (!langCheck.ok) {
      throw new BadRequestException(langCheck.reason);
    }

    if (input.referenceMediaAssetId) {
      const ref = await this.prisma.mediaAsset.findFirst({
        where: {
          id: input.referenceMediaAssetId,
          projectId,
          userId,
          kind: "AUDIO",
        },
      });
      if (!ref) {
        throw new BadRequestException(
          "Clone reference media not found (upload a ≤12s audio clip first).",
        );
      }
    }

    const assignment: VoiceAssignment = {
      speakerId: input.speakerId,
      voiceCharacterId: input.voiceCharacterId,
      ...(input.referenceMediaAssetId
        ? { referenceMediaAssetId: input.referenceMediaAssetId }
        : {}),
      ...(input.referenceText?.trim()
        ? { referenceText: input.referenceText.trim() }
        : {}),
    };

    const assignments = [
      ...((session.voiceAssignments as unknown as VoiceAssignment[]) ?? []).filter(
        (a) => a.speakerId !== input.speakerId,
      ),
      assignment,
    ];
    const speakers = ((session.speakers as unknown as DubbingSpeaker[]) ?? []).map(
      (s) =>
        s.speakerId === input.speakerId
          ? { ...s, voiceCharacterId: input.voiceCharacterId }
          : s,
    );
    const segments = (session.segments as unknown as DialogueSegment[]).map(
      (s) =>
        s.speakerId === input.speakerId
          ? {
              ...s,
              voiceCharacterId: input.voiceCharacterId,
              status: "assigned" as const,
            }
          : s,
    );

    const updated = await this.prisma.dubbingSession.update({
      where: { id: sessionId },
      data: {
        voiceAssignments: assignments as unknown as Prisma.InputJsonValue,
        speakers: speakers as unknown as Prisma.InputJsonValue,
        segments: segments as unknown as Prisma.InputJsonValue,
      },
    });
    return this.toDto(updated);
  }

  async generateTts(
    userId: string,
    projectId: string,
    sessionId: string,
    input?: {
      segmentIds?: string[];
      speakingRate?: number;
      ttsProvider?: string;
    },
  ) {
    const session = await this.requireSession(userId, projectId, sessionId);
    if (!this.storage.resolvePath) {
      throw new BadRequestException("Storage cannot resolve media paths.");
    }

    const providerName = await this.resolveSessionTtsProvider(
      session.ttsProvider,
      input?.ttsProvider,
      session.targetLanguage,
    );

    // Persist explicit selection on session for retries.
    if (session.ttsProvider !== providerName) {
      await this.prisma.dubbingSession.update({
        where: { id: sessionId },
        data: { ttsProvider: providerName },
      });
    }

    const ttsCaps = await this.tts.capabilities(session.targetLanguage);
    let segments = session.segments as unknown as DialogueSegment[];
    const targetIds = input?.segmentIds
      ? new Set(input.segmentIds)
      : new Set(segments.map((s) => s.id));

    const job = await this.jobs.enqueue({
      userId,
      projectId,
      type: "TTS",
      input: {
        sessionId,
        segmentIds: [...targetIds],
        ttsProvider: providerName,
      },
    });
    await this.prisma.job.update({
      where: { id: job.id },
      data: {
        status: "RUNNING",
        progress: 0.05,
        attempts: { increment: 1 },
      },
    });

    await this.prisma.dubbingSession.update({
      where: { id: sessionId },
      data: { status: "generating" },
    });

    const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "sarupak-tts-"));
    const voices = builtinVoiceCharacters();
    let done = 0;
    const total = [...targetIds].length || 1;

    try {
      for (let i = 0; i < segments.length; i++) {
        const seg = segments[i]!;
        if (!targetIds.has(seg.id)) continue;

        const voiceId =
          seg.voiceCharacterId ??
          ((session.voiceAssignments as unknown as VoiceAssignment[]) ?? []).find(
            (a) => a.speakerId === seg.speakerId,
          )?.voiceCharacterId;
        const voice = voiceId
          ? voices.find((v) => v.id === voiceId)
          : undefined;
        if (!voice) {
          segments[i] = {
            ...seg,
            status: "failed",
            errorMessage: "No voice character assigned.",
          };
          continue;
        }

        if (
          (voice.provider === "mock" && providerName !== "mock") ||
          (voice.provider === "openai-tts" &&
            providerName !== "openai-tts" &&
            providerName !== "openai") ||
          (voice.provider === "sotaka-tts" &&
            providerName !== "sotaka-tts" &&
            providerName !== "sotaka")
        ) {
          segments[i] = {
            ...seg,
            status: "failed",
            errorMessage: `Voice ${voice.id} is incompatible with TTS provider ${providerName}.`,
          };
          continue;
        }

        const langCheck = languageSupportedByVoice(
          voice,
          session.targetLanguage,
          providerName,
        );
        if (!langCheck.ok) {
          segments[i] = {
            ...seg,
            status: "failed",
            errorMessage: langCheck.reason,
          };
          continue;
        }

        const rate = clampSpeakingRate(
          input?.speakingRate ?? voice.speakingRate ?? 1,
        );
        const outPath = path.join(workDir, `${seg.id}.wav`);
        const assignment = (
          (session.voiceAssignments as unknown as VoiceAssignment[]) ?? []
        ).find((a) => a.speakerId === seg.speakerId);

        let referenceAudioPath: string | undefined;
        if (assignment?.referenceMediaAssetId && this.storage.resolvePath) {
          const refAsset = await this.prisma.mediaAsset.findFirst({
            where: {
              id: assignment.referenceMediaAssetId,
              projectId,
              userId,
            },
          });
          if (refAsset) {
            referenceAudioPath = this.storage.resolvePath(refAsset.storageKey);
          }
        }

        try {
          const result = await this.tts.synthesize(
            {
              text: seg.translatedText || seg.sourceText,
              language: session.targetLanguage,
              voiceId: voice.providerVoiceId,
              speakingRate: rate,
              pitch: voice.pitch,
              outputFormat: "wav",
              outputPath: outPath,
              referenceAudioPath,
              referenceText: assignment?.referenceText,
            },
            { provider: providerName },
          );

          let finalPath = outPath;
          let durationMs = result.durationMs;
          const window = Math.max(1, seg.endMs - seg.startMs);
          if (durationMs > window + 80) {
            const needed = durationMs / window;
            if (needed <= 1.35) {
              const stretched = path.join(workDir, `${seg.id}_fit.wav`);
              await this.ffmpeg.adjustAudioTempo(outPath, stretched, needed);
              const probe = await this.ffmpeg.probeAudio(stretched);
              finalPath = stretched;
              durationMs = probe.durationMs ?? durationMs;
              segments[i] = {
                ...seg,
                speakingRateApplied: needed,
                warnings: [
                  ...result.warnings,
                  `Applied speakingRate ${needed.toFixed(2)} to fit cue.`,
                ],
              };
            } else {
              segments[i] = {
                ...seg,
                warnings: [
                  ...result.warnings,
                  `Audio (${durationMs}ms) longer than cue (${window}ms); cannot stretch beyond 1.35×.`,
                ],
                status: "warning",
              };
            }
          }

          // Validate stored audio with ffprobe before persisting.
          const validated = await this.ffmpeg.probeAudio(finalPath);
          if (!validated.hasAudio || !validated.durationMs) {
            throw new Error("Generated audio failed ffprobe validation.");
          }
          durationMs = validated.durationMs;

          const mediaId = createId();
          const storageKey = buildStorageKey({
            userId,
            projectId,
            assetId: mediaId,
            safeBaseName: `tts-${seg.id}.wav`,
          });
          const buf = await fs.readFile(finalPath);
          await this.storage.putObject(storageKey, buf, "audio/wav");
          await this.prisma.mediaAsset.create({
            data: {
              id: mediaId,
              projectId,
              userId,
              kind: "GENERATED_SPEECH",
              storageKey,
              originalName: `tts-${seg.id}.wav`,
              mimeType: "audio/wav",
              sizeBytes: BigInt(buf.length),
              durationMs,
            },
          });

          const current = segments[i]!;
          segments[i] = {
            ...current,
            voiceCharacterId: voice.id,
            generatedAudioMediaId: mediaId,
            audioDurationMs: durationMs,
            speakingRateApplied: current.speakingRateApplied ?? rate,
            status: current.status === "warning" ? "warning" : "ready",
            warnings: [
              ...(current.warnings ?? []),
              ...(result.isMock
                ? ["Mock TTS tone — not production speech."]
                : [`Real TTS via ${result.provider}`]),
            ],
            errorMessage: undefined,
          };
        } catch (err) {
          segments[i] = {
            ...seg,
            status: "failed",
            errorMessage: err instanceof Error ? err.message : "TTS failed",
          };
        }

        done += 1;
        await this.prisma.job.update({
          where: { id: job.id },
          data: { progress: Math.min(0.95, done / total) },
        });
      }

      const timing = validateTiming(segments);
      await this.prisma.job.update({
        where: { id: job.id },
        data: {
          status: "SUCCEEDED",
          progress: 1,
          output: {
            provider: providerName,
            timing,
          } as unknown as Prisma.InputJsonValue,
        },
      });

      const updated = await this.prisma.dubbingSession.update({
        where: { id: sessionId },
        data: {
          status: "ready",
          ttsProvider: providerName,
          segments: segments as unknown as Prisma.InputJsonValue,
          warnings: timing.issues.map((i) => i.message) as unknown as Prisma.InputJsonValue,
        },
      });
      return { session: this.toDto(updated), jobId: job.id, timing, tts: ttsCaps };
    } catch (err) {
      const message = err instanceof Error ? err.message : "TTS batch failed";
      await this.prisma.job.update({
        where: { id: job.id },
        data: { status: "FAILED", error: message },
      });
      await this.prisma.dubbingSession.update({
        where: { id: sessionId },
        data: { status: "failed", errorMessage: message },
      });
      throw new BadRequestException(message);
    } finally {
      await fs.rm(workDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  async mixAndExport(
    userId: string,
    projectId: string,
    sessionId: string,
  ) {
    const session = await this.requireSession(userId, projectId, sessionId);
    if (!this.storage.resolvePath) {
      throw new BadRequestException("Storage cannot resolve media paths.");
    }

    const video = await this.prisma.mediaAsset.findFirst({
      where: { id: session.mediaAssetId, projectId, userId },
    });
    if (!video) throw new NotFoundException("Source video not found.");

    const segments = session.segments as unknown as DialogueSegment[];
    const ready = segments.filter((s) => s.generatedAudioMediaId);
    if (
      session.mixMode !== "original_only" &&
      ready.length === 0
    ) {
      throw new BadRequestException(
        "Generate TTS for at least one segment before mixing (or use original_only).",
      );
    }

    const timing = validateTiming(segments);
    if (!timing.ok && session.mixMode !== "original_only") {
      throw new BadRequestException({
        message: "Timing validation failed. Fix overlaps before export.",
        timing,
      });
    }

    const job = await this.jobs.enqueue({
      userId,
      projectId,
      type: "MIX",
      input: { sessionId, mixMode: session.mixMode },
    });

    void this.processMix(job.id, userId, projectId, sessionId).catch((err) => {
      this.logger.error(
        `Mix ${job.id} failed`,
        err instanceof Error ? err.stack : err,
      );
    });

    return { jobId: job.id, job };
  }

  async processMix(
    jobId: string,
    userId: string,
    projectId: string,
    sessionId: string,
  ) {
    await this.prisma.job.update({
      where: { id: jobId },
      data: { status: "RUNNING", progress: 0.1, attempts: { increment: 1 } },
    });
    await this.prisma.dubbingSession.update({
      where: { id: sessionId },
      data: { status: "mixing" },
    });

    const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "sarupak-mix-"));
    try {
      const session = await this.requireSession(userId, projectId, sessionId);
      if (!this.storage.resolvePath) {
        throw new Error("Storage cannot resolve media paths.");
      }
      const video = await this.prisma.mediaAsset.findFirstOrThrow({
        where: { id: session.mediaAssetId, projectId, userId },
      });
      const videoPath = this.storage.resolvePath(video.storageKey);
      const segments = session.segments as unknown as DialogueSegment[];
      const dialogueSegments: Array<{ path: string; startMs: number }> = [];

      for (const seg of segments) {
        if (!seg.generatedAudioMediaId) continue;
        const asset = await this.prisma.mediaAsset.findFirst({
          where: { id: seg.generatedAudioMediaId, projectId, userId },
        });
        if (!asset) continue;
        dialogueSegments.push({
          path: this.storage.resolvePath(asset.storageKey),
          startMs: seg.startMs,
        });
      }

      let backgroundPath: string | undefined;
      const sepMeta = session.separation as
        | {
            stems?: Array<{
              kind: string;
              available?: boolean;
              mediaAssetId?: string;
            }>;
          }
        | null
        | undefined;
      const musicStem = sepMeta?.stems?.find(
        (s) => s.kind === "music" && s.available && s.mediaAssetId,
      );
      if (musicStem?.mediaAssetId) {
        const music = await this.prisma.mediaAsset.findFirst({
          where: { id: musicStem.mediaAssetId, projectId, userId },
        });
        if (music) backgroundPath = this.storage.resolvePath(music.storageKey);
      }
      if (!backgroundPath && session.extractedAudioMediaId) {
        const bg = await this.prisma.mediaAsset.findFirst({
          where: { id: session.extractedAudioMediaId, projectId, userId },
        });
        if (bg) backgroundPath = this.storage.resolvePath(bg.storageKey);
      }

      const durationMs =
        video.durationMs ??
        Math.max(
          1000,
          ...segments.map((s) => s.endMs),
          ...dialogueSegments.map((d) => d.startMs + 1000),
        );

      const outPath = path.join(workDir, "dubbed.mp4");
      await this.ffmpeg.mixDubbing({
        videoPath,
        backgroundAudioPath: backgroundPath,
        backgroundIsIsolated: Boolean(musicStem?.mediaAssetId),
        dialogueSegments,
        mode: session.mixMode as MixMode,
        dialogueVolume: session.dialogueVolume,
        backgroundVolume: session.backgroundVolume,
        outputPath: outPath,
        durationMs,
      });

      await this.prisma.job.update({
        where: { id: jobId },
        data: { progress: 0.85 },
      });

      const mediaId = createId();
      const storageKey = path.posix.join(
        "exports",
        userId,
        projectId,
        `dub-${jobId}.mp4`,
      );
      const buf = await fs.readFile(outPath);
      await this.storage.putObject(storageKey, buf, "video/mp4");
      const probe = await this.ffmpeg.probe(
        this.storage.resolvePath!(storageKey),
      );
      await this.prisma.mediaAsset.create({
        data: {
          id: mediaId,
          projectId,
          userId,
          kind: "VIDEO",
          storageKey,
          originalName: `dub-${jobId}.mp4`,
          mimeType: "video/mp4",
          sizeBytes: BigInt(buf.length),
          durationMs: probe.durationMs,
          width: probe.width,
          height: probe.height,
        },
      });

      const mix = {
        mode: session.mixMode,
        dialogueVolume: session.dialogueVolume,
        backgroundVolume: session.backgroundVolume,
        mixedAudioMediaId: mediaId,
        videoMediaId: mediaId,
        warnings: (session.warnings as string[]) ?? [],
      };

      await this.prisma.job.update({
        where: { id: jobId },
        data: {
          status: "SUCCEEDED",
          progress: 1,
          output: {
            mediaAssetId: mediaId,
            storageKey,
            mimeType: "video/mp4",
          },
        },
      });

      await this.prisma.dubbingSession.update({
        where: { id: sessionId },
        data: {
          status: "completed",
          mixedVideoMediaId: mediaId,
          mix: mix as unknown as Prisma.InputJsonValue,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Mix failed";
      await this.prisma.job.update({
        where: { id: jobId },
        data: { status: "FAILED", error: message, progress: 0 },
      });
      await this.prisma.dubbingSession.update({
        where: { id: sessionId },
        data: { status: "failed", errorMessage: message },
      });
      throw err;
    } finally {
      await fs.rm(workDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  async downloadMix(
    userId: string,
    projectId: string,
    sessionId: string,
    jobId: string,
  ) {
    await this.projects.getOwned(userId, projectId);
    const session = await this.prisma.dubbingSession.findFirst({
      where: { id: sessionId, projectId },
    });
    if (!session) throw new NotFoundException("Dubbing session not found.");

    const job = await this.prisma.job.findUnique({ where: { id: jobId } });
    if (!job || job.userId !== userId || job.projectId !== projectId) {
      throw new NotFoundException("Job not found.");
    }
    if (job.status !== "SUCCEEDED" || !job.output) {
      throw new BadRequestException("Dubbing mix is not ready.");
    }
    const output = job.output as { storageKey?: string };
    if (!output.storageKey || !this.storage.resolvePath) {
      throw new BadRequestException("Output file missing.");
    }
    const stream = createReadStream(
      this.storage.resolvePath(output.storageKey),
    );
    return new StreamableFile(stream, {
      type: "video/mp4",
      disposition: `attachment; filename="sarupak-dub-${jobId}.mp4"`,
    });
  }

  private async requireSession(
    userId: string,
    projectId: string,
    sessionId: string,
  ) {
    await this.projects.getOwned(userId, projectId);
    const row = await this.prisma.dubbingSession.findFirst({
      where: { id: sessionId, projectId },
    });
    if (!row) throw new NotFoundException("Dubbing session not found.");
    return row;
  }

  private async assertTtsProviderAllowed(
    provider: string,
    language: string,
  ): Promise<void> {
    try {
      await this.tts.resolveProvider(provider);
    } catch (err) {
      throw new BadRequestException(
        err instanceof Error ? err.message : "Invalid TTS provider.",
      );
    }
    const caps = await this.tts.status(language);
    const entry = caps.providers.find((p) => p.provider === provider);
    if (entry?.state === "unsupported_language") {
      throw new BadRequestException(
        `unsupported_language: ${provider} does not support "${language}".`,
      );
    }
  }

  private async resolveSessionTtsProvider(
    sessionProvider: string | null,
    requestProvider: string | undefined,
    language: string,
  ): Promise<string> {
    const name = (requestProvider ?? sessionProvider ?? "").trim();
    if (!name) {
      const env = (process.env.TTS_PROVIDER ?? "").trim().toLowerCase();
      if (
        env === "mock" ||
        env === "openai-tts" ||
        env === "openai" ||
        env === "sotaka-tts" ||
        env === "sotaka"
      ) {
        const normalized =
          env === "openai"
            ? "openai-tts"
            : env === "sotaka"
              ? "sotaka-tts"
              : env;
        await this.assertTtsProviderAllowed(normalized, language);
        return normalized;
      }
      throw new BadRequestException(
        "Select a TTS provider explicitly (sotaka-tts, openai-tts, or mock). Mock is never used as a silent fallback.",
      );
    }
    await this.assertTtsProviderAllowed(name, language);
    if (name === "openai") return "openai-tts";
    if (name === "sotaka") return "sotaka-tts";
    return name;
  }

  private toDto(row: {
    id: string;
    projectId: string;
    mediaAssetId: string;
    subtitleSetId: string | null;
    schemaVersion: number;
    sourceLanguage: string;
    targetLanguage: string;
    status: string;
    mixMode: string;
    ttsProvider?: string | null;
    dialogueVolume: number;
    backgroundVolume: number;
    speakers: unknown;
    voiceAssignments: unknown;
    segments: unknown;
    tracks: unknown;
    separation: unknown;
    mix: unknown;
    extractedAudioMediaId: string | null;
    mixedVideoMediaId: string | null;
    warnings: unknown;
    errorMessage: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): DubbingProject {
    return {
      schemaVersion: 1,
      id: row.id,
      projectId: row.projectId,
      mediaAssetId: row.mediaAssetId,
      subtitleSetId: row.subtitleSetId ?? undefined,
      sourceLanguage: row.sourceLanguage,
      targetLanguage: row.targetLanguage,
      status: row.status as DubbingProject["status"],
      mixMode: row.mixMode as MixMode,
      ttsProvider: row.ttsProvider ?? null,
      dialogueVolume: row.dialogueVolume,
      backgroundVolume: row.backgroundVolume,
      speakers: (row.speakers as DubbingSpeaker[]) ?? [],
      voiceAssignments: (row.voiceAssignments as VoiceAssignment[]) ?? [],
      segments: (row.segments as DialogueSegment[]) ?? [],
      tracks: (row.tracks as DubbingProject["tracks"]) ?? [],
      separation: (row.separation as DubbingProject["separation"]) ?? undefined,
      mix: (row.mix as DubbingProject["mix"]) ?? undefined,
      extractedAudioMediaId: row.extractedAudioMediaId ?? undefined,
      mixedVideoMediaId: row.mixedVideoMediaId ?? undefined,
      warnings: (row.warnings as string[]) ?? [],
      errorMessage: row.errorMessage ?? undefined,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
