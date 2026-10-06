-- Batas sisa cuti tahun lalu yang boleh dibawa ke tahun berikutnya.
ALTER TABLE "leave_types" ADD COLUMN "max_carry_over" INTEGER NOT NULL DEFAULT 0;
