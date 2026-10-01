const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const MAX_PHOTO_BYTES = 3 * 1024 * 1024;

function randomName(ext) {
  return `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`;
}

/**
 * Simpan foto dari data URL (image/jpeg atau image/png) ke uploads/<subdir>/.
 * Mengembalikan path relatif (mis. "absensi/12/xxx.jpg") atau melempar Error.
 */
function saveDataUrl(dataUrl, subdir) {
  const m = /^data:image\/(jpeg|png);base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!m) throw new Error('Format foto tidak valid.');
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > MAX_PHOTO_BYTES) throw new Error('Ukuran foto terlalu besar.');
  const isJpeg = buf[0] === 0xff && buf[1] === 0xd8;
  const isPng = buf[0] === 0x89 && buf[1] === 0x50;
  if (!isJpeg && !isPng) throw new Error('Isi foto tidak valid.');
  const dir = path.join(UPLOAD_DIR, subdir);
  fs.mkdirSync(dir, { recursive: true });
  const name = randomName(isJpeg ? '.jpg' : '.png');
  fs.writeFileSync(path.join(dir, name), buf);
  return path.posix.join(subdir.split(path.sep).join('/'), name);
}

function removeFile(rel) {
  if (!rel) return;
  const full = path.resolve(UPLOAD_DIR, rel);
  if (full.startsWith(path.resolve(UPLOAD_DIR) + path.sep)) fs.rm(full, { force: true }, () => {});
}

// Lampiran klarifikasi (gambar / PDF) disimpan ke uploads/klarifikasi/<employee_id>/
const ALLOWED_ATTACHMENT = {
  'image/jpeg': '.jpg', 'image/png': '.png', 'application/pdf': '.pdf',
};

const attachmentUpload = multer({
  storage: multer.diskStorage({
    destination(req, file, cb) {
      const dir = path.join(UPLOAD_DIR, 'klarifikasi', String(req.attachmentOwner || 'umum'));
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename(req, file, cb) {
      cb(null, randomName(ALLOWED_ATTACHMENT[file.mimetype]));
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter(req, file, cb) {
    if (ALLOWED_ATTACHMENT[file.mimetype]) return cb(null, true);
    cb(new Error('Lampiran harus berupa JPG, PNG, atau PDF.'));
  },
});

// File import (Excel/CSV) diproses di memori.
const importUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

function relPath(fullPath) {
  return path.relative(UPLOAD_DIR, fullPath).split(path.sep).join('/');
}

module.exports = { UPLOAD_DIR, saveDataUrl, removeFile, attachmentUpload, importUpload, relPath };
