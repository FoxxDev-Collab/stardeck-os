import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'export',

  // Dev mode: proxy API to Go backend (HTTPS on port 443)
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'https://localhost:443/api/:path*',
      },
    ]
  },
};

export default nextConfig;
