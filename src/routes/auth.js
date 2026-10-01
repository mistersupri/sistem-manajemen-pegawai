const express = require('express');
const bcrypt = require('bcryptjs');
const { db } = require('../db');
const auth = require('../auth');

const router = express.Router();

router.get('/login', (req, res) => {
  if (req.user) return res.redirect('/');
  res.render('login', { title: 'Login', error: null, username: '' });
});

router.post('/login', (req, res) => {
  const user = auth.verifyLogin(req.body.username, req.body.password);
  if (!user) {
    return res.status(401).render('login', {
      title: 'Login', error: 'Username atau password salah, atau akun nonaktif.', username: req.body.username || '',
    });
  }
  auth.createSession(res, user.id);
  res.redirect('/');
});

router.post('/logout', (req, res) => {
  auth.destroySession(req, res);
  res.redirect('/login');
});

router.get('/akun/password', auth.requireLogin, (req, res) => {
  res.render('password', { title: 'Ubah Password', error: null });
});

router.post('/akun/password', auth.requireLogin, (req, res) => {
  const { lama, baru, ulang } = req.body;
  const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);
  let error = null;
  if (!bcrypt.compareSync(String(lama || ''), row.password_hash)) error = 'Password lama salah.';
  else if (String(baru || '').length < 6) error = 'Password baru minimal 6 karakter.';
  else if (baru !== ulang) error = 'Konfirmasi password tidak sama.';
  if (error) return res.status(400).render('password', { title: 'Ubah Password', error });
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(baru, 10), req.user.id);
  res.flash('success', 'Password berhasil diubah.');
  res.redirect('/');
});

module.exports = router;
