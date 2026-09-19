import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  TimelineHistory,
  addClip,
  computeTimelineDurationMs,
  createEmptyTimeline,
  deleteClip,
  mediaTimeAtPlayhead,
  moveClip,
  setClipText,
  splitClip,
  trimClip,
} from "./index";

describe("timeline ops", () => {
  it("adds clip and computes duration", () => {
    let doc = createEmptyTimeline();
    const video = doc.tracks.find((t) => t.kind === "video")!;
    doc = addClip(doc, video.id, {
      mediaAssetId: "m1",
      startMs: 1000,
      durationMs: 5000,
      trimInMs: 0,
      trimOutMs: 5000,
      volume: 1,
      label: "A",
    });
    assert.equal(computeTimelineDurationMs(doc), 6000);
    assert.equal(doc.tracks.find((t) => t.id === video.id)!.clips.length, 1);
  });

  it("trims in and out", () => {
    let doc = createEmptyTimeline();
    const video = doc.tracks.find((t) => t.kind === "video")!;
    doc = addClip(doc, video.id, {
      id: "c1",
      startMs: 0,
      durationMs: 4000,
      trimInMs: 0,
      trimOutMs: 4000,
      volume: 1,
    });
    doc = trimClip(doc, "c1", "in", 1000);
    const clip = doc.tracks.find((t) => t.id === video.id)!.clips[0]!;
    assert.equal(clip.startMs, 1000);
    assert.equal(clip.durationMs, 3000);
    assert.equal(clip.trimInMs, 1000);

    doc = trimClip(doc, "c1", "out", 2500);
    const clipped = doc.tracks.find((t) => t.id === video.id)!.clips[0]!;
    assert.equal(clipped.durationMs, 1500);
    assert.equal(clipped.trimOutMs, 2500);
  });

  it("splits clip at playhead", () => {
    let doc = createEmptyTimeline();
    const video = doc.tracks.find((t) => t.kind === "video")!;
    doc = addClip(doc, video.id, {
      id: "c1",
      startMs: 0,
      durationMs: 4000,
      trimInMs: 0,
      trimOutMs: 4000,
      volume: 1,
    });
    doc = splitClip(doc, "c1", 1500);
    const clips = doc.tracks.find((t) => t.id === video.id)!.clips;
    assert.equal(clips.length, 2);
    assert.equal(clips[0]!.durationMs, 1500);
    assert.equal(clips[1]!.startMs, 1500);
    assert.equal(clips[1]!.durationMs, 2500);
    assert.equal(clips[1]!.trimInMs, 1500);
  });

  it("moves and deletes", () => {
    let doc = createEmptyTimeline();
    const video = doc.tracks.find((t) => t.kind === "video")!;
    doc = addClip(doc, video.id, {
      id: "c1",
      startMs: 0,
      durationMs: 2000,
      trimInMs: 0,
      trimOutMs: 2000,
      volume: 1,
    });
    doc = moveClip(doc, "c1", 3000);
    assert.equal(findStart(doc, "c1"), 3000);
    doc = deleteClip(doc, "c1");
    assert.equal(doc.tracks.find((t) => t.id === video.id)!.clips.length, 0);
  });

  it("maps playhead to media time", () => {
    const clip = {
      id: "c1",
      startMs: 1000,
      durationMs: 2000,
      trimInMs: 500,
      trimOutMs: 2500,
      volume: 1,
    };
    assert.equal(mediaTimeAtPlayhead(clip, 1500), 1000);
    assert.equal(mediaTimeAtPlayhead(clip, 500), null);
  });

  it("undo / redo history", () => {
    const history = new TimelineHistory(createEmptyTimeline());
    const video = history.state.tracks.find((t) => t.kind === "video")!;
    history.commit(
      addClip(history.state, video.id, {
        id: "c1",
        startMs: 0,
        durationMs: 1000,
        trimInMs: 0,
        trimOutMs: 1000,
        volume: 1,
      }),
    );
    assert.equal(history.state.tracks.find((t) => t.id === video.id)!.clips.length, 1);
    history.undo();
    assert.equal(history.state.tracks.find((t) => t.id === video.id)!.clips.length, 0);
    history.redo();
    assert.equal(history.state.tracks.find((t) => t.id === video.id)!.clips.length, 1);
  });

  it("supports multiple clips and gesture undo", () => {
    let doc = createEmptyTimeline();
    const video = doc.tracks.find((t) => t.kind === "video")!;
    doc = addClip(doc, video.id, {
      id: "c1",
      mediaAssetId: "m1",
      startMs: 0,
      durationMs: 2000,
      trimInMs: 0,
      trimOutMs: 2000,
      volume: 1,
    });
    doc = addClip(doc, video.id, {
      id: "c2",
      mediaAssetId: "m2",
      startMs: 2500,
      durationMs: 1500,
      trimInMs: 0,
      trimOutMs: 1500,
      volume: 1,
    });
    assert.equal(doc.tracks.find((t) => t.id === video.id)!.clips.length, 2);
    assert.equal(computeTimelineDurationMs(doc), 4000);

    const history = new TimelineHistory(doc);
    history.beginGesture();
    history.live(moveClip(history.gestureOrigin!, "c2", 3000));
    history.live(moveClip(history.gestureOrigin!, "c2", 3500));
    history.endGesture();
    assert.equal(findStart(history.state, "c2"), 3500);
    history.undo();
    assert.equal(findStart(history.state, "c2"), 2500);
  });

  it("sets clip text and label", () => {
    let doc = createEmptyTimeline();
    const captions = doc.tracks.find((t) => t.kind === "captions")!;
    doc = addClip(doc, captions.id, {
      id: "t1",
      startMs: 0,
      durationMs: 2000,
      trimInMs: 0,
      trimOutMs: 2000,
      volume: 1,
      text: "Hello",
      label: "Hello",
    });
    doc = setClipText(doc, "t1", "Updated caption");
    const updated = doc.tracks.find((t) => t.kind === "captions")!.clips[0]!;
    assert.equal(updated.text, "Updated caption");
    assert.equal(updated.label, "Updated caption");
  });
});

function findStart(doc: ReturnType<typeof createEmptyTimeline>, id: string) {
  for (const t of doc.tracks) {
    const c = t.clips.find((x) => x.id === id);
    if (c) return c.startMs;
  }
  return -1;
}
