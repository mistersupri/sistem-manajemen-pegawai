#!/usr/bin/env sh
# Backup SIMPEG: dump database (format custom pg_dump) + arsip folder storage.
#   DATABASE_URL=... STORAGE_DIR=./storage BACKUP_DIR=./backups RETENTION_DAYS=30 scripts/backup.sh
# Dengan Docker:  docker compose --profile ops run --rm backup
# Kunci BIOMETRIC_ENCRYPTION_KEY TIDAK ikut dibackup; simpan terpisah di tempat aman.
set -eu
: "${DATABASE_URL:?DATABASE_URL wajib diisi}"
STORAGE_DIR="${STORAGE_DIR:-./storage}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="$BACKUP_DIR/simpeg-$STAMP"
mkdir -p "$OUT"
umask 077

# Prisma memakai parameter ?schema=; pg_dump tidak mengenalnya.
URL="$(printf '%s' "$DATABASE_URL" | sed 's/[?&]schema=[^&]*//')"
pg_dump --format=custom --no-owner --no-privileges --file="$OUT/database.dump" "$URL"
if [ -d "$STORAGE_DIR" ]; then
  tar -czf "$OUT/storage.tar.gz" -C "$STORAGE_DIR" --exclude='./impor' .
fi
( cd "$OUT" && sha256sum ./* > SHA256SUMS )
echo "Backup selesai: $OUT"

# Hapus backup yang lebih tua dari RETENTION_DAYS hari.
if [ "$RETENTION_DAYS" -gt 0 ] 2>/dev/null; then
  find "$BACKUP_DIR" -maxdepth 1 -type d -name 'simpeg-*' -mtime "+$RETENTION_DAYS" -exec rm -rf {} +
fi
