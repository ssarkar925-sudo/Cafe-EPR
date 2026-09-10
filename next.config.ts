import type { NextConfig } from "next";

const supabasePublicKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

const nextConfig: NextConfig = {
  ...(process.env.BUILD_STANDALONE === "true" || process.platform !== "win32" ? { output: "standalone" } : {}),
  eslint: {
    ignoreDuringBuilds: true,
  },
  env: {
    NEXT_PUBLIC_SUPABASE_ANON_KEY: supabasePublicKey,
  },
};

export default nextConfig;
