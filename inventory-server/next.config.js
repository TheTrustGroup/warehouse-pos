const { withSentryConfig } = require('@sentry/nextjs');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: { instrumentationHook: true },
  // SPA fallback when frontend is served from public/ (single Vercel project). API and _next/ and assets/ are not rewritten.
  async rewrites() {
    return [
      { source: '/((?!api|admin|_next|assets).*)', destination: '/index.html' },
    ];
  },
};

module.exports = withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG ?? '',
  project: process.env.SENTRY_PROJECT ?? '',
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
});
