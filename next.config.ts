import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Genera .next/standalone — necesario para la imagen Docker de EasyPanel
  output: "standalone",
};

export default nextConfig;
