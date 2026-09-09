import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "@imgly/background-removal",
    "onnxruntime-web",
    "@ffmpeg/ffmpeg",
    "@ffmpeg/util",
  ],
  async headers() {
    return [
      // Single-thread @ffmpeg/core does not need COOP/COEP. Site-wide
      // credentialless COEP can stall the module worker on some browsers.
      {
        source: "/ffmpeg/:path*",
        headers: [
          {
            key: "Cross-Origin-Resource-Policy",
            value: "cross-origin",
          },
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
