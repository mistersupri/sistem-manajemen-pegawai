-- AlterTable
ALTER TABLE "employees" ADD COLUMN     "nrk" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "employees_nrk_key" ON "employees"("nrk");
