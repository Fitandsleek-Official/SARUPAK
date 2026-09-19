import type { NextConfig } from "next";
import path from "node:path";

/** Monorepo package sources (repo is cloned fully; Vercel Root Directory = web). */
const packageAliases = {
  "@sarupak/editor-core": path.resolve(
    __dirname,
    "../packages/editor-core/src/index.ts",
  ),
  "@sarupak/shared-types": path.resolve(
    __dirname,
    "../packages/shared-types/src/index.ts",
  ),
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
  // Do NOT alias zustand to ../node_modules — on Vercel that path is empty.
  turbopack: {
    resolveAlias: {
      "@sarupak/editor-core": "../packages/editor-core/src/index.ts",
      "@sarupak/shared-types": "../packages/shared-types/src/index.ts",
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
