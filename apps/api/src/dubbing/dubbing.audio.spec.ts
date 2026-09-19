import { ConfigService } from "@nestjs/config";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { FfmpegService } from "../ffmpeg/ffmpeg.service";
import { MockTtsProvider } from "../tts/mock.tts-provider";
import { TtsService } from "../tts/tts.service";

describe("Phase 4 audio extract + TTS", () => {
  const config = {
    get: (key: string) => {
      if (key === "FFMPEG_PATH") return "ffmpeg";
      if (key === "FFPROBE_PATH") return "ffprobe";
      if (key === "TTS_PROVIDER") return "mock";
      return undefined;
    },
  } as ConfigService;

  let ffmpeg: FfmpegService;
  let tmp: string;

  beforeAll(async () => {
    ffmpeg = new FfmpegService(config);
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "sarupak-p4-"));
  });

  afterAll(async () => {
    await fs.rm(tmp, { recursive: true, force: true }).catch(() => undefined);
  });

  function makeVideo(name: string, withAudio: boolean): string {
    const out = path.join(tmp, name);
    const args = withAudio
      ? [
          "-y",
          "-f",
          "lavfi",
          "-i",
          "color=c=red:s=320x240:d=2",
          "-f",
          "lavfi",
          "-i",
          "sine=frequency=440:duration=2",
          "-c:v",
          "libx264",
          "-pix_fmt",
          "yuv420p",
          "-c:a",
          "aac",
          "-shortest",
          out,
        ]
      : [
          "-y",
          "-f",
          "lavfi",
          "-i",
          "color=c=green:s=320x240:d=1",
          "-c:v",
          "libx264",
          "-pix_fmt",
          "yuv420p",
          "-an",
          out,
        ];
    const r = spawnSync("ffmpeg", args, { encoding: "utf8" });
    if (r.status !== 0) throw new Error(r.stderr);
    return out;
  }

  it("extracts audio from valid video", async () => {
    const video = makeVideo("with-audio.mp4", true);
    const wav = path.join(tmp, "out.wav");
    const probe = await ffmpeg.extractAudioValidated(video, wav, {
      expectDurationMs: 2000,
      toleranceMs: 600,
    });
    expect(probe.hasAudio).toBe(true);
    expect(probe.sampleRate).toBe(16000);
    expect(probe.channels).toBe(1);
    expect(probe.durationMs).toBeGreaterThan(1500);
  });

  it("rejects video without audio", async () => {
    const video = makeVideo("no-audio.mp4", false);
    const wav = path.join(tmp, "none.wav");
    await expect(ffmpeg.extractAudioValidated(video, wav)).rejects.toThrow(
      /no audio/i,
    );
  });

  it("rejects invalid media", async () => {
    const bad = path.join(tmp, "bad.mp4");
    await fs.writeFile(bad, Buffer.from("not-mp4"));
    await expect(
      ffmpeg.extractAudioValidated(bad, path.join(tmp, "x.wav")),
    ).rejects.toThrow();
  });

  it("mock TTS produces playable audio", async () => {
    const mock = new MockTtsProvider(ffmpeg);
    const out = path.join(tmp, "tts.wav");
    const result = await mock.synthesize({
      text: "Hello world from mock TTS",
      language: "en",
      voiceId: "tone_a",
      speakingRate: 1,
      pitch: 0,
      outputFormat: "wav",
      outputPath: out,
    });
    expect(result.isMock).toBe(true);
    expect(result.durationMs).toBeGreaterThan(100);
    const probe = await ffmpeg.probeAudio(out);
    expect(probe.hasAudio).toBe(true);
  });

  it("TtsService resolves mock only when explicitly requested", async () => {
    const tts = new TtsService(config, ffmpeg);
    const caps = await tts.capabilities();
    expect(caps.active).toBe("mock"); // env TTS_PROVIDER=mock
    const provider = await tts.resolveProvider("mock");
    expect(provider.name).toBe("mock");
    await expect(tts.resolveProvider("openai-tts")).rejects.toThrow(
      /not_configured|missing/i,
    );
  });

  it("mixes dialogue onto video", async () => {
    const video = makeVideo("mix-src.mp4", true);
    const tone = path.join(tmp, "dlg.wav");
    await ffmpeg.synthesizeToneWav({
      outputPath: tone,
      durationMs: 500,
      frequencyHz: 520,
    });
    const out = path.join(tmp, "mixed.mp4");
    await ffmpeg.mixDubbing({
      videoPath: video,
      dialogueSegments: [{ path: tone, startMs: 200 }],
      mode: "mix",
      dialogueVolume: 1,
      backgroundVolume: 0.5,
      outputPath: out,
      durationMs: 2000,
    });
    const st = await fs.stat(out);
    expect(st.size).toBeGreaterThan(1000);
    const probe = await ffmpeg.probe(out);
    expect(probe.durationMs).toBeGreaterThan(500);
  });
});
