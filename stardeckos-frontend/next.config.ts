import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === 'development';

// Development: HTTP on 8080, Production: HTTPS on 443
const backendUrl = isDev
  ? 'http://localhost:8080'
  : 'https://localhost:443';

const nextConfig: NextConfig = {
  // Only use static export for production builds
  output: isDev ? undefined : 'export',

  // Proxy API requests to Go backend
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${backendUrl}/api/:path*`,
      },
    ]
  },
};

export default nextConfig;
