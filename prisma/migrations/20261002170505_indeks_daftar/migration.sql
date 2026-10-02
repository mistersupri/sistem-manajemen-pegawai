-- CreateIndex
CREATE INDEX "attendance_corrections_created_at_idx" ON "attendance_corrections"("created_at");

-- CreateIndex
CREATE INDEX "audit_logs_action_created_at_idx" ON "audit_logs"("action", "created_at");

-- CreateIndex
CREATE INDEX "device_raw_events_received_at_idx" ON "device_raw_events"("received_at");

-- CreateIndex
CREATE INDEX "device_sync_runs_started_at_idx" ON "device_sync_runs"("started_at");

-- CreateIndex
CREATE INDEX "employee_schedule_assignments_start_date_idx" ON "employee_schedule_assignments"("start_date");

-- CreateIndex
CREATE INDEX "leave_requests_created_at_idx" ON "leave_requests"("created_at");
