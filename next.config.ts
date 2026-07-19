import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "better-sqlite3",
    "@react-pdf/renderer",
    "heic-convert",
    "heic-decode",
    "libheif-js",
  ],
  experimental: {
    // proxy.ts buffers request bodies (default 10MB). Screenplay PDFs often
    // exceed that; truncated bodies then fail FormData parsing.
    proxyClientMaxBodySize: "50mb",
    serverActions: {
      bodySizeLimit: "50mb",
    },
  },
};

export default nextConfig;
