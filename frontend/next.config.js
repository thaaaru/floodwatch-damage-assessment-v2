/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  async redirects() {
    // /early-warning (old rain-risk page) was removed; its rain
    // forecast lives on the home map now.
    return [{ source: '/early-warning', destination: '/', permanent: true }];
  },
}

module.exports = nextConfig
