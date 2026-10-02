#!/usr/bin/env sh
# Pulihkan backup SIMPEG ke database KOSONG (atau database yang boleh ditimpa).
#   DATABASE_URL=... STORAGE_DIR=./storage scripts/restore.sh backups/simpeg-YYYYMMDD-HHMMSS [--yes]
# Aplikasi harus dihentikan selama pemulihan. Gunakan BIOMETRIC_ENCRYPTION_KEY yang sama dengan
# saat backup dibuat.
set -eu
DIR="${1:?Sebutkan folder backup}"
: "${DATABASE_URL:?DATABASE_URL wajib diisi}"
STORAGE_DIR="${STORAGE_DIR:-./storage}"
[ -f "$DIR/database.dump" ] || { echo "Tidak ada $DIR/database.dump" >&2; exit 1; }
( cd "$DIR" && sha256sum -c SHA256SUMS ) || { echo "Checksum backup tidak cocok. Dibatalkan." >&2; exit 1; }
if [ "${2:-}" != "--yes" ]; then
  printf 'Data di database tujuan akan DITIMPA. Lanjutkan? ketik ya: '
  read -r ans
  [ "$ans" = "ya" ] || { echo "Dibatalkan."; exit 1; }
fi
URL="$(printf '%s' "$DATABASE_URL" | sed 's/[?&]schema=[^&]*//')"
pg_restore --clean --if-exists --no-owner --no-privileges --single-transaction --dbname="$URL" "$DIR/database.dump"
if [ -f "$DIR/storage.tar.gz" ]; then
  mkdir -p "$STORAGE_DIR"
  tar -xzf "$DIR/storage.tar.gz" -C "$STORAGE_DIR"
fi
echo "Pemulihan selesai dari $DIR"
