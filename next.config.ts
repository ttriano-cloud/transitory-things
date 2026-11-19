import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Photos are shown with plain <img> tags from Supabase Storage, so no image config is needed.
  reactStrictMode: true,
};

export default nextConfig;
