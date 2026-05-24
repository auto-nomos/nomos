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
  async redirects() {
    return [
      { source: '/icon.svg', destination: '/icon', permanent: false },
    ];
  },
};

export default nextConfig;
