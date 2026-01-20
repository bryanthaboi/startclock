import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Avoid Next picking a higher-level workspace root (e.g. OneDrive Documents).
  outputFileTracingRoot: process.cwd(),
  reactStrictMode: true
};

export default nextConfig;

