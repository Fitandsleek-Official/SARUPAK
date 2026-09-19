import { ConfigService } from "@nestjs/config";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { FfmpegService } from "../ffmpeg/ffmpeg.service";
import { OpenAiTtsProvider } from "./openai.tts-provider";

/**
 * Opt-in live OpenAI TTS integration.
 * Runs only when OPENAI_API_KEY is set in the environment.
 * Does NOT claim Khmer support.
 */
const LIVE = Boolean(process.env.OPENAI_API_KEY?.trim());

(LIVE ? describe : describe.skip)("OpenAI TTS live integration", () => {
  jest.setTimeout(60000);

  const config = {
    get: (key: string) => {
      if (key === "FFMPEG_PATH") return process.env.FFMPEG_PATH ?? "ffmpeg";
      if (key === "FFPROBE_PATH") return process.env.FFPROBE_PATH ?? "ffprobe";
      if (key === "OPENAI_API_KEY") return process.env.OPENAI_API_KEY;
      if (key === "OPENAI_BASE_URL")
        return process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1";
      if (key === "OPENAI_TTS_MODEL")
        return process.env.OPENAI_TTS_MODEL ?? "gpt-4o-mini-tts";
      return undefined;
    },
  } as ConfigService;

  let tmp: string;
  let ffmpeg: FfmpegService;

  beforeAll(async () => {
    ffmpeg = new FfmpegService(config);
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "sarupak-tts-live-"));
  });

  afterAll(async () => {
    await fs.rm(tmp, { recursive: true, force: true }).catch(() => undefined);
  });

  it("generates real English speech audio validated by ffprobe", async () => {
    const provider = new OpenAiTtsProvider(config, ffmpeg);
    expect(await provider.isAvailable()).toBe(true);
    const out = path.join(tmp, "live-en.wav");
    const result = await provider.synthesize({
      text: "Hello from SARUPAK Phase 5 live TTS test.",
      language: "en",
      voiceId: process.env.OPENAI_TTS_VOICE?.trim() || "alloy",
      speakingRate: 1,
      pitch: 0,
      outputFormat: "wav",
      outputPath: out,
    });
    expect(result.isMock).toBe(false);
    expect(result.durationMs).toBeGreaterThan(200);
    const st = await fs.stat(out);
    expect(st.size).toBeGreaterThan(1000);
    const probe = await ffmpeg.probeAudio(out);
    expect(probe.hasAudio).toBe(true);
  });
});
