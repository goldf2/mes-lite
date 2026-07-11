FROM node:20-bookworm-slim AS dependencies

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:20-bookworm-slim AS builder

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 \
    DATABASE_URL=file:/tmp/mes-lite-build.db

COPY --from=dependencies /app/node_modules ./node_modules
COPY . .

RUN npx prisma generate \
    && npm run build \
    && npm prune --omit=dev

FROM node:20-bookworm-slim AS runner

WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    DATABASE_URL=file:/app/data/mes_lite.db \
    PDF_FONT_PATH=/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates fonts-noto-cjk \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /app/data /app/public/uploads \
    && chown -R node:node /app

COPY --from=builder --chown=node:node /app/package.json /app/package-lock.json ./
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/.next ./.next
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/prisma ./prisma
COPY --from=builder --chown=node:node /app/next.config.js ./next.config.js

USER node

EXPOSE 3000

CMD ["sh", "-c", "touch /app/data/mes_lite.db && npx prisma migrate deploy && npm run start"]
