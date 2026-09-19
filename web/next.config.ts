import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  transpilePackages: ["@sarupak/editor-core", "@sarupak/shared-types"],
  serverExternalPackages: [
    "@imgly/background-removal",
    "onnxruntime-web",
    "@ffmpeg/ffmpeg",
    "@ffmpeg/util",
  ],
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      "@sarupak/editor-core": path.resolve(
        __dirname,
        "../packages/editor-core/src/index.ts",
      ),
      "@sarupak/shared-types": path.resolve(
        __dirname,
        "../packages/shared-types/src/index.ts",
      ),
      zustand: path.resolve(__dirname, "../node_modules/zustand"),
    };
    return config;
  },
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
