#!/bin/sh
# Entrypoint image SIMPEG.
#   serve           (bawaan) migrasi + seed bila MIGRATE_ON_START=1 (bawaan), lalu jalankan server
#   migrate         migrasi skema + seed peran/admin, lalu selesai
#   seed            seed saja
#   reset-admin     atur ulang akun admin dari ADMIN_USERNAME/ADMIN_PASSWORD
#   migrate-sqlite  impor data aplikasi lama, mis. migrate-sqlite --sqlite /lama/absensi.db --uploads /lama/uploads
# Perintah lain dijalankan apa adanya (mis. sh).
set -e

# Container mulai sebagai root hanya untuk menyiapkan folder penyimpanan, lalu turun ke user node.
# Volume atau bind mount untuk STORAGE_DIR sering dimiliki root (mis. folder di host), sehingga
# tanpa langkah ini aplikasi gagal menulis impor, logo, dan foto (EACCES).
dir="${STORAGE_DIR:-/data/storage}"
if [ "$(id -u)" = "0" ]; then
  mkdir -p "$dir"
  # Hanya berkas yang belum milik node, agar start ulang tetap cepat walau isi penyimpanan banyak.
  find "$dir" ! -user node -exec chown node:node {} +
  exec setpriv --reuid=node --regid=node --init-groups /usr/local/bin/simpeg "$@"
fi
if [ ! -w "$dir" ]; then
  echo "Folder penyimpanan $dir tidak bisa ditulis oleh user $(id -un) (uid $(id -u))." >&2
  echo "Jalankan container sebagai root (bawaan image ini) atau ubah pemilik folder: chown -R 1000:1000 <folder di host>" >&2
  exit 1
fi

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
