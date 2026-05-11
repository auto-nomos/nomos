/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: [
    '@auto-nomos/cedar',
    '@auto-nomos/policy-builder',
    '@auto-nomos/schema-packs',
    '@auto-nomos/shared-types',
  ],
  experimental: {
    typedRoutes: false,
  },
};

export default nextConfig;
