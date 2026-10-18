import type { NextConfig } from "next";

// Admin/artist uploads live in the Supabase "media" bucket; only that project's public storage is allowed.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://ivjrbaiiphqfvoynxwuc.supabase.co";

const nextConfig: NextConfig = {
  agentRules: false,
  images: {
    remotePatterns: [new URL(`${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/**`)],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
