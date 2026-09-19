import { ConfigService } from "@nestjs/config";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { FfmpegService } from "../ffmpeg/ffmpeg.service";
import { OpenAiTtsProvider } from "./openai.tts-provider";
import { TtsService } from "./tts.service";

describe("OpenAI TTS provider (mocked HTTP)", () => {
  const config = {
    get: (key: string) => {
      if (key === "FFMPEG_PATH") return "ffmpeg";
      if (key === "FFPROBE_PATH") return "ffprobe";
      if (key === "OPENAI_API_KEY") return "sk-test-not-real";
      if (key === "OPENAI_BASE_URL") return "https://example.test/v1";
      if (key === "OPENAI_TTS_MODEL") return "gpt-4o-mini-tts";
      if (key === "TTS_PROVIDER") return "";
      return undefined;
    },
  } as ConfigService;

  let ffmpeg: FfmpegService;
  let tmp: string;

  beforeAll(async () => {
    ffmpeg = new FfmpegService(config);
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "sarupak-openai-tts-"));
  });

  afterAll(async () => {
    await fs.rm(tmp, { recursive: true, force: true }).catch(() => undefined);
  });

  it("reports configured when API key present", async () => {
    const provider = new OpenAiTtsProvider(config, ffmpeg);
    const caps = await provider.getCapabilities("en");
    expect(caps.available).toBe(true);
    expect(caps.state).toBe("configured");
    expect(caps.apiKeyConfigured).toBe(true);
    expect(caps.languages).toContain("en");
    expect(caps.languages).not.toContain("km");
    expect(caps.outputFormats).toEqual(expect.arrayContaining(["wav", "mp3"]));
  });

  it("marks Khmer as unsupported_language", async () => {
    const provider = new OpenAiTtsProvider(config, ffmpeg);
    const caps = await provider.getCapabilities("km");
    expect(caps.state).toBe("unsupported_language");
  });

  it("rejects Khmer synthesize", async () => {
    const provider = new OpenAiTtsProvider(config, ffmpeg);
    await expect(
      provider.synthesize({
        text: "សួស្តី",
        language: "km",
        voiceId: "alloy",
        speakingRate: 1,
        pitch: 0,
        outputFormat: "wav",
        outputPath: path.join(tmp, "km.wav"),
      }),
    ).rejects.toThrow(/unsupported_language|Khmer/i);
  });

  it("rejects invalid voice ids", async () => {
    const provider = new OpenAiTtsProvider(config, ffmpeg);
    await expect(
      provider.synthesize({
        text: "Hello",
        language: "en",
        voiceId: "celebrity-clone",
        speakingRate: 1,
        pitch: 0,
        outputFormat: "wav",
        outputPath: path.join(tmp, "bad.wav"),
      }),
    ).rejects.toThrow(/Invalid OpenAI voice/i);
  });

  it("synthesizes from mocked fetch and validates with ffprobe", async () => {
    // Build a real tiny wav via ffmpeg to return as fake API body
    const seed = path.join(tmp, "seed.wav");
    await ffmpeg.synthesizeToneWav({
      outputPath: seed,
      durationMs: 300,
      frequencyHz: 440,
    });
    const seedBuf = await fs.readFile(seed);

    const provider = new OpenAiTtsProvider(config, ffmpeg);
    provider.setFetch(async () => {
      return new Response(seedBuf, { status: 200 });
    });

    const out = path.join(tmp, "out.wav");
    const result = await provider.synthesize({
      text: "Hello from mocked OpenAI",
      language: "en",
      voiceId: "alloy",
      speakingRate: 1,
      pitch: 0,
      outputFormat: "wav",
      outputPath: out,
    });
    expect(result.isMock).toBe(false);
    expect(result.provider).toBe("openai-tts");
    expect(result.durationMs).toBeGreaterThan(50);
    expect(result.codec).toBeTruthy();
  });

  it("maps HTTP failures to provider_error without falling back", async () => {
    const provider = new OpenAiTtsProvider(config, ffmpeg);
    provider.setFetch(async () => {
      return new Response("nope", { status: 500 });
    });
    await expect(
      provider.synthesize({
        text: "Hello",
        language: "en",
        voiceId: "alloy",
        speakingRate: 1,
        pitch: 0,
        outputFormat: "wav",
        outputPath: path.join(tmp, "err.wav"),
      }),
    ).rejects.toThrow(/provider_error/i);
  });

  it("TtsService never silently uses mock when openai fails", async () => {
    const tts = new TtsService(config, ffmpeg);
    tts.getOpenAiProvider().setFetch(async () => new Response("fail", { status: 503 }));
    await expect(
      tts.synthesize(
        {
          text: "Hello",
          language: "en",
          voiceId: "alloy",
          speakingRate: 1,
          pitch: 0,
          outputFormat: "wav",
          outputPath: path.join(tmp, "nofallback.wav"),
        },
        { provider: "openai-tts" },
      ),
    ).rejects.toThrow(/provider_error/i);
  });

  it("requires explicit provider name", async () => {
    const tts = new TtsService(config, ffmpeg);
    await expect(tts.resolveProvider("")).rejects.toThrow(/explicitly/i);
  });

  it("reports not_configured without API key", async () => {
    const bare = {
      get: (key: string) => {
        if (key === "FFMPEG_PATH") return "ffmpeg";
        if (key === "FFPROBE_PATH") return "ffprobe";
        return undefined;
      },
    } as ConfigService;
    const tts = new TtsService(bare, new FfmpegService(bare));
    const status = await tts.status("en");
    expect(status.openaiConfigured).toBe(false);
    expect(status.suggestedProvider).toBeNull();
    expect(status.policy.silentMockFallback).toBe(false);
    const openai = status.providers.find((p) => p.provider === "openai-tts");
    expect(openai?.state).toBe("not_configured");
  });
});
