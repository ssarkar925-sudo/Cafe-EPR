import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  ...(process.env.BUILD_STANDALONE === "true" || process.platform !== "win32" ? { output: "standalone" } : {}),
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
