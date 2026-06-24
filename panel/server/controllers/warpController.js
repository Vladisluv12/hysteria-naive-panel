'use strict';

const { execFile } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');

const execFileAsync = promisify(execFile);

const WARP_CONFIG_PATH = '/etc/wireguard/warp-config.json';
const WARP_CONF_PATH = '/etc/wireguard/warp.conf';

const DOMAIN_RE = /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/;
const CIDR_RE = /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/;
const BLOCKED_CIDRS = new Set(['0.0.0.0/0', '0.0.0.0', '::/0', '::']);

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

function validateDomains(domains) {
  return domains.filter(d => typeof d === 'string' && DOMAIN_RE.test(d) && d.length <= 253);
}

function validateCIDRs(cidrs) {
  return cidrs.filter(cidr => {
    if (typeof cidr !== 'string' || !CIDR_RE.test(cidr)) return false;
    if (BLOCKED_CIDRS.has(cidr)) return false;
    const octets = cidr.split('/')[0].split('.');
    return octets.every(p => { const n = parseInt(p, 10); return n >= 0 && n <= 255; });
  });
}

async function resolveDomainsToIPs(domains) {
  const safe = validateDomains(domains);
  const promises = safe.map(async (domain) => {
    try {
      const { stdout } = await execFileAsync('dig', ['+short', 'A', domain], { timeout: 3000 });
      return stdout.split('\n')
        .map(ip => ip.trim())
        .filter(ip => ip && /^\d+\.\d+\.\d+\.\d+$/.test(ip));
    } catch { return []; }
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

  const safe = allowedIPs.filter(ip => !BLOCKED_CIDRS.has(ip));
  if (safe.length === 0) return false;

  try { fs.copyFileSync(WARP_CONF_PATH, WARP_CONF_PATH + '.bak'); } catch (_) {}

  let conf = fs.readFileSync(WARP_CONF_PATH, 'utf8');
  const ipList = safe.join(', ');
  conf = conf.replace(/^AllowedIPs\s*=.*$/m, `AllowedIPs = ${ipList}`);
  fs.writeFileSync(WARP_CONF_PATH, conf);
  return true;
}

async function getWarpStatus(req, res) {
  try {
    const active = await new Promise(resolve => {
      execFileAsync('systemctl', ['is-active', 'warp'], { timeout: 3000 })
        .then(r => resolve(r.stdout.trim()))
        .catch(() => resolve(''));
    });

    const results = await Promise.all([
      execFileAsync('curl', ['-s', '--interface', 'warp', '--max-time', '3', 'https://cloudflare.com/cdn-cgi/trace'], { timeout: 5000 }).then(r => r.stdout).catch(() => ''),
      execFileAsync('curl', ['-s', '--max-time', '3', 'https://ifconfig.me'], { timeout: 5000 }).then(r => r.stdout).catch(() => ''),
    ]);
    const [trace, realTrace] = results;

    let warpOn = false;
    let warpIp = '';
    if (trace) {
      warpOn = trace.includes('warp=on');
      const m = trace.match(/^ip=(.+)$/m);
      if (m) warpIp = m[1].trim();
    }

    const realIp = realTrace.trim();

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
    const safeCIDRs = validateCIDRs(config.cidrs);
    const allIPs = [...safeCIDRs, ...resolvedIPs];
    const uniqueIPs = [...new Set(allIPs.filter(ip => ip && ip.trim()).map(toCIDR))];

    if (uniqueIPs.length > 0) {
      rewriteWarpConf(uniqueIPs);
    }

    if (config.enabled) {
      await new Promise((resolve, reject) => {
        execFileAsync('systemctl', ['restart', 'warp'], { timeout: 15000 })
          .then(r => resolve(r))
          .catch(e => resolve(e));
      });
    } else {
      await new Promise((resolve, reject) => {
        execFileAsync('systemctl', ['stop', 'warp'], { timeout: 10000 })
          .then(r => resolve(r))
          .catch(e => resolve(e));
      });
    }

    res.json(config);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

async function startWarp(req, res) {
  try {
    await execFileAsync('systemctl', ['start', 'warp'], { timeout: 10000 });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
}

async function stopWarp(req, res) {
  try {
    await execFileAsync('systemctl', ['stop', 'warp'], { timeout: 10000 });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
}

async function restartWarp(req, res) {
  try {
    await execFileAsync('systemctl', ['restart', 'warp'], { timeout: 15000 });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
}

module.exports = { getWarpStatus, getWarpConfig, updateWarpConfig, startWarp, stopWarp, restartWarp };
