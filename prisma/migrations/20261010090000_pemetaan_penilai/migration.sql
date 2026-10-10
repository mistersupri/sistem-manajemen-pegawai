
-- AlterTable
ALTER TABLE "assessment_assignments" ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'AUTO';

-- CreateTable
CREATE TABLE "assessment_unit_maps" (
    "id" UUID NOT NULL,
    "period_id" UUID NOT NULL,
    "assessor_unit_id" UUID NOT NULL,
    "target_unit_id" UUID NOT NULL,
    "mode" TEXT NOT NULL,
    "per_target" INTEGER,
    "include_subunits" BOOLEAN NOT NULL DEFAULT false,
    "created" INTEGER NOT NULL DEFAULT 0,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assessment_unit_maps_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "assessment_unit_maps_period_id_idx" ON "assessment_unit_maps"("period_id");

-- AddForeignKey
ALTER TABLE "assessment_unit_maps" ADD CONSTRAINT "assessment_unit_maps_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "assessment_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

