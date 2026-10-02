
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
