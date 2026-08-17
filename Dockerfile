FROM node:24-trixie AS deps
WORKDIR /src/server
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev

FROM node:24-trixie AS build-server
WORKDIR /src/server
COPY server/package.json server/package-lock.json ./
RUN npm ci
COPY server/ ./
RUN npm run build && test -f dist/schema.sql

FROM node:24-trixie AS build-web
WORKDIR /src/web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

FROM node:24-trixie-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg imagemagick libheif1 \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NODE_ENV=production

COPY --from=deps /src/server/node_modules ./node_modules
COPY --from=build-server /src/server/dist ./dist
COPY --from=build-web /src/web/dist ./web
COPY server/package.json ./package.json

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8080/api/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "dist/index.js"]
