import type { NextConfig } from "next";
import type { Configuration } from "webpack";

/** @type {import('next').NextConfig} */
const nextConfig: NextConfig = {
  webpack: (config: Configuration) => {
    return {
      ...config,
      externals: [...(config.externals || []), "better-sqlite3"],
    };
  },
};

export default nextConfig;
