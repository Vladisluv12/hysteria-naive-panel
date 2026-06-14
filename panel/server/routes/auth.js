'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const { loadUsers, saveUsers } = require('../services/storage.js');
const { loginLimiter, requireAuth } = require('../middleware/auth.js');

const router = express.Router();

router.post('/login', loginLimiter, (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.json({ success: false, message: 'Заполните все поля' });
  const users = loadUsers();
  const user = users[username];
  if (!user) return res.json({ success: false, message: 'Неверный логин или пароль' });
  if (!bcrypt.compareSync(password, user.password)) {
    return res.json({ success: false, message: 'Неверный логин или пароль' });
  }
  req.session.authenticated = true;
  req.session.username = username;
  req.session.role = user.role;
  const mustChangePassword = (username === 'admin' && bcrypt.compareSync('admin', user.password));
  res.json({ success: true, mustChangePassword });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

router.get('/me', requireAuth, (req, res) => {
  const users = loadUsers();
  const user = users[req.session.username];
  const mustChangePassword = user && req.session.username === 'admin' && bcrypt.compareSync('admin', user.password);
  res.json({ username: req.session.username, role: req.session.role, mustChangePassword });
});

router.post('/config/change-password', requireAuth, (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) return res.json({ success: false, message: 'Заполните все поля' });
  if (newPassword.length < 6) return res.json({ success: false, message: 'Новый пароль минимум 6 символов' });
  const users = loadUsers();
  const user = users[req.session.username];
  if (!user) return res.json({ success: false, message: 'Пользователь не найден' });
  if (!bcrypt.compareSync(currentPassword, user.password)) {
    return res.json({ success: false, message: 'Текущий пароль неверен' });
  }
  user.password = bcrypt.hashSync(newPassword, 10);
  saveUsers(users);
  res.json({ success: true, message: 'Пароль успешно изменён' });
});

module.exports = router;
