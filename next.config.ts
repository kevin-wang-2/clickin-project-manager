import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  basePath: '/app',
  env: { NEXT_PUBLIC_BASE_PATH: '/app' },
  allowedDevOrigins: ['192.168.71.96'],
};

export default nextConfig;
