process.env.TZ = process.env.TZ || 'Asia/Jakarta';

const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');

const { db, getSettings } = require('./src/db');
const auth = require('./src/auth');
const T = require('./src/time');
const { UPLOAD_DIR } = require('./src/uploads');
const { STATUS_LABEL, METODE_LABEL } = require('./src/attendance');
const { JENIS, STATUS_KLARIFIKASI } = require('./src/routes/clarifications');

// Warna teks chip shift: hitam atau putih, mana yang kontrasnya lebih tinggi di atas warna shift.
function chipText(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return '#ffffff';
  const lin = (i) => {
    const v = parseInt(m[1].slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const L = 0.2126 * lin(0) + 0.7152 * lin(2) + 0.0722 * lin(4);
  const TEKS_GELAP = 0.0196; // luminans #1f2733
  return 1.05 / (L + 0.05) >= (L + 0.05) / (TEKS_GELAP + 0.05) ? '#ffffff' : '#1f2733';
}

const app = express();
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('trust proxy', process.env.TRUST_PROXY === '1');
app.disable('x-powered-by');

const nm = (p) => path.join(__dirname, 'node_modules', p);
app.use('/static', express.static(path.join(__dirname, 'public')));
app.use('/vendor/bootstrap', express.static(nm('bootstrap/dist')));
app.use('/vendor/bootstrap-icons', express.static(nm('bootstrap-icons/font')));
app.use('/vendor/face-api', express.static(nm('@vladmandic/face-api/dist')));
app.use('/models', express.static(nm('@vladmandic/face-api/model'), { maxAge: '7d' }));
app.use('/vendor/font', express.static(nm('@fontsource/plus-jakarta-sans/files'), { maxAge: '30d' }));

app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(express.json({ limit: '8mb' }));
app.use(cookieParser());

// Flash message sederhana berbasis cookie
app.use((req, res, next) => {
  res.locals.flash = null;
  if (req.cookies.flash) {
    try { res.locals.flash = JSON.parse(req.cookies.flash); } catch { /* abaikan */ }
    res.clearCookie('flash');
  }
  res.flash = (type, message) => res.cookie('flash', JSON.stringify({ type, message }), { httpOnly: true, sameSite: 'lax' });
  next();
});

app.use(auth.loadUser);
app.use((req, res, next) => {
  res.locals.settings = getSettings();
  res.locals.T = T;
  res.locals.STATUS_LABEL = STATUS_LABEL;
  res.locals.METODE_LABEL = METODE_LABEL;
  res.locals.JENIS = JENIS;
  res.locals.STATUS_KLARIFIKASI = STATUS_KLARIFIKASI;
  res.locals.chipText = chipText;
  res.locals.pendingKlarifikasi = req.user && req.user.role === 'admin'
    ? db.prepare("SELECT COUNT(*) AS n FROM clarifications WHERE status = 'menunggu'").get().n : 0;
  res.locals.path = req.path;
  res.locals.query = req.query;
  next();
});

app.use(require('./src/routes/auth'));
app.use(require('./src/routes/files'));
app.use(require('./src/routes/admin'));
app.use(require('./src/routes/employees'));
app.use(require('./src/routes/shifts'));
app.use(require('./src/routes/attendance'));
app.use(require('./src/routes/clarifications'));
app.use(require('./src/routes/pegawai'));
app.use(require('./src/routes/devices'));

app.get('/', auth.requireLogin, (req, res) => {
  res.redirect(req.user.role === 'admin' ? '/admin' : '/pegawai');
});

// Logo instansi untuk halaman login & navbar (boleh diakses tanpa login)
app.get('/logo', (req, res) => {
  const rel = getSettings().logo;
  if (!rel) return res.sendStatus(404);
  res.sendFile(path.join(UPLOAD_DIR, rel), { headers: { 'Cache-Control': 'no-cache' } }, (err) => { if (err && !res.headersSent) res.sendStatus(404); });
});

app.get('/api/time', (req, res) => {
  const d = new Date();
  res.json({ now: d.getTime(), tzOffsetMinutes: -d.getTimezoneOffset(), local: T.fmtDateTime(d) });
});

app.use((req, res) => {
  res.status(404).render('error', { title: 'Tidak Ditemukan', message: 'Halaman yang Anda cari tidak ada.' });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = err.status || (err.name === 'MulterError' ? 400 : 500);
  if (status >= 500) console.error(err);
  const message = err.expose || err.code === 'LIMIT_FILE_SIZE' || err.name === 'MulterError' || err.userFacing
    ? err.message : 'Terjadi kesalahan pada server.';
  if (req.path.startsWith('/api/')) return res.status(status).json({ error: message });
  res.status(status).render('error', { title: 'Kesalahan', message });
});

if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  app.listen(port, () => {
    console.log(`Sistem Absensi Pegawai berjalan di http://localhost:${port}`);
  });
  setInterval(auth.cleanupSessions, 3600000).unref();
  require('./src/devices').startScheduler();
}

module.exports = app;
