import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "@imgly/background-removal",
    "onnxruntime-web",
    "@ffmpeg/ffmpeg",
    "@ffmpeg/util",
  ],
};

export default nextConfig;
