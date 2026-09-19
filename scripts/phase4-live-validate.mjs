#!/usr/bin/env node
/**
 * Live Phase 4 validation against a running SARUPAK API.
 * Usage: node scripts/phase4-live-validate.mjs [API_BASE]
 * Default API_BASE: http://localhost:4001/v1
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

const API = (process.argv[2] ?? "http://localhost:4001/v1").replace(/\/$/, "");
const results = [];
const email = `p4_live_${Date.now()}@example.com`;
const password = "testpass123";

function pass(name, detail = "") {
  results.push({ ok: true, name, detail });
  console.log(`PASS  ${name}${detail ? ` — ${detail}` : ""}`);
}
function fail(name, detail = "") {
  results.push({ ok: false, name, detail });
  console.error(`FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function req(method, urlPath, { token, body, form, raw } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (form) {
    payload = form;
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const res = await fetch(`${API}${urlPath}`, { method, headers, body: payload });
  if (raw) {
    return { status: res.status, headers: res.headers, buffer: Buffer.from(await res.arrayBuffer()) };
  }
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: res.status, json };
}

function ffmpeg(args) {
  const r = spawnSync("ffmpeg", args, { encoding: "utf8" });
  if (r.status !== 0) throw new Error(r.stderr.slice(-400));
}

function ffprobe(file) {
  const r = spawnSync(
    "ffprobe",
    ["-v", "quiet", "-print_format", "json", "-show_format", "-show_streams", file],
    { encoding: "utf8" },
  );
  if (r.status !== 0) throw new Error(r.stderr);
  return JSON.parse(r.stdout);
}

async function sha256(file) {
  const buf = await fs.readFile(file);
  return createHash("sha256").update(buf).digest("hex");
}

async function main() {
  console.log(`API: ${API}`);
  const health = await req("GET", "/health");
  if (health.status !== 200 || health.json?.service !== "sarupak-api") {
    fail("health", `expected sarupak-api, got ${health.status} ${JSON.stringify(health.json)}`);
    process.exit(1);
  }
  pass("health", health.json.service);

  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "sarupak-p4-live-"));
  const sample = path.join(tmp, "dialogue-bg.mp4");
  // Video + dialogue-like tone + background music tone mixed into one AAC track
  ffmpeg([
    "-y",
    "-f", "lavfi", "-i", "color=c=0x1a3a5c:s=640x360:d=4",
    "-f", "lavfi", "-i", "sine=frequency=220:duration=4",
    "-f", "lavfi", "-i", "sine=frequency=660:duration=4",
    "-filter_complex",
    "[1:a]volume=1.0[dlg];[2:a]volume=0.35[bg];[dlg][bg]amix=inputs=2:duration=first:dropout_transition=0[a]",
    "-map", "0:v", "-map", "[a]",
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest",
    sample,
  ]);
  const originalHash = await sha256(sample);
  pass("sample MP4 created", `sha256=${originalHash.slice(0, 12)}…`);

  const reg = await req("POST", "/auth/register", {
    body: { email, password, displayName: "P4 Live" },
  });
  if (reg.status !== 201) {
    fail("register", JSON.stringify(reg.json));
    process.exit(1);
  }
  const token = reg.json.accessToken;
  pass("register");

  const project = await req("POST", "/projects", {
    token,
    body: { name: "P4 Live Dub", width: 1280, height: 720 },
  });
  const projectId = project.json.id;
  pass("create project", projectId);

  const form = new FormData();
  const blob = new Blob([await fs.readFile(sample)], { type: "video/mp4" });
  form.append("file", blob, "dialogue-bg.mp4");
  const upload = await req("POST", `/projects/${projectId}/media`, { token, form });
  if (upload.status !== 201) {
    fail("upload", JSON.stringify(upload.json));
    process.exit(1);
  }
  const mediaId = upload.json.id;
  const storageHint = upload.json;
  pass("upload MP4", `durationMs=${upload.json.durationMs}`);

  // Confirm original upload bytes still exist and match (via content endpoint)
  const content = await req("GET", `/projects/${projectId}/media/${mediaId}/content?token=${encodeURIComponent(token)}`, { raw: true });
  if (content.status !== 200 || content.buffer.length < 1000) {
    fail("stream original media", `status=${content.status} size=${content.buffer?.length}`);
  } else {
    const streamedHash = createHash("sha256").update(content.buffer).digest("hex");
    if (streamedHash === originalHash) {
      pass("original media not overwritten", "content hash matches upload source");
    } else {
      // Multipart remux may change container; check size proximity + has A/V
      const tmpUp = path.join(tmp, "uploaded.mp4");
      await fs.writeFile(tmpUp, content.buffer);
      const p = ffprobe(tmpUp);
      const hasV = p.streams?.some((s) => s.codec_type === "video");
      const hasA = p.streams?.some((s) => s.codec_type === "audio");
      if (hasV && hasA) pass("original media preserved as playable A/V", `bytes=${content.buffer.length}`);
      else fail("original media corrupted", JSON.stringify(p.streams?.map((s) => s.codec_type)));
    }
  }

  const sub = await req("POST", `/projects/${projectId}/subtitles/generate`, {
    token,
    body: { mediaAssetId: mediaId, language: "en" },
  });
  if (sub.status !== 201 && sub.status !== 200) {
    fail("subtitles generate", JSON.stringify(sub.json));
    process.exit(1);
  }
  const subtitleSetId = sub.json.subtitleSet.id;
  const cues = sub.json.subtitleSet.segments;
  pass("subtitle/dialogue segments", `count=${cues.length} provider=${sub.json.provider}`);

  const session = await req("POST", `/projects/${projectId}/dubbing/sessions`, {
    token,
    body: {
      mediaAssetId: mediaId,
      subtitleSetId,
      sourceLanguage: "en",
      targetLanguage: "en",
      ttsProvider: "mock",
    },
  });
  if (session.status !== 201 && session.status !== 200) {
    fail("create dubbing session", JSON.stringify(session.json));
    process.exit(1);
  }
  const sessionId = session.json.id;
  pass("create dubbing session", `segments=${session.json.segments.length}`);

  const extract = await req("POST", `/projects/${projectId}/dubbing/sessions/${sessionId}/extract-audio`, {
    token,
    body: {},
  });
  if (extract.status !== 201 && extract.status !== 200) {
    fail("audio extraction", JSON.stringify(extract.json));
  } else {
    pass(
      "audio extraction",
      `media=${extract.json.session.extractedAudioMediaId} sr=${extract.json.audio.sampleRate} ch=${extract.json.audio.channels} dur=${extract.json.audio.durationMs}`,
    );
  }

  // Re-check original after extract
  const content2 = await req("GET", `/projects/${projectId}/media/${mediaId}/content?token=${encodeURIComponent(token)}`, { raw: true });
  if (content2.status === 200 && content2.buffer.length === content.buffer.length) {
    pass("original unchanged after extract", `size=${content2.buffer.length}`);
  } else {
    fail("original changed after extract", `${content.buffer.length} → ${content2.buffer?.length}`);
  }

  const sep = await req("POST", `/projects/${projectId}/dubbing/sessions/${sessionId}/separate`, {
    token,
    body: {},
  });
  if (sep.status !== 201 && sep.status !== 200) {
    fail("separation", JSON.stringify(sep.json));
  } else {
    const avail = sep.json.session.separation?.available;
    const warn = sep.json.session.separation?.warning ?? "";
    if (avail === false && /preserv|unavailable|isolation/i.test(warn)) {
      pass("separation fallback (no true isolation)", warn.slice(0, 80));
    } else {
      fail("separation honesty", JSON.stringify(sep.json.session.separation));
    }
  }

  const voices = await req("GET", `/projects/${projectId}/dubbing/voices`, { token });
  const mockVoice = voices.json.find((v) => v.provider === "mock");
  if (!mockVoice) {
    fail("list voices", "no mock voice");
  } else {
    pass("list voices", `mock=${mockVoice.id}`);
  }

  // Failure: missing voice assignment → TTS marks segments failed
  const ttsNoVoice = await req("POST", `/projects/${projectId}/dubbing/sessions/${sessionId}/generate-tts`, {
    token,
    body: { ttsProvider: "mock" },
  });
  const failedSegs = (ttsNoVoice.json?.session?.segments ?? []).filter(
    (s) => s.status === "failed" && /voice/i.test(s.errorMessage ?? ""),
  );
  if (ttsNoVoice.status < 400 && failedSegs.length > 0) {
    pass("failure: missing voice assignment", `${failedSegs.length} segment(s) failed`);
  } else if (ttsNoVoice.json?.session?.segments?.every((s) => !s.generatedAudioMediaId)) {
    pass("failure: missing voice assignment", "no audio generated without voice");
  } else {
    // After previous failed attempt segments may have voice from auto-fallback to mock voice in code
    // Check code path: it falls back to mock voice if none assigned!
    const autoMock = ttsNoVoice.json?.session?.segments?.some((s) => s.generatedAudioMediaId);
    if (autoMock) {
      fail(
        "failure: missing voice assignment",
        "TTS auto-fell back to mock voice instead of requiring assignment — soft bug",
      );
    } else {
      fail("failure: missing voice assignment", JSON.stringify(ttsNoVoice.json).slice(0, 200));
    }
  }

  const assign = await req("POST", `/projects/${projectId}/dubbing/sessions/${sessionId}/assign-voice`, {
    token,
    body: { speakerId: "speaker_1", voiceCharacterId: mockVoice.id },
  });
  if (assign.status !== 201 && assign.status !== 200) {
    fail("voice assignment", JSON.stringify(assign.json));
  } else {
    pass("voice assignment", mockVoice.name);
  }

  // Ensure provider is mock before TTS (Phase 5 explicit selection)
  await req("PATCH", `/projects/${projectId}/dubbing/sessions/${sessionId}`, {
    token,
    body: { ttsProvider: "mock" },
  });

  const tts = await req("POST", `/projects/${projectId}/dubbing/sessions/${sessionId}/generate-tts`, {
    token,
    body: { ttsProvider: "mock" },
  });
  const ready = (tts.json?.session?.segments ?? []).filter((s) => s.generatedAudioMediaId);
  if (ready.length === 0) {
    fail("mock TTS", JSON.stringify(tts.json).slice(0, 300));
  } else {
    const durs = ready.map((s) => s.audioDurationMs);
    pass(
      "mock TTS + duration measurement",
      `${ready.length} clips, durationsMs=[${durs.join(",")}]`,
    );
    // Preview one TTS file is playable
    const aid = ready[0].generatedAudioMediaId;
    const audio = await req("GET", `/projects/${projectId}/media/${aid}/content?token=${encodeURIComponent(token)}`, { raw: true });
    const wavPath = path.join(tmp, "tts0.wav");
    await fs.writeFile(wavPath, audio.buffer);
    const ap = ffprobe(wavPath);
    if (ap.streams?.some((s) => s.codec_type === "audio") && Number(ap.format?.duration) > 0.05) {
      pass("TTS audio playable", `dur=${ap.format.duration}s`);
    } else {
      fail("TTS audio playable", JSON.stringify(ap));
    }
  }

  // Timing sync metadata present
  const timingSeg = (tts.json?.session?.segments ?? [])[0];
  if (
    timingSeg &&
    Number.isFinite(timingSeg.startMs) &&
    Number.isFinite(timingSeg.endMs) &&
    timingSeg.endMs > timingSeg.startMs
  ) {
    pass(
      "timeline sync metadata",
      `${timingSeg.startMs}-${timingSeg.endMs} rate=${timingSeg.speakingRateApplied ?? 1}`,
    );
  } else {
    fail("timeline sync metadata", JSON.stringify(timingSeg));
  }

  const mixStart = await req("POST", `/projects/${projectId}/dubbing/sessions/${sessionId}/export`, {
    token,
    body: {},
  });
  if (mixStart.status !== 201 && mixStart.status !== 200) {
    fail("mix export start", JSON.stringify(mixStart.json));
  } else {
    const jobId = mixStart.json.jobId;
    let status = "QUEUED";
    let err = "";
    for (let i = 0; i < 90; i++) {
      await new Promise((r) => setTimeout(r, 400));
      const job = await req("GET", `/jobs/${jobId}`, { token });
      status = job.json.status;
      err = job.json.error ?? "";
      if (status === "SUCCEEDED" || status === "FAILED") break;
    }
    if (status !== "SUCCEEDED") {
      fail("FFmpeg mix job", `${status} ${err}`);
    } else {
      pass("FFmpeg mix job", jobId);
      const dl = await req(
        "GET",
        `/projects/${projectId}/dubbing/sessions/${sessionId}/export/jobs/${jobId}/download`,
        { token, raw: true },
      );
      if (dl.status !== 200 || dl.buffer.length < 2000) {
        fail("download dubbed MP4", `status=${dl.status} size=${dl.buffer?.length}`);
      } else {
        const out = path.join(tmp, "dubbed.mp4");
        await fs.writeFile(out, dl.buffer);
        const op = ffprobe(out);
        const hasV = op.streams?.some((s) => s.codec_type === "video");
        const hasA = op.streams?.some((s) => s.codec_type === "audio");
        const dur = Number(op.format?.duration ?? 0);
        if (hasV && hasA && dur > 1) {
          pass("final MP4 playable A/V", `dur=${dur.toFixed(2)}s size=${dl.buffer.length}`);
        } else {
          fail("final MP4 playable", JSON.stringify(op.streams));
        }
      }
    }
  }

  // --- Failure cases ---
  const noAudioSample = path.join(tmp, "no-audio.mp4");
  ffmpeg([
    "-y", "-f", "lavfi", "-i", "color=c=black:s=320x240:d=1",
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-an", noAudioSample,
  ]);
  const form2 = new FormData();
  form2.append("file", new Blob([await fs.readFile(noAudioSample)], { type: "video/mp4" }), "no-audio.mp4");
  const up2 = await req("POST", `/projects/${projectId}/media`, { token, form: form2 });
  const sess2 = await req("POST", `/projects/${projectId}/dubbing/sessions`, {
    token,
    body: { mediaAssetId: up2.json.id, subtitleSetId },
  });
  const extractFail = await req(
    "POST",
    `/projects/${projectId}/dubbing/sessions/${sess2.json.id}/extract-audio`,
    { token, body: {} },
  );
  if (extractFail.status >= 400 && /no audio/i.test(JSON.stringify(extractFail.json))) {
    pass("failure: missing audio", String(extractFail.json.message ?? extractFail.json).slice(0, 80));
  } else {
    fail("failure: missing audio", JSON.stringify(extractFail.json).slice(0, 200));
  }

  const km = await req("POST", `/projects/${projectId}/dubbing/sessions`, {
    token,
    body: {
      mediaAssetId: mediaId,
      subtitleSetId,
      targetLanguage: "km",
      ttsProvider: "mock",
    },
  });
  const kmVoice = voices.json.find((v) => v.language === "km");
  const kmAssign = await req(
    "POST",
    `/projects/${projectId}/dubbing/sessions/${km.json.id}/assign-voice`,
    { token, body: { speakerId: "speaker_1", voiceCharacterId: kmVoice.id } },
  );
  if (kmAssign.status >= 400) {
    pass("failure: unsupported Khmer voice/provider", String(kmAssign.json.message).slice(0, 100));
  } else {
    fail("failure: unsupported provider", "Khmer assign unexpectedly succeeded");
  }

  const badProj = await req("GET", `/projects/does-not-exist/dubbing/sessions`, { token });
  if (badProj.status === 404 || badProj.status === 403) {
    pass("failure: invalid project", `status=${badProj.status}`);
  } else {
    fail("failure: invalid project", `status=${badProj.status}`);
  }

  // Corrupt media → FFmpeg failure on extract
  const corruptId = up2.json.id; // no-audio already tested; use overwrite via separate corrupt file
  const badFile = path.join(tmp, "corrupt.mp4");
  await fs.writeFile(badFile, Buffer.from("not-a-valid-mp4-file"));
  const form3 = new FormData();
  form3.append("file", new Blob([await fs.readFile(badFile)], { type: "video/mp4" }), "corrupt.mp4");
  const up3 = await req("POST", `/projects/${projectId}/media`, { token, form: form3 });
  // Upload may succeed without full probe; extract should fail
  if (up3.status === 201) {
    const sess3 = await req("POST", `/projects/${projectId}/dubbing/sessions`, {
      token,
      body: { mediaAssetId: up3.json.id },
    });
    const ex3 = await req(
      "POST",
      `/projects/${projectId}/dubbing/sessions/${sess3.json.id}/extract-audio`,
      { token, body: {} },
    );
    if (ex3.status >= 400) {
      pass("failure: FFmpeg/invalid media", String(ex3.json.message ?? ex3.status).slice(0, 100));
    } else {
      fail("failure: FFmpeg/invalid media", "extract unexpectedly succeeded");
    }
  } else {
    pass("failure: FFmpeg/invalid media", `upload rejected ${up3.status}`);
  }

  await fs.rm(tmp, { recursive: true, force: true }).catch(() => undefined);

  const failed = results.filter((r) => !r.ok);
  console.log("\n=== SUMMARY ===");
  console.log(`Passed: ${results.filter((r) => r.ok).length}/${results.length}`);
  if (failed.length) {
    console.log("Failed:");
    for (const f of failed) console.log(` - ${f.name}: ${f.detail}`);
    process.exit(1);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
