'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { loadConfig } = require('../services/storage.js');
const { requireAuth } = require('../middleware/auth.js');
const {
  getJournalctl, runPm2Logs, execSyncSafe,
  findCertFile, getSysctlParams, ensureCertPermissions,
  checkPorts
} = require('../services/systemAdapter.js');

const router = express.Router();
const TEST_MODE = process.env.TEST_MODE === '1';

function testPath(systemPath) {
  if (process.env.TEST_CONFIG_DIR) {
    return path.join(process.env.TEST_CONFIG_DIR, path.basename(systemPath));
  }
  return systemPath;
}

router.get('/logs/:kind', requireAuth, async (req, res) => {
  const { kind } = req.params;
  const lines = Math.max(10, Math.min(parseInt(req.query.lines || '60', 10) || 60, 500));
  const unitMap = { naive: 'caddy', hy2: 'hysteria-server', panel: 'pm2-root' };
  const unit = unitMap[kind];
  if (!unit) return res.status(400).json({ error: 'bad kind' });

  let output;
  if (kind === 'panel') {
    output = await runPm2Logs('panel-naive-hy2', lines);
  } else {
    output = await getJournalctl(unit, lines);
  }
  res.json({ unit: kind === 'panel' ? 'pm2' : unit, output });
});

router.get('/diag/ports', requireAuth, async (req, res) => {
  const output = await checkPorts();
  res.json({ output });
});

router.get('/diag/hysteria-config', requireAuth, (req, res) => {
  const cfgPath = testPath('/etc/hysteria/config.yaml');
  if (!fs.existsSync(cfgPath)) {
    return res.json({ exists: false, output: cfgPath + ' не найден' });
  }
  try {
    let raw = fs.readFileSync(cfgPath, 'utf8');
    raw = raw.replace(/(\s+)([a-zA-Z0-9_.-]+)(:\s*)"[^"]+"/g,
      (m, sp, user, col) => `${sp}${user}${col}"***masked***"`);
    res.json({ exists: true, output: raw });
  } catch (e) {
    res.json({ exists: false, output: 'Ошибка чтения: ' + e.message });
  }
});

router.post('/diag/fix-hy2-tls', requireAuth, async (req, res) => {
  try {
    const cfg = loadConfig();
    if (!cfg.stack || !cfg.stack.hy2) {
      return res.status(400).json({ ok: false, error: 'Hy2 не установлен' });
    }
    const domain = cfg.domain;
    if (!domain) return res.status(400).json({ ok: false, error: 'Домен не задан в config' });

    const tlsBlock = findCertFile(domain);
    if (!tlsBlock) {
      return res.status(404).json({
        ok: false, error: 'Сертификат Caddy не найден на диске',
        hint: 'Caddy должен получить сертификат (проверьте: systemctl status caddy; journalctl -u caddy -n 50)'
      });
    }

    ensureCertPermissions(tlsBlock.cert, tlsBlock.key);

    const hyCfgPath = testPath('/etc/hysteria/config.yaml');
    let hyCfg = {};
    if (fs.existsSync(hyCfgPath)) {
      hyCfg = yaml.load(fs.readFileSync(hyCfgPath, 'utf8')) || {};
    }

    delete hyCfg.acme;
    hyCfg.tls = { cert: tlsBlock.cert, key: tlsBlock.key };
    fs.writeFileSync(hyCfgPath, yaml.dump(hyCfg, { lineWidth: 120, quotingType: '"' }), 'utf8');

    if (!TEST_MODE) {
      execSyncSafe('systemctl reset-failed hysteria-server 2>/dev/null');
      const restart = execSyncSafe('systemctl restart hysteria-server');
      if (!restart.success) {
        return res.status(500).json({
          ok: false, error: 'Конфиг обновлён, но hysteria-server не перезапустился',
          details: restart.error, ...tlsBlock
        });
      }
      await new Promise(r => setTimeout(r, 2500));
    }
    let active = TEST_MODE;
    if (!TEST_MODE) {
      const result = execSyncSafe('systemctl is-active hysteria-server');
      active = result.output === 'active';
    }

    res.json({
      ok: active,
      message: active
        ? `Hy2 TLS починен — cert от ${tlsBlock.ca}, сервис запущен`
        : `Конфиг обновлён, но сервис не активен. journalctl -u hysteria-server -n 30`,
      ...tlsBlock
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.get('/tuning/status', requireAuth, (req, res) => {
  res.json(getSysctlParams());
});

router.post('/tuning/apply', requireAuth, (req, res) => {
  const scriptPath = path.join(__dirname, '../scripts/sysctl_tune.sh');
  if (!fs.existsSync(scriptPath)) return res.json({ success: false, message: 'script not found' });

  const { spawn } = require('child_process');
  const p = spawn('bash', [scriptPath]);
  let out = '', err = '';
  p.stdout.on('data', d => out += d.toString());
  p.stderr.on('data', d => err += d.toString());
  p.on('close', (code) => res.json({ success: code === 0, output: out, error: err }));
  p.on('error', (e) => res.json({ success: false, message: e.message }));
});

module.exports = router;
