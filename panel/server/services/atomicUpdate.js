'use strict';

const { loadConfig, saveConfig, loadUsers, saveUsers } = require('./storageFactory.js');

function updateConfig(updater) {
  const cfg = loadConfig();
  updater(cfg);
  saveConfig(cfg);
  return cfg;
}

function updateUsers(updater) {
  const users = loadUsers();
  updater(users);
  saveUsers(users);
  return users;
}

module.exports = { updateConfig, updateUsers };
