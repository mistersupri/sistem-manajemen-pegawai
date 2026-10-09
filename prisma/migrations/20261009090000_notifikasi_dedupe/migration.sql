-- Kunci anti-ganda untuk pengingat terjadwal.
ALTER TABLE "notifications" ADD COLUMN "dedupe_key" TEXT;
CREATE UNIQUE INDEX "notifications_dedupe_key_key" ON "notifications"("dedupe_key");
