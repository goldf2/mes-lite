/** @type {import('next').NextConfig} */
const { version } = require('./package.json')

const nextConfig = {
  env: {
    NEXT_PUBLIC_APP_VERSION: version,
  },
  experimental: {
    serverComponentsExternalPackages: ['@napi-rs/canvas', '@prisma/client', 'pdfjs-dist', 'pdfkit'],
  },
}

module.exports = nextConfig
