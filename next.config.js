/** @type {import('next').NextConfig} */
const { version } = require('./package.json')

const nextConfig = {
  output: 'standalone',
  env: {
    NEXT_PUBLIC_APP_VERSION: version,
  },
  experimental: {
    serverComponentsExternalPackages: ['@napi-rs/canvas', '@prisma/client', 'pdfjs-dist', 'pdfkit'],
    outputFileTracingIncludes: {
      '/api/sop/screenshots/[workflowId]': ['./docs/operations/user-guide/screenshots/**/*'],
    },
  },
}

module.exports = nextConfig
