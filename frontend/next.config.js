/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: '/api/proxy/:path*',
        destination: 'https://api.floodwatch.hackandbuild.dev/api/:path*',
      },
    ];
  },
}

module.exports = nextConfig
