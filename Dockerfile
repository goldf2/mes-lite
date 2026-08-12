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
ARG NPM_CONFIG_REGISTRY=https://registry.npmjs.org
# 仅复制去除项目发布版本号的依赖清单。这样应用版本递增时仍可复用
# node_modules 层，只有依赖或锁定结果变化时才重新执行 npm ci。
COPY docker/dependencies/package.json docker/dependencies/package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --no-audit --fund=false --prefer-offline \
      --fetch-retries=5 \
      --fetch-retry-mintimeout=20000 \
      --fetch-retry-maxtimeout=120000

FROM dependencies AS generated-dependencies

COPY prisma ./prisma
RUN npx prisma generate

FROM base AS builder

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 \
    DATABASE_URL=file:/tmp/mes-lite-build.db

COPY --from=generated-dependencies /app/node_modules ./node_modules
COPY . .

RUN --mount=type=cache,target=/app/.next/cache \
    node scripts/sync-docker-dependency-manifest.mjs --check \
    && npm run build

FROM base AS runner

WORKDIR /app
ARG DEBIAN_MIRROR=http://mirrors.aliyun.com
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    DATABASE_URL=file:/app/data/mes_lite.db \
    MES_LITE_DATABASE_PATH=/app/data/mes_lite.db \
    MES_LITE_DATA_DIR=/app/data \
    MES_LITE_UPLOAD_DIR=/app/public/uploads \
    MES_LITE_BACKUP_DIR=/app/backups \
    MES_LITE_BACKUP_RETENTION_COUNT=30 \
    MES_LITE_BACKUP_RETENTION_DAYS=14 \
    MES_LITE_BACKUP_MAX_AGE_HOURS=26 \
    MES_LITE_PRE_MIGRATION_BACKUP_ENABLED=false \
    PDF_FONT_PATH=/app/assets/fonts/NotoSansCJKsc-Regular.otf

COPY --from=builder --chown=node:node /app/assets/fonts ./assets/fonts

RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt/lists,sharing=locked \
    sed -i "s|http://deb.debian.org|${DEBIAN_MIRROR}|g" /etc/apt/sources.list.d/debian.sources \
    && apt-get -o Acquire::Retries=3 -o Acquire::http::Timeout=30 update \
    && apt-get -o Acquire::Retries=3 -o Acquire::http::Timeout=30 install -y --no-install-recommends \
      poppler-utils \
      libreoffice-core-nogui \
      libreoffice-writer-nogui \
      libreoffice-calc-nogui \
      libreoffice-impress-nogui \
      fontconfig \
      tar \
    && command -v pdftoppm >/dev/null \
    && command -v soffice >/dev/null \
    && command -v tar >/dev/null \
    && mkdir -p /usr/local/share/fonts/mes-lite \
    && cp /app/assets/fonts/NotoSansCJKsc-Regular.otf /usr/local/share/fonts/mes-lite/ \
    && fc-cache -f \
    && command -v setpriv >/dev/null \
    && mkdir -p /app/data /app/public/uploads /app/backups \
    && chown -R node:node /app

COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
# Standalone 输出仅包含应用运行依赖。容器启动时仍需要 Prisma CLI 执行迁移，
# 因此只额外复制 Prisma 命令及引擎，不再带入整套生产 node_modules。
COPY --from=generated-dependencies --chown=node:node /app/node_modules/prisma ./node_modules/prisma
COPY --from=generated-dependencies --chown=node:node /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=generated-dependencies --chown=node:node /app/node_modules/.prisma ./node_modules/.prisma
# PDF 缩略图脚本以独立 Node 子进程运行，不在 Next.js 的文件追踪范围内。
COPY --from=generated-dependencies --chown=node:node /app/node_modules/@napi-rs ./node_modules/@napi-rs
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/prisma ./prisma
COPY --from=builder --chown=node:node /app/scripts/cleanup-legacy-work-instruction-files.mjs ./scripts/cleanup-legacy-work-instruction-files.mjs
COPY --from=builder --chown=node:node /app/scripts/render-pdf-thumbnail.mjs ./scripts/render-pdf-thumbnail.mjs
COPY --from=builder --chown=node:node /app/scripts/runtime-backup.mjs ./scripts/runtime-backup.mjs
COPY --from=builder --chown=root:root --chmod=755 /app/scripts/fix-persistent-storage-permissions.sh /app/scripts/docker-entrypoint.sh ./scripts/

EXPOSE 3000

HEALTHCHECK --interval=10s --timeout=5s --start-period=15s --retries=6 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/api/health/ready').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"]

ENTRYPOINT ["/app/scripts/docker-entrypoint.sh"]

CMD ["sh", "-c", "database_path=\"${MES_LITE_DATABASE_PATH:-/app/data/mes_lite.db}\" && touch \"$database_path\" && if [ \"${MES_LITE_PRE_MIGRATION_BACKUP_ENABLED:-false}\" = \"true\" ] && [ -s \"$database_path\" ]; then node scripts/runtime-backup.mjs create; fi && node scripts/cleanup-legacy-work-instruction-files.mjs && node node_modules/prisma/build/index.js migrate deploy && node server.js"]
