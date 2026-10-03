-- AlterTable
ALTER TABLE "attendance_events" ADD COLUMN     "station_id" UUID;

-- AlterTable
ALTER TABLE "holidays" ADD COLUMN     "disabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'INSTANSI',
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'MANUAL';

-- CreateTable
CREATE TABLE "attendance_stations" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "token_hint" TEXT NOT NULL,
    "unit_id" UUID,
    "allow_field_duty" BOOLEAN NOT NULL DEFAULT false,
    "require_location" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_id" UUID,
    "last_used_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "attendance_stations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "attendance_stations_token_hash_key" ON "attendance_stations"("token_hash");

-- AddForeignKey
ALTER TABLE "attendance_events" ADD CONSTRAINT "attendance_events_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "attendance_stations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_stations" ADD CONSTRAINT "attendance_stations_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "organization_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;
