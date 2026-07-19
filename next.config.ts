import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "better-sqlite3",
    "@react-pdf/renderer",
    "heic-convert",
    "heic-decode",
    "libheif-js",
  ],
};

export default nextConfig;
