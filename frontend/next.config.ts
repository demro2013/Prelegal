import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A static site, which the FastAPI backend serves in production.
  output: "export",
  // Writes login/index.html, because FastAPI's static files don't try a .html suffix.
  trailingSlash: true,
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
