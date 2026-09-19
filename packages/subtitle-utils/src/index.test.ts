import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatTimestampSrt,
  mergeSegments,
  parseSrt,
  splitSegment,
  toSrt,
  toVtt,
  validateSegments,
} from "./index";

describe("subtitle timestamps", () => {
  it("formats SRT timestamps", () => {
    assert.equal(formatTimestampSrt(3661012), "01:01:01,012");
    assert.equal(formatTimestampSrt(0), "00:00:00,000");
  });
});

describe("srt round-trip", () => {
  it("exports and parses SRT", () => {
    const srt = toSrt([
      {
        id: "a",
        startMs: 0,
        endMs: 1500,
        text: "Hello",
      },
      {
        id: "b",
        startMs: 1600,
        endMs: 3000,
        text: "ពិភពលោក",
      },
    ]);
    assert.match(srt, /00:00:00,000 --> 00:00:01,500/);
    assert.match(srt, /ពិភពលោក/);
    const parsed = parseSrt(srt);
    assert.equal(parsed.length, 2);
    assert.equal(parsed[0]!.text, "Hello");
    assert.equal(parsed[1]!.endMs, 3000);
  });

  it("exports VTT header", () => {
    const vtt = toVtt([
      { id: "a", startMs: 0, endMs: 1000, text: "Hi" },
    ]);
    assert.match(vtt, /^WEBVTT/);
    assert.match(vtt, /00:00:00\.000 --> 00:00:01\.000/);
  });
});

describe("segment ops", () => {
  it("splits and merges", () => {
    const base = [
      { id: "a", startMs: 0, endMs: 4000, text: "one two three four" },
    ];
    const split = splitSegment(base, "a", 2000);
    assert.equal(split.length, 2);
    assert.equal(split[0]!.endMs, 2000);
    assert.equal(split[1]!.startMs, 2000);
    const merged = mergeSegments(split, split[0]!.id, split[1]!.id);
    assert.equal(merged.length, 1);
    assert.equal(merged[0]!.endMs, 4000);
  });

  it("rejects invalid timing", () => {
    const result = validateSegments([
      { id: "x", startMs: 1000, endMs: 500, text: "bad" },
    ]);
    assert.equal(result.ok, false);
  });
});
