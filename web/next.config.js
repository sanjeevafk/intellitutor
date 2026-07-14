/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  turbopack: {
    // Explicitly set the project root to avoid workspace root misdetection
    // after upgrading Next.js. Without this, Turbopack can infer the wrong
    // root directory when running from a monorepo-style layout.
    root: __dirname,
  },
};

module.exports = nextConfig;
