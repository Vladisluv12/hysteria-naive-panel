'use strict';

const DIRTY = { naive: false, hy2: false, mieru: false, vless: false };
let _interval = null;

function markDirty(protocol) {
  if (['naive', 'hy2', 'mieru', 'vless'].includes(protocol)) {
    DIRTY[protocol] = true;
  }
}

async function syncAll() {
  const { loadConfig } = require('./storageFactory.js');
  const { writeCaddyfile, reloadNaive, restartHysteria, restartMieru, restartVless } = require('./systemAdapter.js');
  const cfg = loadConfig();
  const tasks = [];
  if (DIRTY.naive && cfg.stack && cfg.stack.naive) {
    DIRTY.naive = false;
    tasks.push((async () => {
      writeCaddyfile(cfg);
      await reloadNaive();
    })());
  }
  if (DIRTY.hy2 && cfg.stack && cfg.stack.hy2) {
    DIRTY.hy2 = false;
    tasks.push((async () => {
      const { writeHysteriaConfig } = require('../controllers/hysteriaController.js');
      if (writeHysteriaConfig(cfg)) await restartHysteria();
    })());
  }
  if (DIRTY.mieru && cfg.stack && cfg.stack.mieru) {
    DIRTY.mieru = false;
    tasks.push((async () => {
      const { writeMieruConfig } = require('../controllers/mieruController.js');
      if (writeMieruConfig(cfg)) await restartMieru();
    })());
  }
  if (DIRTY.vless && cfg.stack && cfg.stack.vless) {
    DIRTY.vless = false;
    tasks.push((async () => {
      const { writeVlessConfig } = require('../controllers/vlessController.js');
      if (writeVlessConfig(cfg)) await restartVless();
    })());
  }
  await Promise.all(tasks);
}

function startSync(intervalMs) {
  if (_interval) clearInterval(_interval);
  _interval = setInterval(syncAll, intervalMs || 30000);
  _interval.unref();
  return _interval;
}

function stopSync() {
  if (_interval) {
    clearInterval(_interval);
    _interval = null;
  }
}

module.exports = { markDirty, syncAll, startSync, stopSync };
