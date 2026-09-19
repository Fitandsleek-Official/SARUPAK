import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertTextLength,
  clampSpeakingRate,
  segmentsFromSubtitles,
  validateTiming,
  MAX_SPEAKING_RATE,
} from "./index";

describe("dubbing-core timing", () => {
  it("builds segments from subtitles", () => {
    const segs = segmentsFromSubtitles([
      { id: "c1", startMs: 0, endMs: 1000, text: "Hello" },
      { id: "c2", startMs: 1200, endMs: 2000, text: "World", speakerId: "spk2" },
    ]);
    assert.equal(segs.length, 2);
    assert.equal(segs[0]!.sourceSubtitleCueId, "c1");
    assert.equal(segs[1]!.speakerId, "spk2");
  });

  it("flags overlaps and negative duration", () => {
    const result = validateTiming([
      {
        id: "a",
        sourceText: "a",
        translatedText: "a",
        startMs: 0,
        endMs: 1500,
        status: "pending",
        warnings: [],
      },
      {
        id: "b",
        sourceText: "b",
        translatedText: "b",
        startMs: 1000,
        endMs: 2000,
        status: "pending",
        warnings: [],
      },
      {
        id: "c",
        sourceText: "c",
        translatedText: "c",
        startMs: 3000,
        endMs: 2500,
        status: "pending",
        warnings: [],
      },
    ]);
    assert.equal(result.ok, false);
    assert.ok(result.issues.some((i) => i.code === "overlap"));
    assert.ok(result.issues.some((i) => i.code === "negative_duration"));
  });

  it("suggests rate when audio is too long", () => {
    const result = validateTiming([
      {
        id: "a",
        sourceText: "a",
        translatedText: "a",
        startMs: 0,
        endMs: 1000,
        audioDurationMs: 1200,
        status: "ready",
        warnings: [],
      },
    ]);
    assert.equal(result.ok, true);
    assert.ok(result.issues.some((i) => i.code === "audio_too_long"));
    assert.ok(result.suggestedRates.a! > 1);
  });

  it("warns when rate would exceed max", () => {
    const result = validateTiming([
      {
        id: "a",
        sourceText: "a",
        translatedText: "a",
        startMs: 0,
        endMs: 500,
        audioDurationMs: 2000,
        status: "ready",
        warnings: [],
      },
    ]);
    assert.ok(result.issues.some((i) => i.code === "impossible_rate"));
    assert.equal(result.suggestedRates.a, MAX_SPEAKING_RATE);
  });

  it("clamps speaking rate and enforces text length", () => {
    assert.equal(clampSpeakingRate(3), MAX_SPEAKING_RATE);
    assert.throws(() => assertTextLength(""));
    assert.throws(() => assertTextLength("x".repeat(5000)));
  });
});
