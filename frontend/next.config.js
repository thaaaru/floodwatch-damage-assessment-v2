/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: '/api/proxy/:path*',
        destination: 'http://198.199.76.11:8000/api/:path*',
      },
    ];
  },
}

module.exports = nextConfig
