
-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'RETURNED');

-- CreateEnum
CREATE TYPE "AssessmentStatus" AS ENUM ('PENDING', 'SUBMITTED');

-- CreateTable
CREATE TABLE "monthly_reports" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "month" TEXT NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'DRAFT',
    "summary" TEXT,
    "submitted_at" TIMESTAMPTZ(3),
    "reviewer_id" UUID,
    "reviewed_at" TIMESTAMPTZ(3),
    "score" INTEGER,
    "review_note" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "monthly_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_reports" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "work_date" DATE NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "daily_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_report_attachments" (
    "id" UUID NOT NULL,
    "daily_report_id" UUID NOT NULL,
    "file_name" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_report_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessment_periods" (
    "id" UUID NOT NULL,
    "month" TEXT NOT NULL,
    "peer_count" INTEGER NOT NULL DEFAULT 3,
    "is_closed" BOOLEAN NOT NULL DEFAULT false,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assessment_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessment_assignments" (
    "id" UUID NOT NULL,
    "period_id" UUID NOT NULL,
    "target_employee_id" UUID NOT NULL,
    "assessor_employee_id" UUID NOT NULL,
    "role" TEXT NOT NULL,
    "status" "AssessmentStatus" NOT NULL DEFAULT 'PENDING',
    "scores" JSONB,
    "average" DOUBLE PRECISION,
    "predicate" TEXT,
    "competence" TEXT,
    "follow_up" TEXT,
    "note" TEXT,
    "submitted_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assessment_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "monthly_reports_status_month_idx" ON "monthly_reports"("status", "month");

-- CreateIndex
CREATE UNIQUE INDEX "monthly_reports_employee_id_month_key" ON "monthly_reports"("employee_id", "month");

-- CreateIndex
CREATE INDEX "daily_reports_work_date_idx" ON "daily_reports"("work_date");

-- CreateIndex
CREATE UNIQUE INDEX "daily_reports_employee_id_work_date_key" ON "daily_reports"("employee_id", "work_date");

-- CreateIndex
CREATE INDEX "daily_report_attachments_daily_report_id_idx" ON "daily_report_attachments"("daily_report_id");

-- CreateIndex
CREATE UNIQUE INDEX "assessment_periods_month_key" ON "assessment_periods"("month");

-- CreateIndex
CREATE INDEX "assessment_assignments_assessor_employee_id_status_idx" ON "assessment_assignments"("assessor_employee_id", "status");

-- CreateIndex
CREATE INDEX "assessment_assignments_period_id_target_employee_id_idx" ON "assessment_assignments"("period_id", "target_employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "assessment_assignments_period_id_target_employee_id_assesso_key" ON "assessment_assignments"("period_id", "target_employee_id", "assessor_employee_id");

-- AddForeignKey
ALTER TABLE "monthly_reports" ADD CONSTRAINT "monthly_reports_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_reports" ADD CONSTRAINT "daily_reports_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_report_attachments" ADD CONSTRAINT "daily_report_attachments_daily_report_id_fkey" FOREIGN KEY ("daily_report_id") REFERENCES "daily_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_assignments" ADD CONSTRAINT "assessment_assignments_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "assessment_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_assignments" ADD CONSTRAINT "assessment_assignments_target_employee_id_fkey" FOREIGN KEY ("target_employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_assignments" ADD CONSTRAINT "assessment_assignments_assessor_employee_id_fkey" FOREIGN KEY ("assessor_employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

