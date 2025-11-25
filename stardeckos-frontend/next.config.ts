import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'export',

  // Dev mode: proxy API to Go backend
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:8080/api/:path*',
      },
      {
        source: '/ws/:path*',
        destination: 'http://localhost:8080/ws/:path*',
      },
    ]
  },
};

export default nextConfig;
