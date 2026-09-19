/** Stable Phase 5.2 default — must match docs/development/PORTS.md */
export const EXPECTED_API_SERVICE = "sarupak-api";
export const EXPECTED_API_DEV_PORT = 4003;

const API_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ??
  `http://localhost:${EXPECTED_API_DEV_PORT}/v1`;

const TOKEN_KEY = "sarupak_access_token";

export function getApiBaseUrl() {
  return API_URL;
}

export interface ApiHealthInfo {
  status: string;
  service: string;
  name?: string;
  version?: string;
  phase?: string;
  port?: number;
  expectedDevPort?: number;
  timestamp?: string;
}

/**
 * Confirms the configured base URL speaks SARUPAK — not Norng or a stale build.
 */
export function isLocalhostApiUrl(url: string = API_URL): boolean {
  try {
    const host = new URL(url).hostname;
    return host === "localhost" || host === "127.0.0.1";
  } catch {
    return false;
  }
}

export function isBrowserOnDeployedHost(): boolean {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname;
  return host !== "localhost" && host !== "127.0.0.1";
}

function isRailwayApiUrl(url: string = API_URL): boolean {
  try {
    return new URL(url).hostname.endsWith(".up.railway.app");
  } catch {
    return false;
  }
}

export async function verifyExpectedApi(): Promise<ApiHealthInfo> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/health`, { cache: "no-store" });
  } catch {
    if (isBrowserOnDeployedHost() && isLocalhostApiUrl()) {
      throw new ApiError(
        0,
        `Studio API is not available on this hosted site. NEXT_PUBLIC_API_URL points at ${API_URL} (your machine). Creative tools on this site still work; for Studio, run the Nest API locally (npm run dev:api) and open http://127.0.0.1:3010/studio, or set NEXT_PUBLIC_API_URL to a deployed sarupak-api and redeploy.`,
        null,
      );
    }
    if (isRailwayApiUrl()) {
      throw new ApiError(
        0,
        `Cannot reach Railway API at ${API_URL}. Deploy logs may show Nest listening, but the public domain Target port must match that port (often 8080): Railway → API service → Settings → Networking → Public Networking. Browser “CORS” errors on this URL usually mean Railway returned 502, not a Nest CORS misconfig.`,
        null,
      );
    }
    throw new ApiError(
      0,
      `Cannot reach SARUPAK API at ${API_URL}. Start it with: npm run dev:api (port ${EXPECTED_API_DEV_PORT}).`,
      null,
    );
  }
  const body = (await res.json().catch(() => null)) as ApiHealthInfo | null;
  if (!res.ok || !body) {
    const railwayHint = isRailwayApiUrl()
      ? ` If this is Railway, set the public domain Target port to the listen port from Deploy Logs (often 8080).`
      : ` Is SARUPAK API running on port ${EXPECTED_API_DEV_PORT}?`;
    throw new ApiError(
      res.status,
      `API health failed at ${API_URL}/health (HTTP ${res.status}).${railwayHint}`,
      body,
    );
  }
  const service = body.service ?? body.name;
  if (service !== EXPECTED_API_SERVICE) {
    throw new ApiError(
      502,
      `Wrong API at ${API_URL}: expected service "${EXPECTED_API_SERVICE}", got "${String(service)}". Check PORTS.md — :4000 is often another app.`,
      body,
    );
  }
  if (!body.version) {
    throw new ApiError(
      502,
      `Stale or non-SARUPAK API at ${API_URL}: health is missing version. Stop old processes on :4002/:4003 and start a fresh Phase 5.2+ API.`,
      body,
    );
  }
  return body;
}

export function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

/** Authenticated media stream URL for <video>/<audio>/waveform (query token). */
export function mediaContentUrl(projectId: string, assetId: string): string {
  const token = getStoredToken();
  return `${getApiBaseUrl()}/projects/${projectId}/media/${assetId}/content?token=${encodeURIComponent(token ?? "")}`;
}

export function setStoredToken(token: string | null) {
  if (typeof window === "undefined") return;
  if (!token) {
    window.localStorage.removeItem(TOKEN_KEY);
    return;
  }
  window.localStorage.setItem(TOKEN_KEY, token);
}

export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(status: number, message: string, body: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

async function parseBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  const token = getStoredToken();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(`${API_URL}${path.startsWith("/") ? path : `/${path}`}`, {
    ...init,
    headers,
  });

  const body = await parseBody(res);
  if (!res.ok) {
    const message =
      typeof body === "object" &&
      body &&
      "message" in body &&
      (typeof (body as { message: unknown }).message === "string" ||
        Array.isArray((body as { message: unknown }).message))
        ? Array.isArray((body as { message: unknown }).message)
          ? ((body as { message: string[] }).message).join(", ")
          : ((body as { message: string }).message)
        : res.statusText || "Request failed";
    throw new ApiError(res.status, message, body);
  }
  return body as T;
}

export interface AuthResponse {
  accessToken: string;
  user: {
    id: string;
    email: string;
    displayName: string | null;
    createdAt: string;
  };
}

export interface Project {
  id: string;
  name: string;
  schemaVersion: number;
  width: number;
  height: number;
  frameRate: number;
  durationMs: number;
  timeline: unknown;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface MediaAsset {
  id: string;
  projectId: string;
  kind: string;
  originalName: string;
  mimeType: string;
  sizeBytes: string;
  durationMs: number | null;
  width: number | null;
  height: number | null;
  createdAt: string;
}

export interface Job {
  id: string;
  projectId: string;
  type: string;
  status: string;
  progress: number;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SubtitleSegment {
  id: string;
  startMs: number;
  endMs: number;
  text: string;
  speakerId?: string;
}

export interface SubtitleSet {
  id: string;
  projectId: string;
  language: string;
  segments: SubtitleSegment[];
  style: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface VoiceCharacter {
  id: string;
  name: string;
  genderLabel?: string;
  language: string;
  provider: string;
  providerVoiceId: string;
  style: string;
  pitch: number;
  speakingRate: number;
  enabled: boolean;
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
  status: string;
  errorMessage?: string;
  warnings: string[];
}

export interface DubbingSession {
  id: string;
  projectId: string;
  mediaAssetId: string;
  subtitleSetId?: string;
  sourceLanguage: string;
  targetLanguage: string;
  status: string;
  mixMode: "replace_dialogue" | "mix" | "dialogue_only" | "original_only";
  ttsProvider?: string | null;
  dialogueVolume: number;
  backgroundVolume: number;
  speakers: Array<{
    speakerId: string;
    displayName: string;
    voiceCharacterId?: string;
  }>;
  voiceAssignments: Array<{
    speakerId: string;
    voiceCharacterId: string;
    referenceMediaAssetId?: string;
    referenceText?: string;
  }>;
  segments: DialogueSegment[];
  separation?: {
    provider: string;
    available: boolean;
    warning?: string;
  };
  extractedAudioMediaId?: string;
  mixedVideoMediaId?: string;
  warnings: string[];
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
}

export const api = {
  register(input: { email: string; password: string; displayName?: string }) {
    return apiFetch<AuthResponse>("/auth/register", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
  login(input: { email: string; password: string }) {
    return apiFetch<AuthResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
  me() {
    return apiFetch<AuthResponse["user"]>("/auth/me");
  },
  listProjects() {
    return apiFetch<Project[]>("/projects");
  },
  createProject(input: { name: string; width?: number; height?: number }) {
    return apiFetch<Project>("/projects", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
  getProject(id: string) {
    return apiFetch<Project>(`/projects/${id}`);
  },
  updateProject(
    id: string,
    input: {
      name?: string;
      timeline?: unknown;
      durationMs?: number;
      createSnapshot?: boolean;
      snapshotLabel?: string;
    },
  ) {
    return apiFetch<Project>(`/projects/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  },
  deleteProject(id: string) {
    return apiFetch<{ ok: boolean }>(`/projects/${id}`, { method: "DELETE" });
  },
  listMedia(projectId: string) {
    return apiFetch<MediaAsset[]>(`/projects/${projectId}/media`);
  },
  uploadMedia(projectId: string, file: File) {
    const form = new FormData();
    form.append("file", file);
    return apiFetch<MediaAsset>(`/projects/${projectId}/media`, {
      method: "POST",
      body: form,
    });
  },
  startExport(projectId: string, aspect: "16:9" | "9:16" | "1:1" = "16:9") {
    return apiFetch<Job>(`/projects/${projectId}/export`, {
      method: "POST",
      body: JSON.stringify({ aspect }),
    });
  },
  getJob(jobId: string) {
    return apiFetch<Job>(`/jobs/${jobId}`);
  },
  subtitleProviders(projectId: string) {
    return apiFetch<{
      mock: boolean;
      openaiWhisper: boolean;
      whisperCli: boolean;
      silenceSegments: boolean;
      active: string;
      supportedAsrLanguages?: string[];
      translate?: {
        active: string;
        openaiConfigured: boolean;
        targetLanguages: string[];
        notes: string[];
      };
    }>(`/projects/${projectId}/subtitles/providers`);
  },
  listSubtitles(projectId: string) {
    return apiFetch<SubtitleSet[]>(`/projects/${projectId}/subtitles`);
  },
  generateSubtitles(
    projectId: string,
    input: { mediaAssetId: string; language?: string },
  ) {
    return apiFetch<{
      subtitleSet: SubtitleSet;
      provider: string;
      transcribed: boolean;
      warnings: string[];
    }>(`/projects/${projectId}/subtitles/generate`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
  translateSubtitlesToKhmer(projectId: string, setId: string) {
    return apiFetch<{
      subtitleSet: SubtitleSet;
      sourceSetId: string;
      provider: string;
      warnings: string[];
      jobId: string;
    }>(`/projects/${projectId}/subtitles/${setId}/translate`, {
      method: "POST",
      body: JSON.stringify({ targetLanguage: "km" }),
    });
  },
  patchSubtitleSegment(
    projectId: string,
    setId: string,
    segmentId: string,
    patch: { text?: string; startMs?: number; endMs?: number },
  ) {
    return apiFetch<SubtitleSet>(
      `/projects/${projectId}/subtitles/${setId}/segments/${segmentId}`,
      {
        method: "PATCH",
        body: JSON.stringify(patch),
      },
    );
  },
  splitSubtitle(
    projectId: string,
    setId: string,
    input: { segmentId: string; atMs: number },
  ) {
    return apiFetch<SubtitleSet>(
      `/projects/${projectId}/subtitles/${setId}/split`,
      {
        method: "POST",
        body: JSON.stringify(input),
      },
    );
  },
  mergeSubtitles(
    projectId: string,
    setId: string,
    input: { leftId: string; rightId: string },
  ) {
    return apiFetch<SubtitleSet>(
      `/projects/${projectId}/subtitles/${setId}/merge`,
      {
        method: "POST",
        body: JSON.stringify(input),
      },
    );
  },
  burnInSubtitles(projectId: string, setId: string, mediaAssetId: string) {
    return apiFetch<Job>(`/projects/${projectId}/subtitles/${setId}/burn-in`, {
      method: "POST",
      body: JSON.stringify({ mediaAssetId }),
    });
  },
  dubbingProviders(projectId: string) {
    return apiFetch<{
      tts: {
        active: string | null;
        openaiConfigured?: boolean;
        sotakaConfigured?: boolean;
        suggestedProvider?: string | null;
        policy?: {
          silentMockFallback: boolean;
          mockRequiresExplicitSelection: boolean;
          khmerClaimed: boolean;
        };
        providers: Array<{
          provider: string;
          available: boolean;
          isMock: boolean;
          state?: string;
          languages?: string[];
          voices?: string[];
          outputFormats?: string[];
          maxChars?: number;
          notes?: string[];
          apiKeyConfigured?: boolean;
        }>;
      };
      separation: { active: string; trueIsolation: boolean; note?: string };
      diarization: { active: string };
      consentNote: string;
    }>(`/projects/${projectId}/dubbing/providers`);
  },
  dubbingVoices(projectId: string) {
    return apiFetch<VoiceCharacter[]>(`/projects/${projectId}/dubbing/voices`);
  },
  listDubbingSessions(projectId: string) {
    return apiFetch<DubbingSession[]>(`/projects/${projectId}/dubbing/sessions`);
  },
  createDubbingSession(
    projectId: string,
    input: {
      mediaAssetId: string;
      subtitleSetId?: string;
      sourceLanguage?: string;
      targetLanguage?: string;
      ttsProvider?: "openai-tts" | "mock" | "sotaka-tts";
    },
  ) {
    return apiFetch<DubbingSession>(`/projects/${projectId}/dubbing/sessions`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
  getDubbingSession(projectId: string, sessionId: string) {
    return apiFetch<DubbingSession>(
      `/projects/${projectId}/dubbing/sessions/${sessionId}`,
    );
  },
  updateDubbingSession(
    projectId: string,
    sessionId: string,
    patch: {
      mixMode?: DubbingSession["mixMode"];
      ttsProvider?: "openai-tts" | "mock" | "sotaka-tts";
      dialogueVolume?: number;
      backgroundVolume?: number;
      targetLanguage?: string;
      segments?: Array<{
        id: string;
        translatedText?: string;
        speakerId?: string;
        voiceCharacterId?: string;
      }>;
    },
  ) {
    return apiFetch<{ session: DubbingSession; timing: unknown }>(
      `/projects/${projectId}/dubbing/sessions/${sessionId}`,
      {
        method: "PATCH",
        body: JSON.stringify(patch),
      },
    ).then((r) => r.session);
  },
  extractDubbingAudio(projectId: string, sessionId: string) {
    return apiFetch<{ session: DubbingSession; jobId: string }>(
      `/projects/${projectId}/dubbing/sessions/${sessionId}/extract-audio`,
      { method: "POST", body: "{}" },
    );
  },
  separateDubbingAudio(projectId: string, sessionId: string) {
    return apiFetch<{ session: DubbingSession; jobId: string }>(
      `/projects/${projectId}/dubbing/sessions/${sessionId}/separate`,
      { method: "POST", body: "{}" },
    );
  },
  diarizeDubbing(projectId: string, sessionId: string) {
    return apiFetch<{ session: DubbingSession; jobId: string; isMock: boolean }>(
      `/projects/${projectId}/dubbing/sessions/${sessionId}/diarize`,
      { method: "POST", body: "{}" },
    );
  },
  assignDubbingVoice(
    projectId: string,
    sessionId: string,
    input: {
      speakerId: string;
      voiceCharacterId: string;
      referenceMediaAssetId?: string;
      referenceText?: string;
    },
  ) {
    return apiFetch<DubbingSession>(
      `/projects/${projectId}/dubbing/sessions/${sessionId}/assign-voice`,
      { method: "POST", body: JSON.stringify(input) },
    );
  },
  generateDubbingTts(
    projectId: string,
    sessionId: string,
    input: {
      segmentIds?: string[];
      speakingRate?: number;
      ttsProvider?: "openai-tts" | "mock" | "sotaka-tts";
    },
  ) {
    return apiFetch<{
      session: DubbingSession;
      jobId: string;
      timing: unknown;
    }>(`/projects/${projectId}/dubbing/sessions/${sessionId}/generate-tts`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
  exportDubbing(projectId: string, sessionId: string) {
    return apiFetch<{ jobId: string; job: Job }>(
      `/projects/${projectId}/dubbing/sessions/${sessionId}/export`,
      { method: "POST", body: "{}" },
    );
  },
};
