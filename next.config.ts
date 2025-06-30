import type { NextConfig } from "next";
import type { Configuration } from "webpack";

/** @type {import('next').NextConfig} */
const nextConfig: NextConfig = {
  webpack: (config: Configuration) => {
    const externals = Array.isArray(config.externals) ? config.externals : [];
    return {
      ...config,
      externals: [...externals, "better-sqlite3"],
    };
  },
};

export default nextConfig;
