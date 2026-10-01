process.env.TZ = process.env.TZ || 'Asia/Jakarta';

const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');

const { getSettings } = require('./src/db');
const auth = require('./src/auth');
const T = require('./src/time');
const { STATUS_LABEL, METODE_LABEL } = require('./src/attendance');
const { JENIS, STATUS_KLARIFIKASI } = require('./src/routes/clarifications');

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

app.get('/', auth.requireLogin, (req, res) => {
  res.redirect(req.user.role === 'admin' ? '/admin' : '/pegawai');
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
}

module.exports = app;
