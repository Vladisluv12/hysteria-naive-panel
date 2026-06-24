'use strict';

const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');

const execAsync = promisify(exec);

const WARP_CONFIG_PATH = '/etc/wireguard/warp-config.json';
const WARP_CONF_PATH = '/etc/wireguard/warp.conf';

const DEFAULT_CONFIG = {
  enabled: false,
  domains: [
    'icanhazip.com', 'ipinfo.io', 'ip-api.com', 'checkip.amazonaws.com',
    'google.com', 'googleapis.com', 'gstatic.com', 'googleusercontent.com',
    'ggpht.com', 'googletagmanager.com', 'googleadservices.com',
    'cloudfunctions.net', 'firebaseio.com', 'firebaseapp.com', 'web.app',
  ],
  cidrs: [
    '104.16.132.229', '104.16.133.229', '172.64.139.179', '172.64.140.34',
    '34.117.59.0/24', '108.61.164.0/24',
  ],
};

async function run(cmd, timeoutMs = 5000) {
  try {
    const { stdout } = await execAsync(cmd, { timeout: timeoutMs });
    return stdout.trim();
  } catch (_) {
    return '';
  }
}

function loadConfig() {
  try {
    if (fs.existsSync(WARP_CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(WARP_CONFIG_PATH, 'utf8'));
    }
  } catch (_) {}
  return DEFAULT_CONFIG;
}

function saveConfig(config) {
  const dir = path.dirname(WARP_CONFIG_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(WARP_CONFIG_PATH, JSON.stringify(config, null, 2));
}

async function resolveDomainsToIPs(domains) {
  const promises = domains.map(async (domain) => {
    const out = await run(`dig +short A ${domain} 2>/dev/null | grep -E '^[0-9]' | head -3`, 3000);
    return out ? out.split('\n').map(ip => ip.trim()).filter(Boolean) : [];
  });
  const results = await Promise.all(promises);
  return results.flat();
}

function toCIDR(ip) {
  if (ip.includes('/')) return ip;
  return ip + '/32';
}

function rewriteWarpConf(allowedIPs) {
  if (!fs.existsSync(WARP_CONF_PATH)) return false;
  let conf = fs.readFileSync(WARP_CONF_PATH, 'utf8');
  const ipList = allowedIPs.join(', ');
  conf = conf.replace(/^AllowedIPs\s*=.*$/m, `AllowedIPs = ${ipList}`);
  fs.writeFileSync(WARP_CONF_PATH, conf);
  return true;
}

async function getWarpStatus(req, res) {
  try {
    const active = await run('systemctl is-active warp');

    const [trace, realTrace] = await Promise.all([
      run('curl -s --interface warp --max-time 3 https://cloudflare.com/cdn-cgi/trace', 5000),
      run('curl -s --max-time 3 https://ifconfig.me', 5000),
    ]);

    let warpOn = false;
    let warpIp = '';
    if (trace) {
      warpOn = trace.includes('warp=on');
      const m = trace.match(/^ip=(.+)$/m);
      if (m) warpIp = m[1].trim();
    }

    const realIp = realTrace || '';

    res.json({ active: active === 'active', warpOn, warpIp, realIp });
  } catch (e) {
    res.json({ active: false, warpOn: false, warpIp: '', realIp: '', error: e.message });
  }
}

function getWarpConfig(req, res) {
  res.json(loadConfig());
}

async function updateWarpConfig(req, res) {
  try {
    const { enabled, domains, cidrs } = req.body;
    const config = {
      enabled: enabled !== undefined ? enabled : false,
      domains: Array.isArray(domains) ? domains : [],
      cidrs: Array.isArray(cidrs) ? cidrs : [],
    };
    saveConfig(config);

    const resolvedIPs = await resolveDomainsToIPs(config.domains);
    const allIPs = [...config.cidrs, ...resolvedIPs];
    const uniqueIPs = [...new Set(allIPs.filter(ip => ip && ip.trim()).map(toCIDR))];

    if (uniqueIPs.length > 0) {
      rewriteWarpConf(uniqueIPs);
    }

    if (config.enabled) {
      await run('systemctl restart warp', 15000);
    } else {
      await run('systemctl stop warp', 10000);
    }

    res.json(config);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

async function startWarp(req, res) {
  const result = await run('systemctl start warp', 10000);
  if (result === '') return res.status(500).json({ ok: false, error: 'start failed' });
  res.json({ ok: true });
}

async function stopWarp(req, res) {
  const result = await run('systemctl stop warp', 10000);
  if (result === '') return res.status(500).json({ ok: false, error: 'stop failed' });
  res.json({ ok: true });
}

async function restartWarp(req, res) {
  const result = await run('systemctl restart warp', 15000);
  if (result === '') return res.status(500).json({ ok: false, error: 'restart failed' });
  res.json({ ok: true });
}

module.exports = { getWarpStatus, getWarpConfig, updateWarpConfig, startWarp, stopWarp, restartWarp };
