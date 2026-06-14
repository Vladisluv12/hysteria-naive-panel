'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const yaml = require('js-yaml');
const { loadConfig } = require('../services/storage.js');
const { requireAuth } = require('../middleware/auth.js');

const router = express.Router();
const TEST_MODE = process.env.TEST_MODE === '1';

function testPath(systemPath) {
  if (process.env.TEST_CONFIG_DIR) {
    return path.join(process.env.TEST_CONFIG_DIR, path.basename(systemPath));
  }
  return systemPath;
}

router.get('/logs/:kind', requireAuth, (req, res) => {
  const { kind } = req.params;
  const lines = Math.max(10, Math.min(parseInt(req.query.lines || '60', 10) || 60, 500));
  const unitMap = {
    naive: 'caddy',
    hy2: 'hysteria-server',
    panel: 'pm2-root'
  };
  const unit = unitMap[kind];
  if (!unit) return res.status(400).json({ error: 'bad kind' });

  if (kind === 'panel') {
    const p = spawn('pm2', ['logs', 'panel-naive-hy2', '--lines', String(lines), '--nostream', '--raw']);
    let out = '';
    p.stdout.on('data', d => out += d.toString());
    p.stderr.on('data', d => out += d.toString());
    p.on('close', () => res.json({ unit: 'pm2', output: out || '(no logs)' }));
    p.on('error', () => res.json({ unit: 'pm2', output: 'pm2 недоступен' }));
    return;
  }

  const p = spawn('journalctl', ['-u', unit, '-n', String(lines), '--no-pager', '--output=cat']);
  let out = '';
  p.stdout.on('data', d => out += d.toString());
  p.on('close', () => res.json({ unit, output: out || '(no logs)' }));
  p.on('error', () => res.json({ unit, output: 'journalctl недоступен' }));
});

router.get('/diag/ports', requireAuth, (req, res) => {
  const p = spawn('bash', ['-c',
    'echo "=== TCP/443 (Naive/Caddy) ==="; (ss -tlnp 2>/dev/null | grep -E ":443 " || echo "(никто не слушает)"); ' +
    'echo ""; echo "=== UDP/443 (Hysteria2) ==="; (ss -ulnp 2>/dev/null | grep -E ":443 " || echo "(никто не слушает)"); ' +
    'echo ""; echo "=== Статус сервисов ==="; ' +
    'echo "caddy:            $(systemctl is-active caddy 2>/dev/null || echo unknown)"; ' +
    'echo "hysteria-server:  $(systemctl is-active hysteria-server 2>/dev/null || echo unknown)"; ' +
    'echo ""; echo "=== Hysteria TLS ==="; ' +
    'if [ -f /etc/hysteria/config.yaml ]; then ' +
    '  TLS_CERT=$(grep -E "^\\s*cert:" /etc/hysteria/config.yaml 2>/dev/null | head -1 | sed "s/.*cert:\\s*//" | tr -d " "); ' +
    '  TLS_KEY=$(grep -E "^\\s*key:" /etc/hysteria/config.yaml 2>/dev/null | head -1 | sed "s/.*key:\\s*//" | tr -d " "); ' +
    '  ACME_ON=$(grep -c "^acme:" /etc/hysteria/config.yaml 2>/dev/null || echo 0); ' +
    '  if [ -n "$TLS_CERT" ]; then ' +
    '    echo "TLS mode: shared (Caddy cert)"; ' +
    '    echo "cert: $TLS_CERT"; ' +
    '    if [ -f "$TLS_CERT" ]; then echo "  └─ exists ✓ ($(stat -c %s "$TLS_CERT") bytes, perms $(stat -c %a "$TLS_CERT"))"; ' +
    '    else echo "  └─ FILE MISSING ✗ (Hy2 не сможет загрузиться!)"; fi; ' +
    '    echo "key:  $TLS_KEY"; ' +
    '    if [ -f "$TLS_KEY" ]; then echo "  └─ exists ✓ (perms $(stat -c %a "$TLS_KEY"))"; ' +
    '    else echo "  └─ FILE MISSING ✗"; fi; ' +
    '  elif [ "$ACME_ON" -gt 0 ]; then ' +
    '    echo "TLS mode: ACME (Hy2 сам получает cert)"; ' +
    '    echo "(убедитесь что порт 80/tcp свободен или что cert уже получен)"; ' +
    '  else echo "TLS: НЕ НАСТРОЕН в конфиге ✗"; fi; ' +
    'else echo "/etc/hysteria/config.yaml не найден"; fi; ' +
    'echo ""; echo "=== Masquerade ==="; ' +
    'if [ -f /etc/hysteria/config.yaml ]; then ' +
    '  MASQ_TYPE=$(awk "/^masquerade:/{f=1;next} f && /^[^ ]/{f=0} f && /type:/{print \\$2; exit}" /etc/hysteria/config.yaml); ' +
    '  echo "type: ${MASQ_TYPE:-(не задано)}"; ' +
    'fi'
  ]);
  let out = '';
  p.stdout.on('data', d => out += d.toString());
  p.on('close', () => res.json({ output: out }));
  p.on('error', () => res.json({ output: 'команды недоступны' }));
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
    if (!domain) {
      return res.status(400).json({ ok: false, error: 'Домен не задан в config' });
    }

    const roots = [
      '/var/lib/caddy/.local/share/caddy/certificates',
      '/root/.local/share/caddy/certificates'
    ];
    let certPath = null, keyPath = null, ca = null;
    for (const root of roots) {
      if (!fs.existsSync(root)) continue;
      try {
        const result = require('child_process').execSync(
          `find "${root}" -type f -name "${domain}.crt" 2>/dev/null | head -1`,
          { encoding: 'utf8' }
        ).trim();
        if (result && fs.existsSync(result)) {
          const k = result.replace(/\.crt$/, '.key');
          if (fs.existsSync(k)) {
            certPath = result;
            keyPath = k;
            ca = path.basename(path.dirname(path.dirname(result)));
            break;
          }
        }
      } catch (e) { /* ignore */ }
    }

    if (!certPath) {
      return res.status(404).json({
        ok: false,
        error: 'Сертификат Caddy не найден на диске',
        hint: 'Caddy должен получить сертификат (проверьте: systemctl status caddy; journalctl -u caddy -n 50)'
      });
    }

    try {
      require('child_process').execSync(
        `chmod -R 755 "${path.dirname(path.dirname(path.dirname(certPath)))}" 2>/dev/null; ` +
        `chmod 644 "${certPath}" 2>/dev/null; ` +
        `chmod 640 "${keyPath}" 2>/dev/null`,
        { encoding: 'utf8' }
      );
    } catch {}

    const hyCfgPath = testPath('/etc/hysteria/config.yaml');
    let hyCfg = {};
    if (fs.existsSync(hyCfgPath)) {
      hyCfg = yaml.load(fs.readFileSync(hyCfgPath, 'utf8')) || {};
    }

    delete hyCfg.acme;
    hyCfg.tls = { cert: certPath, key: keyPath };

    fs.writeFileSync(hyCfgPath, yaml.dump(hyCfg, { lineWidth: 120, quotingType: '"' }), 'utf8');

    if (!TEST_MODE) {
      const { execSync } = require('child_process');
      try { execSync('systemctl reset-failed hysteria-server 2>/dev/null'); } catch {}
      try { execSync('systemctl restart hysteria-server'); } catch (e) {
        return res.status(500).json({
          ok: false,
          error: 'Конфиг обновлён, но hysteria-server не перезапустился',
          details: e.message,
          certPath, keyPath, ca
        });
      }
      await new Promise(r => setTimeout(r, 2500));
    }
    let active = TEST_MODE ? true : false;
    if (!TEST_MODE) {
      try { active = require('child_process').execSync('systemctl is-active hysteria-server').toString().trim() === 'active'; } catch {}
    }

    res.json({
      ok: active,
      message: active
        ? `Hy2 TLS починен — cert от ${ca}, сервис запущен`
        : `Конфиг обновлён, но сервис не активен. journalctl -u hysteria-server -n 30`,
      certPath, keyPath, ca
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── Sysctl tuning ──
router.get('/tuning/status', requireAuth, (req, res) => {
  const p = spawn('bash', ['-c',
    'echo cc=$(sysctl -n net.ipv4.tcp_congestion_control 2>/dev/null || echo unknown); ' +
    'echo qdisc=$(sysctl -n net.core.default_qdisc 2>/dev/null || echo unknown); ' +
    'echo rmem_max=$(sysctl -n net.core.rmem_max 2>/dev/null || echo unknown); ' +
    'echo wmem_max=$(sysctl -n net.core.wmem_max 2>/dev/null || echo unknown)'
  ]);
  let out = '';
  p.stdout.on('data', d => out += d.toString());
  p.on('close', () => {
    const parsed = {};
    out.split('\n').forEach(line => {
      const [k, v] = line.split('=');
      if (k && v) parsed[k.trim()] = v.trim();
    });
    res.json({
      cc: parsed.cc || 'unknown',
      qdisc: parsed.qdisc || 'unknown',
      rmem_max: parsed.rmem_max || 'unknown',
      wmem_max: parsed.wmem_max || 'unknown',
      bbrOn: parsed.cc === 'bbr' && parsed.qdisc === 'fq',
      udpBufOk: Number(parsed.rmem_max || 0) >= 16777216
    });
  });
  p.on('error', () => res.json({ error: 'sysctl недоступен' }));
});

router.post('/tuning/apply', requireAuth, (req, res) => {
  const scriptPath = path.join(__dirname, '../scripts/sysctl_tune.sh');
  if (!fs.existsSync(scriptPath)) return res.json({ success: false, message: 'script not found' });
  const p = spawn('bash', [scriptPath]);
  let out = '', err = '';
  p.stdout.on('data', d => out += d.toString());
  p.stderr.on('data', d => err += d.toString());
  p.on('close', (code) => {
    res.json({ success: code === 0, output: out, error: err });
  });
  p.on('error', (e) => res.json({ success: false, message: e.message }));
});

module.exports = router;
