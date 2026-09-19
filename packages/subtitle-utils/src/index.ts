export interface SubtitleSegment {
  id: string;
  startMs: number;
  endMs: number;
  text: string;
  speakerId?: string;
}

export interface SubtitleStyle {
  fontSize: number;
  fontColor: string;
  backgroundColor: string;
  position: "bottom" | "top";
  bold: boolean;
}

export const DEFAULT_SUBTITLE_STYLE: SubtitleStyle = {
  fontSize: 42,
  fontColor: "#FFFFFF",
  backgroundColor: "rgba(0,0,0,0.55)",
  position: "bottom",
  bold: true,
};

export function newSegmentId(): string {
  return `seg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function formatTimestampSrt(ms: number): string {
  const clamped = Math.max(0, Math.round(ms));
  const h = Math.floor(clamped / 3_600_000);
  const m = Math.floor((clamped % 3_600_000) / 60_000);
  const s = Math.floor((clamped % 60_000) / 1000);
  const frac = clamped % 1000;
  return `${pad(h, 2)}:${pad(m, 2)}:${pad(s, 2)},${pad(frac, 3)}`;
}

export function formatTimestampVtt(ms: number): string {
  return formatTimestampSrt(ms).replace(",", ".");
}

function pad(n: number, width: number): string {
  return String(n).padStart(width, "0");
}

export function parseTimestampToMs(value: string): number {
  const normalized = value.trim().replace(",", ".");
  const match = normalized.match(
    /^(?:(\d{1,2}):)?(\d{1,2}):(\d{1,2})(?:\.(\d{1,3}))?$/,
  );
  if (!match) {
    throw new Error(`Invalid timestamp: ${value}`);
  }
  const h = Number(match[1] ?? 0);
  const m = Number(match[2]);
  const s = Number(match[3]);
  const frac = (match[4] ?? "0").padEnd(3, "0");
  return ((h * 60 + m) * 60 + s) * 1000 + Number(frac);
}

export function toSrt(segments: SubtitleSegment[]): string {
  const sorted = sortSegments(segments);
  return sorted
    .map((seg, i) => {
      const text = seg.text.trim() || "…";
      return `${i + 1}\n${formatTimestampSrt(seg.startMs)} --> ${formatTimestampSrt(seg.endMs)}\n${text}\n`;
    })
    .join("\n");
}

export function toVtt(segments: SubtitleSegment[]): string {
  const sorted = sortSegments(segments);
  const body = sorted
    .map((seg) => {
      const text = seg.text.trim() || "…";
      return `${formatTimestampVtt(seg.startMs)} --> ${formatTimestampVtt(seg.endMs)}\n${text}\n`;
    })
    .join("\n");
  return `WEBVTT\n\n${body}`;
}

export function parseSrt(content: string): SubtitleSegment[] {
  const blocks = content
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean);

  const segments: SubtitleSegment[] = [];
  for (const block of blocks) {
    const lines = block.split("\n");
    const timeLineIdx = lines.findIndex((l) => l.includes("-->"));
    if (timeLineIdx < 0) continue;
    const [startRaw, endRaw] = lines[timeLineIdx]!.split("-->").map((s) =>
      s.trim(),
    );
    const text = lines.slice(timeLineIdx + 1).join("\n").trim();
    segments.push({
      id: newSegmentId(),
      startMs: parseTimestampToMs(startRaw!),
      endMs: parseTimestampToMs(endRaw!),
      text,
    });
  }
  return sortSegments(segments);
}

export function sortSegments(segments: SubtitleSegment[]): SubtitleSegment[] {
  return segments.slice().sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
}

export function validateSegments(
  segments: SubtitleSegment[],
): { ok: true } | { ok: false; reason: string } {
  for (const seg of segments) {
    if (seg.endMs <= seg.startMs) {
      return {
        ok: false,
        reason: `Segment ${seg.id} has invalid timing (${seg.startMs}–${seg.endMs}).`,
      };
    }
    if (seg.startMs < 0 || seg.endMs < 0) {
      return { ok: false, reason: `Segment ${seg.id} has negative timing.` };
    }
  }
  return { ok: true };
}

export function splitSegment(
  segments: SubtitleSegment[],
  segmentId: string,
  atMs: number,
): SubtitleSegment[] {
  const sorted = sortSegments(segments);
  const idx = sorted.findIndex((s) => s.id === segmentId);
  if (idx < 0) throw new Error(`Segment not found: ${segmentId}`);
  const seg = sorted[idx]!;
  if (atMs <= seg.startMs + 50 || atMs >= seg.endMs - 50) {
    return sorted;
  }
  const words = seg.text.trim().split(/\s+/).filter(Boolean);
  const mid = Math.max(1, Math.floor(words.length / 2));
  const leftText = words.slice(0, mid).join(" ") || seg.text;
  const rightText = words.slice(mid).join(" ") || "";
  const left: SubtitleSegment = {
    ...seg,
    endMs: atMs,
    text: leftText,
  };
  const right: SubtitleSegment = {
    id: newSegmentId(),
    startMs: atMs,
    endMs: seg.endMs,
    text: rightText,
    speakerId: seg.speakerId,
  };
  sorted.splice(idx, 1, left, right);
  return sorted;
}

export function mergeSegments(
  segments: SubtitleSegment[],
  leftId: string,
  rightId: string,
): SubtitleSegment[] {
  const sorted = sortSegments(segments);
  const leftIdx = sorted.findIndex((s) => s.id === leftId);
  const rightIdx = sorted.findIndex((s) => s.id === rightId);
  if (leftIdx < 0 || rightIdx < 0) {
    throw new Error("Both segments must exist to merge.");
  }
  const a = sorted[Math.min(leftIdx, rightIdx)]!;
  const b = sorted[Math.max(leftIdx, rightIdx)]!;
  const merged: SubtitleSegment = {
    id: a.id,
    startMs: Math.min(a.startMs, b.startMs),
    endMs: Math.max(a.endMs, b.endMs),
    text: [a.text, b.text].map((t) => t.trim()).filter(Boolean).join(" "),
    speakerId: a.speakerId ?? b.speakerId,
  };
  return sorted.filter((s) => s.id !== a.id && s.id !== b.id).concat(merged).sort(
    (x, y) => x.startMs - y.startMs,
  );
}

export function updateSegmentText(
  segments: SubtitleSegment[],
  segmentId: string,
  text: string,
): SubtitleSegment[] {
  return segments.map((s) => (s.id === segmentId ? { ...s, text } : s));
}

export function updateSegmentTiming(
  segments: SubtitleSegment[],
  segmentId: string,
  startMs: number,
  endMs: number,
): SubtitleSegment[] {
  return sortSegments(
    segments.map((s) =>
      s.id === segmentId
        ? { ...s, startMs: Math.max(0, Math.round(startMs)), endMs: Math.max(0, Math.round(endMs)) }
        : s,
    ),
  );
}
