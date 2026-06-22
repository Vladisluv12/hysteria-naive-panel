'use strict';

const fs = require('fs');
const { spawn } = require('child_process');
const trafficMonitor = require('./trafficMonitor.js');

const TEST_MODE = process.env.NODE_ENV === 'test' || process.env.VITEST;
const TEST_CONFIG_DIR = process.env.TEST_CONFIG_DIR || '';

function testPath(systemPath) {
  if (TEST_CONFIG_DIR) {
    return require('path').join(TEST_CONFIG_DIR, require('path').basename(systemPath));
  }
  return systemPath;
}

const TRAFFIC_FILE = testPath('/etc/rixxx-panel/traffic.json');
const NAIVE_USERS_FILE = testPath('/var/lib/naive/traffic.json');
const NET_DEV = '/proc/net/dev';

function loadTrafficData() {
  try {
    if (fs.existsSync(TRAFFIC_FILE)) {
      return JSON.parse(fs.readFileSync(TRAFFIC_FILE, 'utf8'));
    }
  } catch { /* ignore */ }
  return { daily: { rx: 0, tx: 0 }, hourly: [], lastReset: null };
}

function saveTrafficData(data) {
  try {
    const dir = require('path').dirname(TRAFFIC_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(TRAFFIC_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('[traffic] save error:', e.message);
  }
}

function parseNetDev() {
  try {
    if (!fs.existsSync(NET_DEV)) return null;
    const raw = fs.readFileSync(NET_DEV, 'utf8');
    const lines = raw.split('\n').slice(2);
    let totalRx = 0, totalTx = 0;
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 10) continue;
      const name = parts[0].replace(':', '');
      if (name === 'lo' || name.startsWith('docker') || name.startsWith('veth') || name.startsWith('br-')) continue;
      totalRx += parseInt(parts[1]) || 0;
      totalTx += parseInt(parts[9]) || 0;
    }
    return { rx: totalRx, tx: totalTx };
  } catch { return null; }
}

function collectTraffic() {
  const data = loadTrafficData();
  const current = parseNetDev();
  if (!current) return null;

  const today = new Date().toISOString().slice(0, 10);
  if (data.lastReset !== today) {
    data.daily = { rx: 0, tx: 0 };
    data.lastReset = today;
    data.hourly = [];
  }

  data.daily.rx = current.rx;
  data.daily.tx = current.tx;

  const hour = new Date().toISOString().slice(0, 13);
  const lastHour = data.hourly.length > 0 ? data.hourly[data.hourly.length - 1] : null;
  if (!lastHour || lastHour.hour !== hour) {
    data.hourly.push({ hour, rx: current.rx, tx: current.tx });
    if (data.hourly.length > 48) data.hourly = data.hourly.slice(-48);
  }

  saveTrafficData(data);
  return data;
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(1) + ' ' + units[i];
}

function execSimple(cmd) {
  return new Promise((resolve) => {
    const p = spawn('sh', ['-c', cmd]);
    let out = '';
    p.stdout.on('data', d => out += d.toString());
    p.on('close', () => resolve(out.trim()));
    p.on('error', () => resolve(''));
  });
}

function collectNaiveUsers() {
  try {
    const raw = JSON.parse(fs.readFileSync(NAIVE_USERS_FILE, 'utf8'));
    if (raw && raw.users) {
      Object.keys(raw.users).forEach(user => {
        raw.users[user].rxFormatted = formatBytes(raw.users[user].rx);
        raw.users[user].txFormatted = formatBytes(raw.users[user].tx);
        raw.users[user].totalFormatted = formatBytes(raw.users[user].rx + raw.users[user].tx);
      });
      return raw;
    }
  } catch {
    /* file not written yet, being atomically renamed, or corrupted */
  }
  return { users: {}, updated_at: null };
}

function httpGet(url) {
  return new Promise((resolve, reject) => {
    const http = require('http');
    const req = http.get(url, { timeout: 3000 }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

async function collectHy2Users() {
  try {
    const configPath = testPath('/etc/hysteria/config.yaml');
    if (!fs.existsSync(configPath)) return { users: {}, updated_at: null };

    const yaml = require('js-yaml');
    const config = yaml.load(fs.readFileSync(configPath, 'utf8'));
    const ts = config && config.trafficStats;
    if (!ts || !ts.listen) return { users: {}, updated_at: null };

    const port = ts.listen.split(':').pop();
    const base = `http://127.0.0.1:${port}`;

    const [trafficRaw, onlineRaw] = await Promise.all([
      httpGet(`${base}/traffic`),
      httpGet(`${base}/online`).catch(() => '{}'),
    ]);

    let trafficData = {};
    try { trafficData = JSON.parse(trafficRaw); } catch { /* ignore */ }
    let onlineData = {};
    try { onlineData = JSON.parse(onlineRaw); } catch { /* ignore */ }

    const users = {};
    for (const [username, stats] of Object.entries(trafficData)) {
      const rx = Number(stats.rx) || 0;
      const tx = Number(stats.tx) || 0;
      const conns = Number((onlineData && onlineData[username]) || 0);
      users[username] = {
        rx,
        tx,
        conns,
        rxFormatted: formatBytes(rx),
        txFormatted: formatBytes(tx),
        totalFormatted: formatBytes(rx + tx),
      };
    }

    return { users, updated_at: Date.now() };
  } catch (e) {
    console.warn('[traffic] collectHy2Users error:', e.message);
    return { users: {}, updated_at: null };
  }
}

async function collectActiveConnections() {
  const result = { naive: 0, hy2: 0 };

  if (!TEST_MODE) {
    // NaiveProxy: sum conns from per-user traffic (Caddy tracks this)
    try {
      const raw = JSON.parse(fs.readFileSync(NAIVE_USERS_FILE, 'utf8'));
      if (raw && raw.users) {
        result.naive = Object.values(raw.users).reduce((sum, u) => sum + (u.conns || 0), 0);
      }
    } catch { /* ignore */ }

    // Hysteria2: use :9999/online API
    try {
      const configPath = testPath('/etc/hysteria/config.yaml');
      if (fs.existsSync(configPath)) {
        const yaml = require('js-yaml');
        const config = yaml.load(fs.readFileSync(configPath, 'utf8'));
        const ts = config && config.trafficStats;
        if (ts && ts.listen) {
          const port = ts.listen.split(':').pop();
          const onlineRaw = await httpGet(`http://127.0.0.1:${port}/online`);
          const onlineData = JSON.parse(onlineRaw);
          result.hy2 = Object.values(onlineData).reduce((sum, v) => sum + (Number(v) || 0), 0);
        }
      }
    } catch { /* ignore */ }
  }

  return result;
}

async function getTraffic() {
  const traffic = collectTraffic();
  const connections = await collectActiveConnections();
  const [naiveUsers, hy2Users] = await Promise.all([
    collectNaiveUsers(),
    collectHy2Users(),
  ]);

  const perProtoRaw = await trafficMonitor.readCounters();

  function protoInfo(raw) {
    const total = raw.rx + raw.tx;
    return {
      rx: raw.rx,
      tx: raw.tx,
      rxFormatted: formatBytes(raw.rx),
      txFormatted: formatBytes(raw.tx),
      totalFormatted: formatBytes(total),
    };
  }

  return {
    daily: traffic ? {
      rx: traffic.daily.rx,
      tx: traffic.daily.tx,
      rxFormatted: formatBytes(traffic.daily.rx),
      txFormatted: formatBytes(traffic.daily.tx),
      totalFormatted: formatBytes(traffic.daily.rx + traffic.daily.tx),
    } : null,
    perProto: {
      naive: protoInfo(perProtoRaw.naive),
      hy2: protoInfo(perProtoRaw.hy2),
    },
    perUser: {
      naive: naiveUsers,
      hy2: hy2Users,
    },
    connections,
    hourly: traffic ? traffic.hourly : [],
    lastReset: traffic ? traffic.lastReset : null,
  };
}

module.exports = { getTraffic, collectTraffic, collectNaiveUsers, collectHy2Users, formatBytes, parseNetDev };
