import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A static site, which the FastAPI backend serves in production.
  output: "export",
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
