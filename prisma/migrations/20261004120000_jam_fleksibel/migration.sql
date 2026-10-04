-- Jam fleksibel per jadwal: terlambat sampai sekian menit diganti dengan pulang lebih akhir.
ALTER TABLE "work_schedules" ADD COLUMN "flex_minutes" INTEGER NOT NULL DEFAULT 0;
