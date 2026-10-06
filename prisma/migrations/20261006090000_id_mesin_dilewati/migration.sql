-- ID mesin yang sengaja tidak dihubungkan ke pegawai (mis. ID tamu atau mesin lain).
ALTER TABLE "device_users" ADD COLUMN "ignored_at" TIMESTAMPTZ(3);
