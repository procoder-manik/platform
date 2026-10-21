import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Native modules must stay on the server and out of the bundler.
  serverExternalPackages: ['@node-rs/argon2', 'pg'],
  typedRoutes: false,
};

export default nextConfig;
