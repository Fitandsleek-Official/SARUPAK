import { ConfigService } from "@nestjs/config";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { FfmpegService } from "../ffmpeg/ffmpeg.service";
import { SotakaTtsProvider } from "./sotaka.tts-provider";
import { TtsService } from "./tts.service";

describe("SOTAKA TTS provider (mocked Gradio)", () => {
  const config = {
    get: (key: string) => {
      if (key === "FFMPEG_PATH") return "ffmpeg";
      if (key === "FFPROBE_PATH") return "ffprobe";
      if (key === "SOTAKA_VOICE_URL") return "https://sotaka.test";
      if (key === "SOTAKA_TIMEOUT_MS") return "5000";
      if (key === "TTS_PROVIDER") return "";
      return undefined;
    },
  } as ConfigService;

  let ffmpeg: FfmpegService;
  let tmp: string;

  beforeAll(async () => {
    ffmpeg = new FfmpegService(config);
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "sarupak-sotaka-"));
  });

  afterAll(async () => {
    await fs.rm(tmp, { recursive: true, force: true }).catch(() => undefined);
  });

  it("reports configured + km when SOTAKA_VOICE_URL set", async () => {
    const provider = new SotakaTtsProvider(config, ffmpeg);
    const caps = await provider.getCapabilities("km");
    expect(caps.available).toBe(true);
    expect(caps.state).toBe("configured");
    expect(caps.languages).toContain("km");
    expect(caps.voices).toContain("sotaka_male");
    expect(caps.voices).toContain("sotaka_female");
  });

  it("marks not_configured without URL", async () => {
    const empty = {
      get: (key: string) => {
        if (key === "FFMPEG_PATH") return "ffmpeg";
        if (key === "FFPROBE_PATH") return "ffprobe";
        return undefined;
      },
    } as ConfigService;
    const provider = new SotakaTtsProvider(empty, ffmpeg);
    const caps = await provider.getCapabilities("km");
    expect(caps.available).toBe(false);
    expect(caps.state).toBe("not_configured");
  });

  it("TtsService resolves sotaka-tts and claims Khmer when configured", async () => {
    const tts = new TtsService(config, ffmpeg);
    const status = await tts.status("km");
    expect(status.sotakaConfigured).toBe(true);
    expect(status.policy.khmerClaimed).toBe(true);
    expect(status.suggestedProvider).toBe("sotaka-tts");
    const provider = await tts.resolveProvider("sotaka-tts");
    expect(provider.name).toBe("sotaka-tts");
  });

  it("rejects unknown voice ids", async () => {
    const provider = new SotakaTtsProvider(config, ffmpeg);
    await expect(
      provider.synthesize({
        text: "សួស្តី",
        language: "km",
        voiceId: "celebrity",
        speakingRate: 1,
        pitch: 0,
        outputFormat: "wav",
        outputPath: path.join(tmp, "bad.wav"),
      }),
    ).rejects.toThrow(/Invalid SOTAKA voice/i);
  });
});
