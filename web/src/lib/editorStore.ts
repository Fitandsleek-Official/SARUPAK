"use client";

import { create } from "zustand";
import type { TimelineDocumentV1, TimelineClip } from "@sarupak/shared-types";
import {
  TimelineHistory,
  addClip,
  computeTimelineDurationMs,
  deleteClip,
  moveClip,
  setClipText as setClipTextOp,
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
  canUndo: boolean;
  canRedo: boolean;
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
  addTextClip: (input: { text: string; durationMs: number }) => void;
  deleteSelected: () => void;
  splitAtPlayhead: () => void;
  trimSelected: (edge: "in" | "out", timelineMs: number) => void;
  moveSelected: (startMs: number) => void;
  beginGesture: () => void;
  liveMoveSelected: (startMs: number) => void;
  liveTrimSelected: (edge: "in" | "out", timelineMs: number) => void;
  endGesture: () => void;
  setVolume: (volume: number) => void;
  setClipText: (text: string) => void;
  toggleMute: (trackId: string) => void;
  zoomBy: (delta: number) => void;
  markSaved: () => void;
  durationMs: () => number;
}

function syncFlags(history: TimelineHistory | null) {
  return {
    canUndo: history?.canUndo ?? false,
    canRedo: history?.canRedo ?? false,
  };
}

export const useEditorStore = create<EditorStore>((set, get) => ({
  projectId: null,
  timeline: null,
  selectedClipId: null,
  isPlaying: false,
  pixelsPerSecond: 80,
  history: null,
  dirty: false,
  canUndo: false,
  canRedo: false,

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
      ...syncFlags(history),
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
    set({ timeline: history.state, ...syncFlags(history) });
  },

  commit(next) {
    const { history } = get();
    if (!history) return;
    history.commit(next);
    set({ timeline: history.state, dirty: true, ...syncFlags(history) });
  },

  undo() {
    const { history } = get();
    if (!history?.canUndo) return;
    history.undo();
    set({ timeline: history.state, dirty: true, ...syncFlags(history) });
  },

  redo() {
    const { history } = get();
    if (!history?.canRedo) return;
    history.redo();
    set({ timeline: history.state, dirty: true, ...syncFlags(history) });
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

  addTextClip(input) {
    const { timeline, commit } = get();
    if (!timeline) return;
    const track =
      timeline.tracks.find((t) => t.kind === "captions") ??
      timeline.tracks.find((t) => t.kind === "text");
    if (!track) return;
    commit(
      addClip(timeline, track.id, {
        startMs: timeline.playheadMs,
        durationMs: input.durationMs,
        trimInMs: 0,
        trimOutMs: input.durationMs,
        volume: 1,
        label: input.text.slice(0, 48),
        text: input.text,
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
    set({ timeline: history.state, dirty: true, ...syncFlags(history) });
  },

  liveTrimSelected(edge, timelineMs) {
    const { history, selectedClipId } = get();
    if (!history || !selectedClipId || !history.gestureOrigin) return;
    history.live(trimClip(history.gestureOrigin, selectedClipId, edge, timelineMs));
    set({ timeline: history.state, dirty: true, ...syncFlags(history) });
  },

  endGesture() {
    const { history } = get();
    if (!history) return;
    history.endGesture();
    set({ timeline: history.state, dirty: true, ...syncFlags(history) });
  },

  setVolume(volume) {
    const { timeline, selectedClipId, commit } = get();
    if (!timeline || !selectedClipId) return;
    commit(setClipVolume(timeline, selectedClipId, volume));
  },

  setClipText(text) {
    const { timeline, selectedClipId, commit } = get();
    if (!timeline || !selectedClipId) return;
    commit(setClipTextOp(timeline, selectedClipId, text));
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
      ...syncFlags(history),
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
