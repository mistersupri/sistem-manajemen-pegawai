const { db } = require('./db');
const T = require('./time');

const STATUS_LABEL = {
  hadir: 'Hadir',
  terlambat: 'Terlambat',
  dinas_luar: 'Dinas Luar',
  izin: 'Izin',
  sakit: 'Sakit',
  cuti: 'Cuti',
  alpa: 'Alpa',
};

// Status yang ditetapkan secara manual/klarifikasi dan tidak dihitung ulang dari jam.
const FIXED_STATUS = ['dinas_luar', 'izin', 'sakit', 'cuti', 'alpa'];

const METODE_LABEL = {
  wajah: 'Pengenalan Wajah',
  dinas_luar: 'Foto GPS Dinas Luar',
  klarifikasi: 'Klarifikasi',
  manual: 'Input Manual',
  fingerprint: 'Mesin Fingerprint',
};

// Batas berapa jam setelah shift berakhir absen pulang masih dianggap milik shift tsb.
const CHECKOUT_GRACE_HOURS = 6;

function getShift(id) {
  return id ? db.prepare('SELECT * FROM shifts WHERE id = ?').get(id) : null;
}

/**
 * Shift seorang pegawai pada tanggal tertentu.
 * Prioritas: jadwal per tanggal (shift_schedules) -> shift default pegawai.
 * Mengembalikan { shift, libur }.
 */
function getShiftForDate(employee, tanggal) {
  const sched = db.prepare('SELECT shift_id FROM shift_schedules WHERE employee_id = ? AND tanggal = ?')
    .get(employee.id, tanggal);
  if (sched) {
    if (!sched.shift_id) return { shift: null, libur: true };
    return { shift: getShift(sched.shift_id), libur: false };
  }
  // Shift default hanya berlaku pada hari kerja dan bukan hari libur nasional.
  if (!isWorkday(tanggal)) return { shift: null, libur: true };
  return { shift: getShift(employee.default_shift_id), libur: false };
}

/** Hari kerja umum (Pengaturan > Hari Kerja) yang bukan tanggal merah. */
function isWorkday(tanggal) {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'hari_kerja'").get();
  const days = String(row ? row.value : '1,2,3,4,5').split(',').filter(Boolean).map(Number);
  if (!days.includes(T.parseDateTime(tanggal).getDay())) return false;
  return !db.prepare('SELECT 1 FROM hari_libur WHERE tanggal = ?').get(tanggal);
}

function isOvernight(shift) {
  return !!shift && shift.jam_pulang <= shift.jam_masuk;
}

function shiftWindow(shift, tanggal) {
  if (!shift) return null;
  const start = T.parseDateTime(`${tanggal} ${shift.jam_masuk}`);
  const end = T.parseDateTime(`${isOvernight(shift) ? T.addDays(tanggal, 1) : tanggal} ${shift.jam_pulang}`);
  return { start, end };
}

/** Hitung menit terlambat / pulang cepat dan status berdasarkan jam & shift. */
function computeStatus(rec, shift) {
  const out = { terlambat_menit: 0, pulang_cepat_menit: 0, status: rec.status || 'hadir' };
  const win = shiftWindow(shift, rec.tanggal);
  if (win) {
    const masuk = T.parseDateTime(rec.jam_masuk);
    const pulang = T.parseDateTime(rec.jam_pulang);
    if (masuk) {
      const late = T.minutesBetween(win.start, masuk);
      if (late > (shift.toleransi_menit || 0)) out.terlambat_menit = late;
    }
    if (pulang) {
      const early = T.minutesBetween(pulang, win.end);
      if (early > 0) out.pulang_cepat_menit = early;
    }
  }
  if (rec.dispensasi) {
    // Keterlambatan / pulang cepat dimaafkan (mis. klarifikasi disetujui).
    out.terlambat_menit = 0;
    out.pulang_cepat_menit = 0;
  }
  if (!FIXED_STATUS.includes(out.status)) {
    out.status = out.terlambat_menit > 0 ? 'terlambat' : 'hadir';
  }
  return out;
}

function getRecord(employeeId, tanggal) {
  return db.prepare('SELECT * FROM attendance WHERE employee_id = ? AND tanggal = ?').get(employeeId, tanggal);
}

function appendNote(old, note) {
  if (!note) return old || null;
  if (!old) return note;
  return old.includes(note) ? old : `${old}; ${note}`;
}

/** Tentukan tanggal kerja untuk absen masuk (menangani shift malam yang lintas hari). */
function resolveCheckInDate(employee, now) {
  const today = T.fmtDate(now);
  const yesterday = T.addDays(today, -1);
  const y = getShiftForDate(employee, yesterday);
  if (y.shift && isOvernight(y.shift)) {
    const win = shiftWindow(y.shift, yesterday);
    const rec = getRecord(employee.id, yesterday);
    if (now < win.end && (!rec || !rec.jam_masuk)) return yesterday;
  }
  return today;
}

/** Tentukan tanggal kerja untuk absen pulang. */
function resolveCheckOutDate(employee, now) {
  const today = T.fmtDate(now);
  const todayRec = getRecord(employee.id, today);
  if (todayRec && todayRec.jam_masuk) return today;
  const yesterday = T.addDays(today, -1);
  const yRec = getRecord(employee.id, yesterday);
  if (yRec && yRec.jam_masuk && !yRec.jam_pulang) {
    const shift = getShift(yRec.shift_id);
    const win = shiftWindow(shift, yesterday);
    const limit = win
      ? new Date(win.end.getTime() + CHECKOUT_GRACE_HOURS * 3600000)
      : T.parseDateTime(`${today} 06:00`);
    if (now <= limit) return yesterday;
  }
  return today;
}

class AttendanceError extends Error {}

/**
 * Catat absen masuk/pulang.
 * opts: { employee, mode: 'masuk'|'pulang', now, metode, foto, lat, lng, alamat, skor, status, keterangan }
 */
function recordAttendance(opts) {
  const { employee, mode } = opts;
  const now = opts.now || new Date();
  const nowStr = T.fmtDateTime(now);

  return db.transaction(() => {
    if (mode === 'masuk') {
      const tanggal = resolveCheckInDate(employee, now);
      const existing = getRecord(employee.id, tanggal);
      if (existing && existing.jam_masuk) {
        throw new AttendanceError(`${employee.nama} sudah absen masuk pada ${existing.jam_masuk.slice(11, 16)}.`);
      }
      const { shift, libur } = getShiftForDate(employee, tanggal);
      let keterangan = opts.keterangan || null;
      if (libur) keterangan = appendNote(keterangan, 'Masuk pada hari libur');
      const rec = {
        ...(existing || {}),
        tanggal,
        shift_id: shift ? shift.id : null,
        jam_masuk: nowStr,
        status: opts.status || (existing && FIXED_STATUS.includes(existing.status) ? existing.status : 'hadir'),
      };
      const calc = computeStatus(rec, shift);
      if (existing) {
        db.prepare(`UPDATE attendance SET shift_id=?, jam_masuk=?, status=?, terlambat_menit=?, pulang_cepat_menit=?,
          metode_masuk=?, foto_masuk=?, lat_masuk=?, lng_masuk=?, alamat_masuk=?, skor_wajah_masuk=?, keterangan=?,
          updated_at=datetime('now','localtime') WHERE id=?`)
          .run(rec.shift_id, nowStr, calc.status, calc.terlambat_menit, calc.pulang_cepat_menit, opts.metode,
            opts.foto || null, opts.lat ?? null, opts.lng ?? null, opts.alamat || null, opts.skor ?? null,
            appendNote(existing.keterangan, keterangan), existing.id);
        return { ...getRecord(employee.id, tanggal), shift };
      }
      db.prepare(`INSERT INTO attendance (employee_id, tanggal, shift_id, jam_masuk, status, terlambat_menit,
        pulang_cepat_menit, metode_masuk, foto_masuk, lat_masuk, lng_masuk, alamat_masuk, skor_wajah_masuk, keterangan)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(employee.id, tanggal, rec.shift_id, nowStr, calc.status, calc.terlambat_menit, calc.pulang_cepat_menit,
          opts.metode, opts.foto || null, opts.lat ?? null, opts.lng ?? null, opts.alamat || null, opts.skor ?? null,
          keterangan);
      return { ...getRecord(employee.id, tanggal), shift };
    }

    if (mode === 'pulang') {
      const tanggal = resolveCheckOutDate(employee, now);
      const existing = getRecord(employee.id, tanggal);
      if (existing && existing.jam_pulang) {
        throw new AttendanceError(`${employee.nama} sudah absen pulang pada ${existing.jam_pulang.slice(11, 16)}.`);
      }
      const { shift: schedShift } = getShiftForDate(employee, tanggal);
      const shift = existing && existing.shift_id ? getShift(existing.shift_id) : schedShift;
      let keterangan = opts.keterangan || null;
      if (!existing || !existing.jam_masuk) keterangan = appendNote(keterangan, 'Tidak absen masuk');
      const rec = {
        ...(existing || {}),
        tanggal,
        jam_pulang: nowStr,
        status: (existing && existing.status) || opts.status || 'hadir',
      };
      const calc = computeStatus(rec, shift);
      if (existing) {
        db.prepare(`UPDATE attendance SET jam_pulang=?, status=?, terlambat_menit=?, pulang_cepat_menit=?,
          metode_pulang=?, foto_pulang=?, lat_pulang=?, lng_pulang=?, alamat_pulang=?, skor_wajah_pulang=?, keterangan=?,
          updated_at=datetime('now','localtime') WHERE id=?`)
          .run(nowStr, calc.status, calc.terlambat_menit, calc.pulang_cepat_menit, opts.metode, opts.foto || null,
            opts.lat ?? null, opts.lng ?? null, opts.alamat || null, opts.skor ?? null,
            appendNote(existing.keterangan, keterangan), existing.id);
      } else {
        db.prepare(`INSERT INTO attendance (employee_id, tanggal, shift_id, jam_pulang, status, terlambat_menit,
          pulang_cepat_menit, metode_pulang, foto_pulang, lat_pulang, lng_pulang, alamat_pulang, skor_wajah_pulang, keterangan)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
          .run(employee.id, tanggal, shift ? shift.id : null, nowStr, calc.status, calc.terlambat_menit,
            calc.pulang_cepat_menit, opts.metode, opts.foto || null, opts.lat ?? null, opts.lng ?? null,
            opts.alamat || null, opts.skor ?? null, keterangan);
      }
      return { ...getRecord(employee.id, tanggal), shift };
    }

    throw new AttendanceError('Mode absen tidak valid.');
  })();
}

/**
 * Simpan/ubah data absensi secara manual (admin atau persetujuan klarifikasi).
 * data: { tanggal, jam_masuk 'HH:MM'|null, jam_pulang 'HH:MM'|null, status, keterangan, metode, dispensasi }
 */
function upsertManual(employee, data) {
  const { tanggal } = data;
  const existing = getRecord(employee.id, tanggal);
  const shift = existing && existing.shift_id ? getShift(existing.shift_id) : getShiftForDate(employee, tanggal).shift;

  const toDateTime = (hhmm, isPulang) => {
    if (!hhmm) return null;
    let day = tanggal;
    // Jam pulang shift malam berada di hari berikutnya.
    if (isPulang && shift && isOvernight(shift) && hhmm <= shift.jam_pulang) day = T.addDays(tanggal, 1);
    return `${day} ${hhmm}:00`;
  };

  const jamMasuk = data.jam_masuk === undefined ? existing?.jam_masuk ?? null : toDateTime(data.jam_masuk, false);
  const jamPulang = data.jam_pulang === undefined ? existing?.jam_pulang ?? null : toDateTime(data.jam_pulang, true);
  const dispensasi = data.dispensasi === undefined ? existing?.dispensasi || 0 : data.dispensasi ? 1 : 0;
  const rec = { tanggal, jam_masuk: jamMasuk, jam_pulang: jamPulang, status: data.status || 'hadir', dispensasi };
  const calc = computeStatus(rec, shift);
  const metode = data.metode || 'manual';
  const keterangan = data.keterangan !== undefined ? data.keterangan : existing?.keterangan ?? null;

  if (existing) {
    db.prepare(`UPDATE attendance SET shift_id=?, jam_masuk=?, jam_pulang=?, status=?, terlambat_menit=?,
      pulang_cepat_menit=?, dispensasi=?, metode_masuk=CASE WHEN ? IS NOT jam_masuk THEN ? ELSE metode_masuk END,
      metode_pulang=CASE WHEN ? IS NOT jam_pulang THEN ? ELSE metode_pulang END,
      keterangan=?, updated_at=datetime('now','localtime') WHERE id=?`)
      .run(shift ? shift.id : null, jamMasuk, jamPulang, calc.status, calc.terlambat_menit, calc.pulang_cepat_menit,
        dispensasi, jamMasuk, metode, jamPulang, metode, keterangan, existing.id);
  } else {
    db.prepare(`INSERT INTO attendance (employee_id, tanggal, shift_id, jam_masuk, jam_pulang, status,
      terlambat_menit, pulang_cepat_menit, dispensasi, metode_masuk, metode_pulang, keterangan) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(employee.id, tanggal, shift ? shift.id : null, jamMasuk, jamPulang, calc.status, calc.terlambat_menit,
        calc.pulang_cepat_menit, dispensasi, jamMasuk ? metode : null, jamPulang ? metode : null, keterangan);
  }
  return getRecord(employee.id, tanggal);
}

function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function parseCoord(v, max) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && Math.abs(n) <= max ? n : null;
}

module.exports = {
  isWorkday, parseCoord, STATUS_LABEL, METODE_LABEL, FIXED_STATUS, AttendanceError,
  getShift, getShiftForDate, isOvernight, shiftWindow, computeStatus, getRecord,
  resolveCheckInDate, resolveCheckOutDate, recordAttendance, upsertManual, haversineMeters,
};
