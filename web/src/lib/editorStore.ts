"use client";

import { create } from "zustand";
import type { TimelineDocumentV1, TimelineClip } from "@sarupak/shared-types";
import {
  TimelineHistory,
  addClip,
  computeTimelineDurationMs,
  deleteClip,
  moveClip,
  setClipVolume,
  setPlayhead,
  setTrackMuted,
  setZoom,
  splitClip,
  trimClip,
  defaultTrackForMedia,
} from "@sarupak/editor-core";

interface EditorStore {
  projectId: string | null;
  timeline: TimelineDocumentV1 | null;
  selectedClipId: string | null;
  isPlaying: boolean;
  pixelsPerSecond: number;
  history: TimelineHistory | null;
  dirty: boolean;
  init: (projectId: string, timeline: TimelineDocumentV1) => void;
  selectClip: (id: string | null) => void;
  setPlaying: (v: boolean) => void;
  scrub: (ms: number) => void;
  commit: (next: TimelineDocumentV1) => void;
  undo: () => void;
  redo: () => void;
  addMediaClip: (input: {
    mediaAssetId: string;
    kind: "VIDEO" | "AUDIO" | "IMAGE";
    label: string;
    durationMs: number;
    startMs?: number;
  }) => void;
  deleteSelected: () => void;
  splitAtPlayhead: () => void;
  trimSelected: (edge: "in" | "out", timelineMs: number) => void;
  moveSelected: (startMs: number) => void;
  beginGesture: () => void;
  liveMoveSelected: (startMs: number) => void;
  liveTrimSelected: (edge: "in" | "out", timelineMs: number) => void;
  endGesture: () => void;
  setVolume: (volume: number) => void;
  toggleMute: (trackId: string) => void;
  zoomBy: (delta: number) => void;
  markSaved: () => void;
  durationMs: () => number;
}

export const useEditorStore = create<EditorStore>((set, get) => ({
  projectId: null,
  timeline: null,
  selectedClipId: null,
  isPlaying: false,
  pixelsPerSecond: 80,
  history: null,
  dirty: false,

  init(projectId, timeline) {
    const history = new TimelineHistory(timeline);
    set({
      projectId,
      timeline: history.state,
      history,
      selectedClipId: null,
      isPlaying: false,
      dirty: false,
      pixelsPerSecond: 80 * (timeline.zoom || 1),
    });
  },

  selectClip(id) {
    set({ selectedClipId: id });
  },

  setPlaying(v) {
    set({ isPlaying: v });
  },

  scrub(ms) {
    const { history } = get();
    if (!history) return;
    const next = setPlayhead(history.state, ms);
    history.replace(next);
    set({ timeline: history.state });
  },

  commit(next) {
    const { history } = get();
    if (!history) return;
    history.commit(next);
    set({ timeline: history.state, dirty: true });
  },

  undo() {
    const { history } = get();
    if (!history?.canUndo) return;
    history.undo();
    set({ timeline: history.state, dirty: true });
  },

  redo() {
    const { history } = get();
    if (!history?.canRedo) return;
    history.redo();
    set({ timeline: history.state, dirty: true });
  },

  addMediaClip(input) {
    const { timeline, commit } = get();
    if (!timeline) return;
    const track = defaultTrackForMedia(timeline, input.kind);
    if (!track) return;
    const startMs =
      input.startMs ??
      Math.max(
        timeline.playheadMs,
        computeTimelineDurationMs(timeline) > 0
          ? computeTimelineDurationMs(timeline)
          : 0,
      );
    commit(
      addClip(timeline, track.id, {
        mediaAssetId: input.mediaAssetId,
        startMs,
        durationMs: input.durationMs,
        trimInMs: 0,
        trimOutMs: input.durationMs,
        volume: 1,
        label: input.label,
      }),
    );
  },

  deleteSelected() {
    const { timeline, selectedClipId, commit } = get();
    if (!timeline || !selectedClipId) return;
    commit(deleteClip(timeline, selectedClipId));
    set({ selectedClipId: null });
  },

  splitAtPlayhead() {
    const { timeline, selectedClipId, commit } = get();
    if (!timeline || !selectedClipId) return;
    commit(splitClip(timeline, selectedClipId, timeline.playheadMs));
  },

  trimSelected(edge, timelineMs) {
    const { timeline, selectedClipId, commit } = get();
    if (!timeline || !selectedClipId) return;
    commit(trimClip(timeline, selectedClipId, edge, timelineMs));
  },

  moveSelected(startMs) {
    const { timeline, selectedClipId, commit } = get();
    if (!timeline || !selectedClipId) return;
    commit(moveClip(timeline, selectedClipId, startMs));
  },

  beginGesture() {
    const { history } = get();
    if (!history) return;
    history.beginGesture();
  },

  liveMoveSelected(startMs) {
    const { history, selectedClipId } = get();
    if (!history || !selectedClipId || !history.gestureOrigin) return;
    history.live(moveClip(history.gestureOrigin, selectedClipId, startMs));
    set({ timeline: history.state, dirty: true });
  },

  liveTrimSelected(edge, timelineMs) {
    const { history, selectedClipId } = get();
    if (!history || !selectedClipId || !history.gestureOrigin) return;
    history.live(trimClip(history.gestureOrigin, selectedClipId, edge, timelineMs));
    set({ timeline: history.state, dirty: true });
  },

  endGesture() {
    const { history } = get();
    if (!history) return;
    history.endGesture();
    set({ timeline: history.state, dirty: true });
  },

  setVolume(volume) {
    const { timeline, selectedClipId, commit } = get();
    if (!timeline || !selectedClipId) return;
    commit(setClipVolume(timeline, selectedClipId, volume));
  },

  toggleMute(trackId) {
    const { timeline, commit } = get();
    if (!timeline) return;
    const track = timeline.tracks.find((t) => t.id === trackId);
    if (!track) return;
    commit(setTrackMuted(timeline, trackId, !track.muted));
  },

  zoomBy(delta) {
    const { timeline, history } = get();
    if (!timeline || !history) return;
    const next = setZoom(timeline, (timeline.zoom || 1) + delta);
    history.replace(next);
    set({
      timeline: history.state,
      pixelsPerSecond: 80 * history.state.zoom,
    });
  },

  markSaved() {
    set({ dirty: false });
  },

  durationMs() {
    const { timeline } = get();
    return timeline ? computeTimelineDurationMs(timeline) : 0;
  },
}));

export function findSelectedClip(
  timeline: TimelineDocumentV1 | null,
  clipId: string | null,
): TimelineClip | null {
  if (!timeline || !clipId) return null;
  for (const t of timeline.tracks) {
    const c = t.clips.find((x) => x.id === clipId);
    if (c) return c;
  }
  return null;
}
