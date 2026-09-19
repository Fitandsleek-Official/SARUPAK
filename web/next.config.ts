import type { NextConfig } from "next";
import path from "node:path";

const packageAliases = {
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

const nextConfig: NextConfig = {
  transpilePackages: ["@sarupak/editor-core", "@sarupak/shared-types"],
  serverExternalPackages: [
    "@imgly/background-removal",
    "onnxruntime-web",
    "@ffmpeg/ffmpeg",
    "@ffmpeg/util",
  ],
  // Next.js 16 defaults to Turbopack; keep aliases for both bundlers.
  turbopack: {
    resolveAlias: {
      "@sarupak/editor-core": "../packages/editor-core/src/index.ts",
      "@sarupak/shared-types": "../packages/shared-types/src/index.ts",
      zustand: "../node_modules/zustand",
    },
  },
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      ...packageAliases,
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
