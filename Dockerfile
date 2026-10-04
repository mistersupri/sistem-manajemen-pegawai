# syntax=docker/dockerfile:1
# Image produksi SIMPEG: satu image untuk aplikasi, migrasi, seed, dan skrip operasional.
# Saat container mulai, migrasi skema dan seed peran/admin dijalankan dulu, lalu server.

FROM node:22-bookworm-slim AS deps
WORKDIR /app
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM deps AS build
WORKDIR /app
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npx prisma generate && npx next build
# Seed dan skrip operasional dibundel menjadi satu berkas JS masing-masing, agar image akhir tidak butuh tsx dan source.
RUN npx esbuild prisma/seed.ts scripts/reset-admin.ts scripts/migrate-sqlite.ts \
      --bundle --platform=node --target=node22 --format=esm --entry-names=[name] --out-extension:.js=.mjs \
      --outdir=/app/ops --external:pg-native --log-level=warning \
      --banner:js="import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);"

# Prisma CLI untuk `migrate deploy`, terpisah dari node_modules aplikasi agar versinya tidak saling menimpa.
FROM node:22-bookworm-slim AS prisma-cli
WORKDIR /opt/prisma
COPY package-lock.json /tmp/package-lock.json
RUN v() { node -p "require('/tmp/package-lock.json').packages['node_modules/$1'].version"; } \
 && echo '{"private":true}' > package.json \
 && npm install --no-audit --no-fund --omit=dev "prisma@$(v prisma)" "dotenv@$(v dotenv)" \
 && rm /tmp/package-lock.json
COPY prisma.config.ts ./
COPY prisma/schema.prisma ./prisma/schema.prisma
COPY prisma/migrations ./prisma/migrations

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0 STORAGE_DIR=/data/storage
# OpenSSL dibutuhkan mesin migrasi Prisma untuk mendeteksi platform.
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/* \
 && mkdir -p /data/storage && chown -R node:node /data
COPY --from=prisma-cli --chown=node:node /opt/prisma /opt/prisma
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/ops ./ops
COPY --chown=node:node scripts/docker-entrypoint.sh /usr/local/bin/simpeg
# Tanpa USER node: entrypoint mulai sebagai root untuk memperbaiki pemilik STORAGE_DIR, lalu menjalankan aplikasi sebagai node.
EXPOSE 3000
VOLUME ["/data/storage"]
# Waktu mulai lebih panjang karena migrasi berjalan sebelum server.
HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/api/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
ENTRYPOINT ["simpeg"]
CMD ["serve"]
