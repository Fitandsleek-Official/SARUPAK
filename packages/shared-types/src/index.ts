/** Shared API / editor contracts for SARUPAK. */

export const PROJECT_SCHEMA_VERSION = 1 as const;

export type MediaKind =
  | "VIDEO"
  | "AUDIO"
  | "IMAGE"
  | "STEM"
  | "GENERATED_SPEECH";

export type ProjectStatus = "DRAFT" | "PROCESSING" | "READY" | "FAILED";

export type JobType =
  | "PROBE"
  | "TRANSCODE"
  | "EXTRACT_AUDIO"
  | "STT"
  | "SEPARATE_AUDIO"
  | "DIARIZE"
  | "TTS"
  | "MIX"
  | "RENDER"
  | "AUTO_CUT_ANALYZE";

export type JobStatus =
  | "QUEUED"
  | "RUNNING"
  | "SUCCEEDED"
  | "FAILED"
  | "CANCELLED";

/** Empty timeline document for new projects (schemaVersion 1). */
export interface TimelineDocumentV1 {
  schemaVersion: typeof PROJECT_SCHEMA_VERSION;
  tracks: TimelineTrack[];
  playheadMs: number;
  zoom: number;
}

export type TrackKind = "video" | "audio" | "text" | "captions" | "effects";

export interface TimelineTrack {
  id: string;
  kind: TrackKind;
  name: string;
  muted: boolean;
  solo: boolean;
  clips: TimelineClip[];
}

export interface TimelineClip {
  id: string;
  mediaAssetId?: string;
  startMs: number;
  durationMs: number;
  trimInMs: number;
  trimOutMs: number;
  volume: number;
  label?: string;
  text?: string;
}

export function createEmptyTimeline(): TimelineDocumentV1 {
  return {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    playheadMs: 0,
    zoom: 1,
    tracks: [
      {
        id: "track_video_1",
        kind: "video",
        name: "Video 1",
        muted: false,
        solo: false,
        clips: [],
      },
      {
        id: "track_audio_1",
        kind: "audio",
        name: "Audio 1",
        muted: false,
        solo: false,
        clips: [],
      },
      {
        id: "track_captions_1",
        kind: "captions",
        name: "Captions",
        muted: false,
        solo: false,
        clips: [],
      },
    ],
  };
}

export interface AuthUserDto {
  id: string;
  email: string;
  displayName: string | null;
  createdAt: string;
}

export interface ProjectDto {
  id: string;
  name: string;
  schemaVersion: number;
  width: number;
  height: number;
  frameRate: number;
  durationMs: number;
  timeline: TimelineDocumentV1;
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
}

export interface MediaAssetDto {
  id: string;
  projectId: string;
  kind: MediaKind;
  originalName: string;
  mimeType: string;
  sizeBytes: string;
  durationMs: number | null;
  width: number | null;
  height: number | null;
  createdAt: string;
}

export interface JobDto {
  id: string;
  projectId: string;
  type: JobType;
  status: JobStatus;
  progress: number;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApiErrorBody {
  statusCode: number;
  message: string | string[];
  error?: string;
}
