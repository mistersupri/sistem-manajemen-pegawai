-- CreateEnum
CREATE TYPE "BiometricStatus" AS ENUM ('PENDING_VERIFICATION', 'ACTIVE', 'REVOKED');

-- CreateEnum
CREATE TYPE "DeviceStatus" AS ENUM ('ONLINE', 'OFFLINE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('RUNNING', 'SUCCESS', 'PARTIAL', 'FAILED');

-- CreateEnum
CREATE TYPE "EventDirection" AS ENUM ('IN', 'OUT');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "username" TEXT NOT NULL,
    "email" TEXT,
    "password_hash" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "must_change_password" BOOLEAN NOT NULL DEFAULT false,
    "mfa_secret_enc" TEXT,
    "mfa_enabled" BOOLEAN NOT NULL DEFAULT false,
    "failed_login_count" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMPTZ(3),
    "last_login_at" TIMESTAMPTZ(3),
    "employee_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "mfa_pending" BOOLEAN NOT NULL DEFAULT false,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip" TEXT,
    "user_agent" TEXT,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "group" TEXT NOT NULL,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "role_id" UUID NOT NULL,
    "permission_id" UUID NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id","permission_id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "unit_id" UUID,
    "include_subunits" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_units" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parent_id" UUID,
    "timezone" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "organization_units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employees" (
    "id" UUID NOT NULL,
    "employee_number" TEXT,
    "nik_enc" TEXT,
    "full_name" TEXT NOT NULL,
    "front_title" TEXT,
    "back_title" TEXT,
    "birth_place" TEXT,
    "birth_date" DATE,
    "gender" TEXT,
    "address" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "profile_photo" TEXT,
    "employment_status" TEXT,
    "position" TEXT,
    "rank" TEXT,
    "unit_id" UUID,
    "supervisor_id" UUID,
    "start_date" DATE,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "active_effective_date" DATE,
    "machine_pin" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_position_history" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "position" TEXT,
    "rank" TEXT,
    "employment_status" TEXT,
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "note" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_position_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_unit_history" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "unit_id" UUID,
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "note" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_unit_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_biometrics" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "modality" TEXT NOT NULL DEFAULT 'FACE',
    "model" TEXT NOT NULL,
    "template_enc" TEXT NOT NULL,
    "sample_count" INTEGER NOT NULL,
    "status" "BiometricStatus" NOT NULL,
    "consent_version" TEXT NOT NULL,
    "consent_at" TIMESTAMPTZ(3) NOT NULL,
    "consent_by_id" UUID,
    "enrolled_by_id" UUID,
    "verified_by_id" UUID,
    "verified_at" TIMESTAMPTZ(3),
    "revoked_at" TIMESTAMPTZ(3),
    "revoked_by_id" UUID,
    "revoked_reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "employee_biometrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_devices" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "vendor" TEXT,
    "model" TEXT,
    "serial_number" TEXT,
    "adapter" TEXT NOT NULL,
    "connection" TEXT NOT NULL,
    "host" TEXT,
    "port" INTEGER,
    "secret_enc" TEXT,
    "location" TEXT,
    "unit_id" UUID,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "status" "DeviceStatus" NOT NULL DEFAULT 'UNKNOWN',
    "sync_interval_minutes" INTEGER NOT NULL DEFAULT 0,
    "timeout_ms" INTEGER NOT NULL DEFAULT 10000,
    "max_retries" INTEGER NOT NULL DEFAULT 2,
    "last_sync_at" TIMESTAMPTZ(3),
    "last_sync_cursor" TEXT,
    "last_seen_at" TIMESTAMPTZ(3),
    "received_count" INTEGER NOT NULL DEFAULT 0,
    "failed_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "attendance_devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_sync_runs" (
    "id" UUID NOT NULL,
    "device_id" UUID,
    "trigger" TEXT NOT NULL,
    "status" "SyncStatus" NOT NULL,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "started_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ(3),
    "received" INTEGER NOT NULL DEFAULT 0,
    "inserted" INTEGER NOT NULL DEFAULT 0,
    "duplicates" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "cursor_before" TEXT,
    "cursor_after" TEXT,
    "file_name" TEXT,
    "error_message" TEXT,
    "details" JSONB,
    "triggered_by_id" UUID,

    CONSTRAINT "device_sync_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_raw_events" (
    "id" UUID NOT NULL,
    "device_id" UUID,
    "sync_run_id" UUID,
    "device_pin" TEXT NOT NULL,
    "device_time" TIMESTAMPTZ(3) NOT NULL,
    "received_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verify_mode" TEXT,
    "status_code" TEXT,
    "payload" JSONB,
    "idempotency_key" TEXT NOT NULL,
    "clock_skew_suspect" BOOLEAN NOT NULL DEFAULT false,
    "employee_id" UUID,
    "work_date" DATE,
    "processed_at" TIMESTAMPTZ(3),
    "processing_note" TEXT,

    CONSTRAINT "device_raw_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_users" (
    "id" UUID NOT NULL,
    "device_id" UUID,
    "pin" TEXT NOT NULL,
    "name" TEXT,
    "department" TEXT,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "device_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_events" (
    "id" UUID NOT NULL,
    "employee_id" UUID,
    "direction" "EventDirection" NOT NULL,
    "work_date" DATE,
    "method" TEXT NOT NULL,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "client_time" TIMESTAMPTZ(3),
    "idempotency_key" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "accuracy_m" DOUBLE PRECISION,
    "address" TEXT,
    "photo_path" TEXT,
    "note" TEXT,
    "actor_user_id" UUID,
    "user_agent" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_verifications" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "outcome" TEXT NOT NULL,
    "matcher" TEXT,
    "distance" DOUBLE PRECISION,
    "threshold" DOUBLE PRECISION,
    "quality" JSONB,
    "liveness_passed" BOOLEAN,
    "distance_to_office_m" DOUBLE PRECISION,
    "message" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_records" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "work_date" DATE NOT NULL,
    "schedule_id" UUID,
    "schedule_revision_id" UUID,
    "is_off_day" BOOLEAN NOT NULL DEFAULT false,
    "check_in_at" TIMESTAMPTZ(3),
    "check_out_at" TIMESTAMPTZ(3),
    "check_in_method" TEXT,
    "check_out_method" TEXT,
    "check_in_source_id" TEXT,
    "check_out_source_id" TEXT,
    "status" TEXT NOT NULL,
    "status_locked" BOOLEAN NOT NULL DEFAULT false,
    "late_minutes" INTEGER NOT NULL DEFAULT 0,
    "early_leave_minutes" INTEGER NOT NULL DEFAULT 0,
    "dispensation" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "needs_review" BOOLEAN NOT NULL DEFAULT false,
    "review_reason" TEXT,
    "leave_request_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "attendance_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_corrections" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "attendance_record_id" UUID,
    "work_date" DATE NOT NULL,
    "kind" TEXT NOT NULL,
    "original_values" JSONB,
    "proposed_check_in" TEXT,
    "proposed_check_out" TEXT,
    "proposed_status" TEXT,
    "dispensation" BOOLEAN NOT NULL DEFAULT false,
    "reason" TEXT NOT NULL,
    "attachment_path" TEXT,
    "status" "RequestStatus" NOT NULL DEFAULT 'PENDING',
    "requested_by_id" UUID NOT NULL,
    "reviewed_by_id" UUID,
    "reviewed_at" TIMESTAMPTZ(3),
    "review_note" TEXT,
    "applied_values" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "attendance_corrections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_schedules" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "check_in" TEXT NOT NULL,
    "check_out" TEXT NOT NULL,
    "break_start" TEXT,
    "break_end" TEXT,
    "late_tolerance_min" INTEGER NOT NULL DEFAULT 0,
    "early_leave_tolerance_min" INTEGER NOT NULL DEFAULT 0,
    "workdays" INTEGER[] DEFAULT ARRAY[1, 2, 3, 4, 5]::INTEGER[],
    "color" TEXT NOT NULL DEFAULT '#1a3a8f',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "work_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_schedule_revisions" (
    "id" UUID NOT NULL,
    "schedule_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "rules" JSONB NOT NULL,
    "changed_by_id" UUID,
    "change_note" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "work_schedule_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_schedule_assignments" (
    "id" UUID NOT NULL,
    "schedule_id" UUID,
    "employee_id" UUID,
    "unit_id" UUID,
    "kind" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "note" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "employee_schedule_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "holidays" (
    "id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "name" TEXT NOT NULL,
    "unit_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "holidays_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_types" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "attendance_status" TEXT NOT NULL,
    "uses_balance" BOOLEAN NOT NULL DEFAULT false,
    "default_annual_quota" INTEGER,
    "eligible_employment_statuses" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "max_days_per_request" INTEGER,
    "min_notice_days" INTEGER NOT NULL DEFAULT 0,
    "approval_levels" INTEGER NOT NULL DEFAULT 1,
    "count_workdays_only" BOOLEAN NOT NULL DEFAULT true,
    "allow_attachment" BOOLEAN NOT NULL DEFAULT true,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "leave_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_balances" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "leave_type_id" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "entitled" INTEGER NOT NULL,
    "carried_over" INTEGER NOT NULL DEFAULT 0,
    "adjustment" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "leave_balances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_requests" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "leave_type_id" UUID NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "days" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "attachment_path" TEXT,
    "status" "RequestStatus" NOT NULL DEFAULT 'PENDING',
    "current_level" INTEGER NOT NULL DEFAULT 1,
    "requested_by_id" UUID NOT NULL,
    "cancelled_at" TIMESTAMPTZ(3),
    "cancel_reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "leave_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_approvals" (
    "id" UUID NOT NULL,
    "leave_request_id" UUID NOT NULL,
    "level" INTEGER NOT NULL,
    "approver_kind" TEXT NOT NULL,
    "approver_user_id" UUID,
    "decision" "RequestStatus" NOT NULL DEFAULT 'PENDING',
    "decided_by_id" UUID,
    "decided_at" TIMESTAMPTZ(3),
    "note" TEXT,

    CONSTRAINT "leave_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "link" TEXT,
    "read_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actor_user_id" UUID,
    "actor_label" TEXT,
    "action" TEXT NOT NULL,
    "entity_type" TEXT,
    "entity_id" TEXT,
    "result" TEXT NOT NULL DEFAULT 'SUCCESS',
    "before" JSONB,
    "after" JSONB,
    "meta" JSONB,
    "ip" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updated_by_id" UUID,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_employee_id_key" ON "users"("employee_id");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "roles_code_key" ON "roles"("code");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_code_key" ON "permissions"("code");

-- CreateIndex
CREATE INDEX "user_roles_user_id_idx" ON "user_roles"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_roles_user_id_role_id_unit_id_key" ON "user_roles"("user_id", "role_id", "unit_id");

-- CreateIndex
CREATE UNIQUE INDEX "organization_units_code_key" ON "organization_units"("code");

-- CreateIndex
CREATE UNIQUE INDEX "employees_employee_number_key" ON "employees"("employee_number");

-- CreateIndex
CREATE UNIQUE INDEX "employees_machine_pin_key" ON "employees"("machine_pin");

-- CreateIndex
CREATE INDEX "employees_full_name_idx" ON "employees"("full_name");

-- CreateIndex
CREATE INDEX "employees_unit_id_idx" ON "employees"("unit_id");

-- CreateIndex
CREATE INDEX "employees_is_active_deleted_at_idx" ON "employees"("is_active", "deleted_at");

-- CreateIndex
CREATE INDEX "employee_position_history_employee_id_start_date_idx" ON "employee_position_history"("employee_id", "start_date");

-- CreateIndex
CREATE INDEX "employee_unit_history_employee_id_start_date_idx" ON "employee_unit_history"("employee_id", "start_date");

-- CreateIndex
CREATE INDEX "employee_biometrics_employee_id_status_idx" ON "employee_biometrics"("employee_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_devices_serial_number_key" ON "attendance_devices"("serial_number");

-- CreateIndex
CREATE INDEX "device_sync_runs_device_id_started_at_idx" ON "device_sync_runs"("device_id", "started_at");

-- CreateIndex
CREATE UNIQUE INDEX "device_raw_events_idempotency_key_key" ON "device_raw_events"("idempotency_key");

-- CreateIndex
CREATE INDEX "device_raw_events_device_pin_device_time_idx" ON "device_raw_events"("device_pin", "device_time");

-- CreateIndex
CREATE INDEX "device_raw_events_employee_id_device_time_idx" ON "device_raw_events"("employee_id", "device_time");

-- CreateIndex
CREATE INDEX "device_raw_events_employee_id_work_date_idx" ON "device_raw_events"("employee_id", "work_date");

-- CreateIndex
CREATE INDEX "device_raw_events_device_time_idx" ON "device_raw_events"("device_time");

-- CreateIndex
CREATE UNIQUE INDEX "device_users_pin_key" ON "device_users"("pin");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_events_idempotency_key_key" ON "attendance_events"("idempotency_key");

-- CreateIndex
CREATE INDEX "attendance_events_employee_id_occurred_at_idx" ON "attendance_events"("employee_id", "occurred_at");

-- CreateIndex
CREATE INDEX "attendance_events_employee_id_work_date_idx" ON "attendance_events"("employee_id", "work_date");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_verifications_event_id_key" ON "attendance_verifications"("event_id");

-- CreateIndex
CREATE INDEX "attendance_records_work_date_status_idx" ON "attendance_records"("work_date", "status");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_records_employee_id_work_date_key" ON "attendance_records"("employee_id", "work_date");

-- CreateIndex
CREATE INDEX "attendance_corrections_status_created_at_idx" ON "attendance_corrections"("status", "created_at");

-- CreateIndex
CREATE INDEX "attendance_corrections_employee_id_work_date_idx" ON "attendance_corrections"("employee_id", "work_date");

-- CreateIndex
CREATE UNIQUE INDEX "work_schedules_code_key" ON "work_schedules"("code");

-- CreateIndex
CREATE UNIQUE INDEX "work_schedule_revisions_schedule_id_version_key" ON "work_schedule_revisions"("schedule_id", "version");

-- CreateIndex
CREATE INDEX "employee_schedule_assignments_employee_id_start_date_idx" ON "employee_schedule_assignments"("employee_id", "start_date");

-- CreateIndex
CREATE INDEX "employee_schedule_assignments_unit_id_start_date_idx" ON "employee_schedule_assignments"("unit_id", "start_date");

-- CreateIndex
CREATE INDEX "holidays_date_idx" ON "holidays"("date");

-- CreateIndex
CREATE UNIQUE INDEX "holidays_date_unit_id_key" ON "holidays"("date", "unit_id");

-- CreateIndex
CREATE UNIQUE INDEX "leave_types_code_key" ON "leave_types"("code");

-- CreateIndex
CREATE UNIQUE INDEX "leave_balances_employee_id_leave_type_id_year_key" ON "leave_balances"("employee_id", "leave_type_id", "year");

-- CreateIndex
CREATE INDEX "leave_requests_employee_id_start_date_idx" ON "leave_requests"("employee_id", "start_date");

-- CreateIndex
CREATE INDEX "leave_requests_status_idx" ON "leave_requests"("status");

-- CreateIndex
CREATE UNIQUE INDEX "leave_approvals_leave_request_id_level_key" ON "leave_approvals"("leave_request_id", "level");

-- CreateIndex
CREATE INDEX "notifications_user_id_read_at_created_at_idx" ON "notifications"("user_id", "read_at", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_actor_user_id_created_at_idx" ON "audit_logs"("actor_user_id", "created_at");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "organization_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_units" ADD CONSTRAINT "organization_units_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "organization_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "organization_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_supervisor_id_fkey" FOREIGN KEY ("supervisor_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_position_history" ADD CONSTRAINT "employee_position_history_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_unit_history" ADD CONSTRAINT "employee_unit_history_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_unit_history" ADD CONSTRAINT "employee_unit_history_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "organization_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_biometrics" ADD CONSTRAINT "employee_biometrics_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_devices" ADD CONSTRAINT "attendance_devices_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "organization_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_sync_runs" ADD CONSTRAINT "device_sync_runs_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "attendance_devices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_raw_events" ADD CONSTRAINT "device_raw_events_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "attendance_devices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_raw_events" ADD CONSTRAINT "device_raw_events_sync_run_id_fkey" FOREIGN KEY ("sync_run_id") REFERENCES "device_sync_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_raw_events" ADD CONSTRAINT "device_raw_events_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_users" ADD CONSTRAINT "device_users_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "attendance_devices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_events" ADD CONSTRAINT "attendance_events_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_verifications" ADD CONSTRAINT "attendance_verifications_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "attendance_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "work_schedules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_schedule_revision_id_fkey" FOREIGN KEY ("schedule_revision_id") REFERENCES "work_schedule_revisions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_corrections" ADD CONSTRAINT "attendance_corrections_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_corrections" ADD CONSTRAINT "attendance_corrections_attendance_record_id_fkey" FOREIGN KEY ("attendance_record_id") REFERENCES "attendance_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_schedule_revisions" ADD CONSTRAINT "work_schedule_revisions_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "work_schedules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_schedule_assignments" ADD CONSTRAINT "employee_schedule_assignments_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "work_schedules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_schedule_assignments" ADD CONSTRAINT "employee_schedule_assignments_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_schedule_assignments" ADD CONSTRAINT "employee_schedule_assignments_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "organization_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "holidays" ADD CONSTRAINT "holidays_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "organization_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_balances" ADD CONSTRAINT "leave_balances_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_balances" ADD CONSTRAINT "leave_balances_leave_type_id_fkey" FOREIGN KEY ("leave_type_id") REFERENCES "leave_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_leave_type_id_fkey" FOREIGN KEY ("leave_type_id") REFERENCES "leave_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_approvals" ADD CONSTRAINT "leave_approvals_leave_request_id_fkey" FOREIGN KEY ("leave_request_id") REFERENCES "leave_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Imutabilitas: transaksi mentah dan audit log tidak boleh diubah atau dihapus.
-- ---------------------------------------------------------------------------

CREATE FUNCTION audit_logs_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs hanya boleh ditambah (%), tidak boleh diubah atau dihapus', TG_OP;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER audit_logs_no_update_delete BEFORE UPDATE OR DELETE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION audit_logs_append_only();

-- Raw event perangkat: kolom inti dikunci; hanya kolom hasil pemrosesan yang boleh diisi.
CREATE FUNCTION device_raw_events_immutable() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'device_raw_events tidak boleh dihapus';
  END IF;
  IF NEW.device_id IS DISTINCT FROM OLD.device_id
     OR NEW.device_pin IS DISTINCT FROM OLD.device_pin
     OR NEW.device_time IS DISTINCT FROM OLD.device_time
     OR NEW.received_at IS DISTINCT FROM OLD.received_at
     OR NEW.verify_mode IS DISTINCT FROM OLD.verify_mode
     OR NEW.status_code IS DISTINCT FROM OLD.status_code
     OR NEW.payload::text IS DISTINCT FROM OLD.payload::text
     OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
     OR NEW.sync_run_id IS DISTINCT FROM OLD.sync_run_id
     OR NEW.clock_skew_suspect IS DISTINCT FROM OLD.clock_skew_suspect THEN
    RAISE EXCEPTION 'kolom inti device_raw_events tidak boleh diubah';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER device_raw_events_lock BEFORE UPDATE OR DELETE ON "device_raw_events"
  FOR EACH ROW EXECUTE FUNCTION device_raw_events_immutable();

-- Transaksi absensi web/kiosk/manual dan hasil verifikasinya: tidak boleh diubah atau dihapus.
CREATE FUNCTION attendance_events_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% tidak boleh diubah atau dihapus (%)', TG_TABLE_NAME, TG_OP;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER attendance_events_lock BEFORE UPDATE OR DELETE ON "attendance_events"
  FOR EACH ROW EXECUTE FUNCTION attendance_events_immutable();
CREATE TRIGGER attendance_verifications_lock BEFORE UPDATE OR DELETE ON "attendance_verifications"
  FOR EACH ROW EXECUTE FUNCTION attendance_events_immutable();

-- Pencarian pegawai tanpa membedakan huruf besar/kecil.
CREATE INDEX "employees_full_name_lower_idx" ON "employees" (lower("full_name"));
