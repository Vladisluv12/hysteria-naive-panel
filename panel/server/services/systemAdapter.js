'use strict';

const { spawn, execSync } = require('child_process');

const TEST_MODE = process.env.TEST_MODE === '1';

function runCommand(cmd, args = [], options = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { ...options, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', d => stdout += d.toString());
    child.stderr.on('data', d => stderr += d.toString());
    child.on('close', (code) => resolve({ code, stdout, stderr }));
    child.on('error', (err) => resolve({ code: -1, stdout: '', stderr: err.message }));
  });
}

async function serviceIsActive(unit) {
  if (TEST_MODE) return true;
  const { code, stdout } = await runCommand('systemctl', ['is-active', unit]);
  return code === 0 && stdout.trim() === 'active';
}

async function serviceAction(action, unit) {
  if (TEST_MODE) return { success: true, active: await serviceIsActive(unit) };
  const { code, stderr } = await runCommand('systemctl', [action, unit]);
  if (code !== 0) return { success: false, error: stderr.trim() };

  if (action === 'stop') {
    return { success: true, active: false };
  }

  await new Promise(r => setTimeout(r, 1500));
  const active = await serviceIsActive(unit);
  return { success: true, active };
}

async function reloadCaddy(useTestApi = false, configPath = '/etc/caddy/Caddyfile') {
  if (TEST_MODE && useTestApi) {
    const fs = require('fs');
    const http = require('http');
    try {
      const configData = fs.readFileSync(configPath, 'utf8');
      await new Promise((resolve) => {
        const req = http.request({
          hostname: 'caddy-naive', port: 2019, path: '/load',
          method: 'POST',
          headers: { 'Content-Type': 'text/caddyfile', 'Content-Length': Buffer.byteLength(configData) },
        }, (res) => {
          let body = '';
          res.on('data', d => body += d);
          res.on('end', () => { resolve(); });
        });
        req.on('error', () => resolve());
        req.write(configData);
        req.end();
      });
    } catch (e) { /* ignore */ }
    return;
  }
  await runCommand('bash', ['-c',
    'caddy reload --config /etc/caddy/Caddyfile 2>/dev/null || systemctl reload caddy 2>/dev/null || systemctl restart caddy 2>/dev/null'
  ]);
}

async function reloadNaive(useTestApi = false, configPath = '/etc/naive/Caddyfile') {
  if (TEST_MODE && useTestApi) {
    const fs = require('fs');
    const http = require('http');
    try {
      const configData = fs.readFileSync(configPath, 'utf8');
      await new Promise((resolve) => {
        const req = http.request({
          hostname: 'caddy-naive', port: 2019, path: '/load',
          method: 'POST',
          headers: { 'Content-Type': 'text/caddyfile', 'Content-Length': Buffer.byteLength(configData) },
        }, (res) => {
          let body = '';
          res.on('data', d => body += d);
          res.on('end', () => { resolve(); });
        });
        req.on('error', () => resolve());
        req.write(configData);
        req.end();
      });
    } catch (e) { /* ignore */ }
    return;
  }
  await runCommand('bash', ['-c',
    `caddy-naive reload --config ${configPath} --force 2>/dev/null || systemctl reload naive 2>/dev/null || systemctl restart naive 2>/dev/null`
  ]);
}

async function restartHysteria() {
  if (TEST_MODE) return;
  await runCommand('systemctl', ['restart', 'hysteria']);
}

async function getJournalctl(unit, lines = 60) {
  const { stdout, stderr } = await runCommand('journalctl', ['-u', unit, '-n', String(lines), '--no-pager', '--output=cat']);
  return stdout || stderr || '(no logs)';
}

async function runPm2Logs(appName, lines = 60) {
  const { stdout, stderr } = await runCommand('pm2', ['logs', appName, '--lines', String(lines), '--nostream', '--raw']);
  return stdout || stderr || '(no logs)';
}

function execSyncSafe(command, options = {}) {
  try {
    return { success: true, output: execSync(command, { encoding: 'utf8', timeout: 10000, ...options }).trim() };
  } catch (e) {
    return { success: false, output: e.stdout ? e.stdout.toString().trim() : '', error: e.message };
  }
}

function findCertFile(domain) {
  const roots = [
    '/var/lib/caddy/.local/share/caddy/certificates',
    '/root/.local/share/caddy/certificates'
  ];
  const fs = require('fs');
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    const result = execSyncSafe(`find "${root}" -type f -name "${domain}.crt" 2>/dev/null | head -1`);
    if (!result.success || !result.output) continue;
    const certPath = result.output;
    if (fs.existsSync(certPath)) {
      const keyPath = certPath.replace(/\.crt$/, '.key');
      if (fs.existsSync(keyPath)) {
        return { cert: certPath, key: keyPath, ca: require('path').basename(require('path').dirname(require('path').dirname(certPath))) };
      }
    }
  }
  return null;
}

function getServerIp() {
  const result = execSyncSafe("curl -4 -s --connect-timeout 5 ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}'");
  return result.output || '';
}

function getSysctlParams() {
  const cc = execSyncSafe('sysctl -n net.ipv4.tcp_congestion_control 2>/dev/null').output || 'unknown';
  const qdisc = execSyncSafe('sysctl -n net.core.default_qdisc 2>/dev/null').output || 'unknown';
  const rmem_max = execSyncSafe('sysctl -n net.core.rmem_max 2>/dev/null').output || '0';
  const wmem_max = execSyncSafe('sysctl -n net.core.wmem_max 2>/dev/null').output || '0';
  return { cc, qdisc, rmem_max, wmem_max, bbrOn: cc === 'bbr' && qdisc === 'fq', udpBufOk: Number(rmem_max) >= 16777216 };
}

function ensureCertPermissions(certPath, keyPath) {
  const path = require('path');
  execSyncSafe(
    `chmod -R 755 "${path.dirname(path.dirname(path.dirname(certPath)))}" 2>/dev/null; ` +
    `chmod 644 "${certPath}" 2>/dev/null; ` +
    `chmod 640 "${keyPath}" 2>/dev/null`
  );
}

async function checkPorts(port) {
  const { stdout } = await runCommand('bash', ['-c',
    `echo "tcp:$(ss -tlnp 2>/dev/null | grep -E ":${port} " || echo none)"; ` +
    `echo "udp:$(ss -ulnp 2>/dev/null | grep -E ":${port} " || echo none)"`
  ]);
  return stdout;
}

module.exports = {
  runCommand,
  serviceIsActive,
  serviceAction,
  reloadCaddy,
  reloadNaive,
  restartHysteria,
  getJournalctl,
  runPm2Logs,
  execSyncSafe,
  findCertFile,
  getServerIp,
  getSysctlParams,
  ensureCertPermissions,
  checkPorts,
};
