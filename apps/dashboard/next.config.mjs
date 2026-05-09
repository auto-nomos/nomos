/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: [
    '@credential-broker/cedar',
    '@credential-broker/policy-builder',
    '@credential-broker/schema-packs',
    '@credential-broker/shared-types',
  ],
  experimental: {
    typedRoutes: false,
  },
};

export default nextConfig;
