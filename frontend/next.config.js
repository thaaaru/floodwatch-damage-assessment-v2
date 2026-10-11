/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  async redirects() {
    // /early-warning (old rain-risk page) was removed; its rain
    // forecast lives on the home map now.
    // /rivers was folded into the home page (map + "River status by basin").
    return [
      { source: '/early-warning', destination: '/', permanent: true },
      { source: '/rivers', destination: '/#rivers', permanent: true },
    ];
  },
}

module.exports = nextConfig
