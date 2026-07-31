# syntax=docker/dockerfile:1.7

FROM buildpack-deps:bookworm-curl AS system-libraries

RUN set -eu; \
    mkdir -p /opt/mes-lite-libs; \
    libssl_path="$(ldconfig -p | awk '$1 == "libssl.so.3" { print $NF; exit }')"; \
    libcrypto_path="$(ldconfig -p | awk '$1 == "libcrypto.so.3" { print $NF; exit }')"; \
    test -n "$libssl_path"; \
    test -n "$libcrypto_path"; \
    cp -L "$libssl_path" "$libcrypto_path" /opt/mes-lite-libs/

FROM node:20-bookworm-slim AS base

COPY --from=system-libraries /opt/mes-lite-libs/ /usr/lib/
RUN ldconfig

FROM base AS dependencies

WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --no-audit --fund=false --prefer-offline \
      --fetch-retries=5 \
      --fetch-retry-mintimeout=20000 \
      --fetch-retry-maxtimeout=120000

FROM base AS builder

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 \
    DATABASE_URL=file:/tmp/mes-lite-build.db

COPY --from=dependencies /app/node_modules ./node_modules
COPY . .

RUN npx prisma generate \
    && npm run build \
    && npm prune --omit=dev

FROM base AS runner

WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    DATABASE_URL=file:/app/data/mes_lite.db \
    PDF_FONT_PATH=/app/assets/fonts/NotoSansCJKsc-Regular.otf

RUN command -v setpriv >/dev/null \
    && mkdir -p /app/data /app/public/uploads \
    && chown -R node:node /app

COPY --from=builder --chown=node:node /app/package.json /app/package-lock.json ./
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/.next ./.next
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/prisma ./prisma
COPY --from=builder --chown=node:node /app/assets/fonts ./assets/fonts
COPY --from=builder --chown=node:node /app/scripts/cleanup-legacy-work-instruction-files.mjs ./scripts/cleanup-legacy-work-instruction-files.mjs
COPY --from=builder --chown=root:root --chmod=755 /app/scripts/fix-persistent-storage-permissions.sh /app/scripts/docker-entrypoint.sh ./scripts/
COPY --from=builder --chown=node:node /app/next.config.js ./next.config.js

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/api/health').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"]

ENTRYPOINT ["/app/scripts/docker-entrypoint.sh"]

CMD ["sh", "-c", "touch /app/data/mes_lite.db && node scripts/cleanup-legacy-work-instruction-files.mjs && npx prisma migrate deploy && npm run start"]
