import type {
  TimelineClip,
  TimelineDocumentV1,
  TimelineTrack,
  TrackKind,
} from "@sarupak/shared-types";
import { createEmptyTimeline } from "@sarupak/shared-types";

export type { TimelineClip, TimelineDocumentV1, TimelineTrack, TrackKind };
export { createEmptyTimeline };

export function newId(prefix = "id"): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function cloneTimeline(doc: TimelineDocumentV1): TimelineDocumentV1 {
  return structuredClone(doc);
}

export function findTrack(
  doc: TimelineDocumentV1,
  trackId: string,
): TimelineTrack | undefined {
  return doc.tracks.find((t) => t.id === trackId);
}

export function findClip(
  doc: TimelineDocumentV1,
  clipId: string,
): { track: TimelineTrack; clip: TimelineClip; index: number } | null {
  for (const track of doc.tracks) {
    const index = track.clips.findIndex((c) => c.id === clipId);
    if (index >= 0) {
      return { track, clip: track.clips[index]!, index };
    }
  }
  return null;
}

export function computeTimelineDurationMs(doc: TimelineDocumentV1): number {
  let max = 0;
  for (const track of doc.tracks) {
    for (const clip of track.clips) {
      max = Math.max(max, clip.startMs + clip.durationMs);
    }
  }
  return max;
}

export function clipSourceDurationMs(clip: TimelineClip): number {
  return Math.max(0, clip.trimOutMs - clip.trimInMs);
}

/** Visible media time at a timeline playhead for a clip. */
export function mediaTimeAtPlayhead(clip: TimelineClip, playheadMs: number): number | null {
  if (playheadMs < clip.startMs || playheadMs >= clip.startMs + clip.durationMs) {
    return null;
  }
  return clip.trimInMs + (playheadMs - clip.startMs);
}

export function activeClipsAt(
  doc: TimelineDocumentV1,
  playheadMs: number,
  kinds?: TrackKind[],
): Array<{ track: TimelineTrack; clip: TimelineClip }> {
  const out: Array<{ track: TimelineTrack; clip: TimelineClip }> = [];
  for (const track of doc.tracks) {
    if (kinds && !kinds.includes(track.kind)) continue;
    if (track.muted) continue;
    for (const clip of track.clips) {
      if (
        playheadMs >= clip.startMs &&
        playheadMs < clip.startMs + clip.durationMs
      ) {
        out.push({ track, clip });
      }
    }
  }
  return out;
}

export function addClip(
  doc: TimelineDocumentV1,
  trackId: string,
  clip: Omit<TimelineClip, "id"> & { id?: string },
): TimelineDocumentV1 {
  const next = cloneTimeline(doc);
  const track = findTrack(next, trackId);
  if (!track) {
    throw new Error(`Track not found: ${trackId}`);
  }
  const durationMs =
    clip.durationMs > 0
      ? clip.durationMs
      : Math.max(0, clip.trimOutMs - clip.trimInMs);
  track.clips.push({
    id: clip.id ?? newId("clip"),
    mediaAssetId: clip.mediaAssetId,
    startMs: Math.max(0, Math.round(clip.startMs)),
    durationMs: Math.max(1, Math.round(durationMs)),
    trimInMs: Math.max(0, Math.round(clip.trimInMs)),
    trimOutMs: Math.max(Math.round(clip.trimInMs) + 1, Math.round(clip.trimOutMs)),
    volume: clip.volume ?? 1,
    label: clip.label,
    text: clip.text,
  });
  track.clips.sort((a, b) => a.startMs - b.startMs);
  return next;
}

export function deleteClip(
  doc: TimelineDocumentV1,
  clipId: string,
): TimelineDocumentV1 {
  const next = cloneTimeline(doc);
  for (const track of next.tracks) {
    track.clips = track.clips.filter((c) => c.id !== clipId);
  }
  return next;
}

export function moveClip(
  doc: TimelineDocumentV1,
  clipId: string,
  startMs: number,
  targetTrackId?: string,
): TimelineDocumentV1 {
  const next = cloneTimeline(doc);
  let moving: TimelineClip | null = null;
  let fromTrack: TimelineTrack | null = null;

  for (const track of next.tracks) {
    const idx = track.clips.findIndex((c) => c.id === clipId);
    if (idx >= 0) {
      moving = track.clips[idx]!;
      fromTrack = track;
      track.clips.splice(idx, 1);
      break;
    }
  }
  if (!moving || !fromTrack) {
    throw new Error(`Clip not found: ${clipId}`);
  }

  const dest =
    targetTrackId != null
      ? findTrack(next, targetTrackId)
      : fromTrack;
  if (!dest) {
    throw new Error(`Track not found: ${targetTrackId}`);
  }

  moving.startMs = Math.max(0, Math.round(startMs));
  dest.clips.push(moving);
  dest.clips.sort((a, b) => a.startMs - b.startMs);
  return next;
}

export function trimClip(
  doc: TimelineDocumentV1,
  clipId: string,
  edge: "in" | "out",
  timelineMs: number,
): TimelineDocumentV1 {
  const next = cloneTimeline(doc);
  const found = findClip(next, clipId);
  if (!found) {
    throw new Error(`Clip not found: ${clipId}`);
  }
  const { clip } = found;
  const end = clip.startMs + clip.durationMs;

  if (edge === "in") {
    const newStart = Math.min(Math.max(0, Math.round(timelineMs)), end - 1);
    const delta = newStart - clip.startMs;
    clip.trimInMs = Math.max(0, clip.trimInMs + delta);
    clip.durationMs = end - newStart;
    clip.startMs = newStart;
  } else {
    const newEnd = Math.max(clip.startMs + 1, Math.round(timelineMs));
    const newDuration = newEnd - clip.startMs;
    clip.trimOutMs = clip.trimInMs + newDuration;
    clip.durationMs = newDuration;
  }
  return next;
}

/** Split clip at playhead; returns updated doc (no-op if playhead not inside clip). */
export function splitClip(
  doc: TimelineDocumentV1,
  clipId: string,
  playheadMs: number,
): TimelineDocumentV1 {
  const next = cloneTimeline(doc);
  const found = findClip(next, clipId);
  if (!found) {
    throw new Error(`Clip not found: ${clipId}`);
  }
  const { track, clip, index } = found;
  if (
    playheadMs <= clip.startMs + 1 ||
    playheadMs >= clip.startMs + clip.durationMs - 1
  ) {
    return doc;
  }

  const offset = playheadMs - clip.startMs;
  const left: TimelineClip = {
    ...clip,
    durationMs: offset,
    trimOutMs: clip.trimInMs + offset,
  };
  const right: TimelineClip = {
    ...clip,
    id: newId("clip"),
    startMs: playheadMs,
    durationMs: clip.durationMs - offset,
    trimInMs: clip.trimInMs + offset,
    trimOutMs: clip.trimOutMs,
  };
  track.clips.splice(index, 1, left, right);
  return next;
}

export function setClipVolume(
  doc: TimelineDocumentV1,
  clipId: string,
  volume: number,
): TimelineDocumentV1 {
  const next = cloneTimeline(doc);
  const found = findClip(next, clipId);
  if (!found) {
    throw new Error(`Clip not found: ${clipId}`);
  }
  found.clip.volume = Math.min(2, Math.max(0, volume));
  return next;
}

export function setTrackMuted(
  doc: TimelineDocumentV1,
  trackId: string,
  muted: boolean,
): TimelineDocumentV1 {
  const next = cloneTimeline(doc);
  const track = findTrack(next, trackId);
  if (!track) throw new Error(`Track not found: ${trackId}`);
  track.muted = muted;
  return next;
}

export function setTrackSolo(
  doc: TimelineDocumentV1,
  trackId: string,
  solo: boolean,
): TimelineDocumentV1 {
  const next = cloneTimeline(doc);
  const track = findTrack(next, trackId);
  if (!track) throw new Error(`Track not found: ${trackId}`);
  track.solo = solo;
  return next;
}

export function setPlayhead(
  doc: TimelineDocumentV1,
  playheadMs: number,
): TimelineDocumentV1 {
  const next = cloneTimeline(doc);
  next.playheadMs = Math.max(0, Math.round(playheadMs));
  return next;
}

export function setZoom(doc: TimelineDocumentV1, zoom: number): TimelineDocumentV1 {
  const next = cloneTimeline(doc);
  next.zoom = Math.min(8, Math.max(0.25, zoom));
  return next;
}

export function defaultTrackForMedia(
  doc: TimelineDocumentV1,
  kind: "VIDEO" | "AUDIO" | "IMAGE",
): TimelineTrack | undefined {
  if (kind === "AUDIO") {
    return doc.tracks.find((t) => t.kind === "audio");
  }
  return doc.tracks.find((t) => t.kind === "video");
}

export class TimelineHistory {
  private past: TimelineDocumentV1[] = [];
  private future: TimelineDocumentV1[] = [];
  private current: TimelineDocumentV1;
  private gestureBase: TimelineDocumentV1 | null = null;

  constructor(initial: TimelineDocumentV1) {
    this.current = cloneTimeline(initial);
  }

  get state(): TimelineDocumentV1 {
    return this.current;
  }

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }

  get gestureOrigin(): TimelineDocumentV1 | null {
    return this.gestureBase ? cloneTimeline(this.gestureBase) : null;
  }

  commit(next: TimelineDocumentV1): TimelineDocumentV1 {
    this.past.push(cloneTimeline(this.current));
    if (this.past.length > 100) this.past.shift();
    this.current = cloneTimeline(next);
    this.future = [];
    this.gestureBase = null;
    return this.current;
  }

  /** Non-undoable updates (playhead scrub). */
  replace(next: TimelineDocumentV1): TimelineDocumentV1 {
    this.current = cloneTimeline(next);
    return this.current;
  }

  /** Start a drag gesture — one undo step for the whole gesture. */
  beginGesture(): TimelineDocumentV1 {
    this.gestureBase = cloneTimeline(this.current);
    return this.current;
  }

  /** Live preview during gesture (does not push undo). */
  live(next: TimelineDocumentV1): TimelineDocumentV1 {
    this.current = cloneTimeline(next);
    return this.current;
  }

  /** Finalize gesture as a single undoable step. */
  endGesture(): TimelineDocumentV1 {
    if (this.gestureBase) {
      this.past.push(this.gestureBase);
      if (this.past.length > 100) this.past.shift();
      this.future = [];
      this.gestureBase = null;
    }
    return this.current;
  }

  undo(): TimelineDocumentV1 {
    this.gestureBase = null;
    const prev = this.past.pop();
    if (!prev) return this.current;
    this.future.push(cloneTimeline(this.current));
    this.current = prev;
    return this.current;
  }

  redo(): TimelineDocumentV1 {
    this.gestureBase = null;
    const nxt = this.future.pop();
    if (!nxt) return this.current;
    this.past.push(cloneTimeline(this.current));
    this.current = nxt;
    return this.current;
  }
}
