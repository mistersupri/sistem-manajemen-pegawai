const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { db } = require('./db');

const COOKIE = 'sid';
const SESSION_DAYS = 7;

function createSession(res, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const expires = Date.now() + SESSION_DAYS * 86400000;
  db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(token, userId, expires);
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.COOKIE_SECURE === '1',
    maxAge: SESSION_DAYS * 86400000,
  });
}

function destroySession(req, res) {
  const token = req.cookies[COOKIE];
  if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  res.clearCookie(COOKIE);
}

function loadUser(req, res, next) {
  req.user = null;
  const token = req.cookies[COOKIE];
  if (token) {
    const row = db.prepare(`SELECT u.id, u.username, u.role, u.employee_id, s.expires_at, e.nama, e.status AS employee_status
      FROM sessions s JOIN users u ON u.id = s.user_id LEFT JOIN employees e ON e.id = u.employee_id
      WHERE s.token = ?`).get(token);
    if (row && row.expires_at > Date.now() && (row.role === 'admin' || row.employee_status === 'aktif')) {
      req.user = row;
    } else if (row) {
      db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    }
  }
  res.locals.user = req.user;
  next();
}

const wantsJson = (req) => req.path.startsWith('/api/') || (req.get('accept') || '').includes('application/json');

function requireLogin(req, res, next) {
  if (req.user) return next();
  if (wantsJson(req)) return res.status(401).json({ error: 'Silakan login terlebih dahulu.' });
  res.redirect('/login');
}

function requireAdmin(req, res, next) {
  if (req.user && req.user.role === 'admin') return next();
  if (!req.user) return requireLogin(req, res, next);
  if (wantsJson(req)) return res.status(403).json({ error: 'Akses khusus admin.' });
  res.status(403).render('error', { title: 'Akses Ditolak', message: 'Halaman ini khusus admin.' });
}

function requirePegawai(req, res, next) {
  if (req.user && req.user.employee_id) return next();
  if (!req.user) return requireLogin(req, res, next);
  if (wantsJson(req)) return res.status(403).json({ error: 'Akun ini tidak terhubung dengan data pegawai.' });
  res.status(403).render('error', { title: 'Akses Ditolak', message: 'Akun ini tidak terhubung dengan data pegawai.' });
}

function verifyLogin(username, password) {
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(String(username || '').trim());
  if (!user || !bcrypt.compareSync(String(password || ''), user.password_hash)) return null;
  if (user.employee_id) {
    const emp = db.prepare('SELECT status FROM employees WHERE id = ?').get(user.employee_id);
    if (!emp || emp.status !== 'aktif') return null;
  }
  return user;
}

function cleanupSessions() {
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
}

module.exports = {
  createSession, destroySession, loadUser, requireLogin, requireAdmin, requirePegawai, verifyLogin, cleanupSessions,
};
