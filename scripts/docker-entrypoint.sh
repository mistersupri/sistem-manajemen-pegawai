#!/bin/sh
# Entrypoint image SIMPEG.
#   serve           (bawaan) migrasi + seed bila MIGRATE_ON_START=1 (bawaan), lalu jalankan server
#   migrate         migrasi skema + seed peran/admin, lalu selesai
#   seed            seed saja
#   reset-admin     atur ulang akun admin dari ADMIN_USERNAME/ADMIN_PASSWORD
#   migrate-sqlite  impor data aplikasi lama, mis. migrate-sqlite --sqlite /lama/absensi.db --uploads /lama/uploads
# Perintah lain dijalankan apa adanya (mis. sh).
set -e

migrate() {
  echo "Migrasi skema database..."
  (cd /opt/prisma && node node_modules/prisma/build/index.js migrate deploy)
  echo "Seed peran dan akun admin..."
  DISABLE_SCHEDULER=1 node /app/ops/seed.mjs
}

cmd="${1:-serve}"
[ $# -gt 0 ] && shift
case "$cmd" in
  serve)
    if [ "${MIGRATE_ON_START:-1}" = "1" ]; then migrate; fi
    exec node /app/server.js
    ;;
  migrate) migrate ;;
  seed) DISABLE_SCHEDULER=1 exec node /app/ops/seed.mjs ;;
  reset-admin) DISABLE_SCHEDULER=1 exec node /app/ops/reset-admin.mjs "$@" ;;
  migrate-sqlite) DISABLE_SCHEDULER=1 exec node /app/ops/migrate-sqlite.mjs "$@" ;;
  *) exec "$cmd" "$@" ;;
esac
