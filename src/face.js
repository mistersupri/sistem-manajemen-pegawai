// Pencocokan descriptor wajah (128 dimensi dari face-api.js) dilakukan di server
// agar data biometrik pegawai tidak dikirim ke browser.
const { db, getSettings } = require('./db');

const MAX_SAMPLES = 10;

function parseDescriptor(input) {
  if (!Array.isArray(input) || input.length !== 128) return null;
  const arr = input.map(Number);
  return arr.every(Number.isFinite) ? arr : null;
}

function euclidean(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2;
  return Math.sqrt(s);
}

function samplesOf(employee) {
  try {
    const list = JSON.parse(employee.face_descriptors || '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function bestDistance(employee, descriptor) {
  let best = Infinity;
  for (const s of samplesOf(employee)) best = Math.min(best, euclidean(s, descriptor));
  return best;
}

function threshold() {
  const t = parseFloat(getSettings().face_threshold);
  return Number.isFinite(t) && t > 0 ? t : 0.5;
}

/** Cari pegawai aktif yang paling cocok dengan descriptor. */
function identify(descriptor) {
  const rows = db.prepare("SELECT * FROM employees WHERE status = 'aktif' AND face_descriptors IS NOT NULL").all();
  let best = null;
  for (const emp of rows) {
    const d = bestDistance(emp, descriptor);
    if (!best || d < best.distance) best = { employee: emp, distance: d };
  }
  if (!best || best.distance > threshold()) return { match: null, distance: best ? best.distance : null };
  return { match: best.employee, distance: best.distance };
}

/** Verifikasi bahwa descriptor milik pegawai tertentu. */
function verify(employee, descriptor) {
  const distance = bestDistance(employee, descriptor);
  return { ok: distance <= threshold(), distance };
}

/** Ubah jarak menjadi skor kemiripan 0-100 untuk ditampilkan. */
function similarity(distance) {
  if (distance == null || !Number.isFinite(distance)) return null;
  return Math.max(0, Math.round((1 - distance) * 100));
}

module.exports = { MAX_SAMPLES, parseDescriptor, samplesOf, identify, verify, similarity, threshold };
