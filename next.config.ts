import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "@libsql/client",
    "@react-pdf/renderer",
    "@aws-sdk/client-s3",
  ],
  experimental: {
    // proxy.ts matcher skips /api/* so uploads bypass proxy body buffering,
    // but keep headroom for screenplay PDFs on any proxied route. Note: when
    // this limit is exceeded the body is silently truncated (no client error)
    // and FormData parsing fails downstream.
    proxyClientMaxBodySize: "50mb",
    serverActions: {
      bodySizeLimit: "50mb",
    },
  },
};

export default nextConfig;
