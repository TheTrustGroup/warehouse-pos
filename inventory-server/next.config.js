/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // SPA fallback when frontend is served from public/ (single Vercel project). API and _next/ and assets/ are not rewritten.
  async rewrites() {
    return [
      { source: '/((?!api|admin|_next|assets).*)', destination: '/index.html' },
    ];
  },
};

module.exports = nextConfig;
