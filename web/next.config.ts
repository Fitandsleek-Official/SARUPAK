import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@imgly/background-removal", "onnxruntime-web"],
};

export default nextConfig;
