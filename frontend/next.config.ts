import type { NextConfig } from "next";

const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

const nextConfig: NextConfig = {
  // Enable standalone output for Docker deployment
  output: "standalone",
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "minecraft-api.vercel.app",
        pathname: "/images/**",
      },
    ],
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${apiUrl}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
