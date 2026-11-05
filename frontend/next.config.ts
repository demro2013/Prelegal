import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A static site: the app has no server, so entered details stay in the browser.
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
