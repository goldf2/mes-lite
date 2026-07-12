/** @type {import('next').NextConfig} */
const { version } = require('./package.json')

const nextConfig = {
  env: {
    NEXT_PUBLIC_APP_VERSION: version,
  },
  experimental: {
    serverComponentsExternalPackages: ['@prisma/client', 'pdfkit'],
  },
}

module.exports = nextConfig
