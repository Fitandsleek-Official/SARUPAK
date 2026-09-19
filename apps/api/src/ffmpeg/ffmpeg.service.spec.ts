import { ConfigService } from "@nestjs/config";
import { FfmpegService } from "./ffmpeg.service";

describe("FfmpegService safety", () => {
  const config = {
    get: (key: string) => {
      if (key === "FFMPEG_PATH") return "ffmpeg";
      if (key === "FFPROBE_PATH") return "ffprobe";
      return undefined;
    },
  } as ConfigService;

  it("rejects unsafe binary names", () => {
    const bad = {
      get: (key: string) =>
        key === "FFMPEG_PATH" ? "ffmpeg; rm -rf /" : "ffprobe",
    } as ConfigService;
    expect(() => new FfmpegService(bad)).toThrow(/Unsafe FFmpeg binary/);
  });

  it("constructs with safe defaults", () => {
    expect(() => new FfmpegService(config)).not.toThrow();
  });
});
