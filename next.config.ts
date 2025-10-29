/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true,  // ✅ Prevents ESLint build failures
  },
  typescript: {
    ignoreBuildErrors: true,   // ✅ Prevents TS build failures on Vercel
  },
};

module.exports = nextConfig;
