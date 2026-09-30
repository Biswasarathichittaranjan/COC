import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Earth Engine client is a large CommonJS bundle with optional deps; load it from node_modules at runtime.
  serverExternalPackages: ["@google/earthengine"],
};

export default nextConfig;
