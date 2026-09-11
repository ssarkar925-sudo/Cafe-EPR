/** @type {import('next').NextConfig} */
const nextConfig = {
  ...(process.env.BUILD_STANDALONE === "true" || process.platform !== "win32" ? { output: "standalone" } : {}),
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
