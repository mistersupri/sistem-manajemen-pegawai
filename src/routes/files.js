// Menyajikan file upload (foto absensi, lampiran) hanya untuk pengguna yang berhak.
const path = require('path');
const fs = require('fs');
const express = require('express');
const { requireLogin } = require('../auth');
const { UPLOAD_DIR } = require('../uploads');

const router = express.Router();

router.get('/uploads/*file', requireLogin, (req, res) => {
  const rel = [].concat(req.params.file).join('/');
  const full = path.resolve(UPLOAD_DIR, rel);
  if (!full.startsWith(path.resolve(UPLOAD_DIR) + path.sep)) return res.sendStatus(400);
  // Struktur: <kategori>/<employee_id>/<nama file>. Pegawai hanya boleh melihat file miliknya.
  if (req.user.role !== 'admin') {
    const parts = rel.split('/');
    if (parts.length < 3 || parts[1] !== String(req.user.employee_id)) return res.sendStatus(403);
  }
  if (!fs.existsSync(full)) return res.sendStatus(404);
  res.sendFile(full, { headers: { 'Cache-Control': 'private, max-age=86400' } });
});

module.exports = router;
