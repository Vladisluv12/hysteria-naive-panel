/* ═══════════════════════════════════════════════════════════
   Panel Naive + Hysteria2 by RIXXX — Backend
   ═══════════════════════════════════════════════════════════ */

'use strict';

const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const cors = require('cors');
const bodyParser = require('body-parser');
const http = require('http');
const WebSocket = require('ws');
const trafficMonitor = require('./trafficMonitor.js');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;
// LISTEN_HOST: 0.0.0.0 (по умолчанию — публично) | 127.0.0.1 (SSH-only режим).
// Управляется через Environment=LISTEN_HOST=... в systemd-юните или
// --env LISTEN_HOST=... в PM2. Дефолт сохраняет обратную совместимость
// со всеми существующими установками.
const LISTEN_HOST = process.env.LISTEN_HOST || '0.0.0.0';

// ── TEST_MODE override (integration tests) ──────────────
const TEST_MODE = process.env.TEST_MODE === '1';
const TEST_CONFIG_DIR = process.env.TEST_CONFIG_DIR || '';
function testPath(systemPath) {
  if (TEST_CONFIG_DIR) {
    return path.join(TEST_CONFIG_DIR, path.basename(systemPath));
  }
  return systemPath;
}

const DATA_DIR = path.join(__dirname, '../data');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const SECRET_FILE = path.join(DATA_DIR, '.session_secret');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// ─── Session secret (персистентный, генерится при первом запуске) ───
let SESSION_SECRET;
try {
  SESSION_SECRET = fs.readFileSync(SECRET_FILE, 'utf8').trim();
  if (!SESSION_SECRET || SESSION_SECRET.length < 32) throw new Error('short');
} catch {
  SESSION_SECRET = crypto.randomBytes(48).toString('hex');
  fs.writeFileSync(SECRET_FILE, SESSION_SECRET, { mode: 0o600 });
}

const { loadConfig, saveConfig, loadUsers, saveUsers, defaultConfig } = require('./services/storageFactory.js');
const { updateConfig } = require('./services/atomicUpdate.js');
const { loginLimiter, requireAuth } = require('./middleware/auth.js');
const { isValidDomain, isValidEmail, isValidUsername, isValidPassword, isValidExpireDays, computeExpiresAt, isExpired, remainingSeconds } = require('./utils/validators.js');

app.set('trust proxy', 1);

app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: {
    directives: {
      'default-src': ["'self'"],
      'script-src': ["'self'", "'unsafe-inline'"],
      'style-src': ["'self'", "'unsafe-inline'"],
      'img-src': ["'self'", 'data:'],
      'connect-src': ["'self'", 'ws:', 'wss:'],
    },
  },
}));

app.use(cors({ origin: true, credentials: true }));
app.use(bodyParser.json({ limit: '256kb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '256kb' }));

const sessionMiddleware = session({
  name: 'rixxx_sid',
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: true,
  cookie: {
    secure: 'auto',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000
  }
});
app.use(sessionMiddleware);

const frontendDir = process.env.USE_NEW_FRONTEND === 'true'
  ? path.join(__dirname, '..', 'dist')
  : path.join(__dirname, '..', 'public');

// Static middleware before API routes, not requiring session
app.use(express.static(frontendDir));

const authRoutes = require('./routes/auth.js');
app.use('/api', authRoutes);

const systemRoutes = require('./routes/system.js');
app.use('/api', systemRoutes);

const naiveRoutes = require('./routes/naive.js');
app.use('/api', naiveRoutes);

const hysteriaRoutes = require('./routes/hysteria.js');
app.use('/api', hysteriaRoutes);

const diagRoutes = require('./routes/diag.js');
app.use('/api', diagRoutes);

const warpRoutes = require('./routes/warp.js');
app.use('/api', warpRoutes);

const aclRoutes = require('./routes/acl.js');
app.use('/api', aclRoutes);

const mieruRoutes = require('./routes/mieru.js');
app.use('/api', mieruRoutes);

const vlessRoutes = require('./routes/vless.js');
app.use('/api', vlessRoutes);

// ── Экспорт для expireChecker ──
const { writeCaddyfile } = naiveRoutes;
const { writeHysteriaConfig } = hysteriaRoutes;
const { writeMieruConfig } = mieruRoutes;
const { writeVlessConfig } = vlessRoutes;
const { reloadNaive, restartHysteria: reloadHysteria, restartMieru: reloadMieru, restartVless: reloadVless, runCommand } = require('./services/systemAdapter.js');

//  INSTALL VIA WEBSOCKET
// ═══════════════════════════════════════════════════════════
wss.on('connection', (ws, req) => {
  const fakeRes = { getHeader: () => {}, setHeader: () => {} };
  sessionMiddleware(req, fakeRes, () => {
    if (!req.session?.authenticated) {
      ws.send(JSON.stringify({ type: 'error', message: 'unauthorized' }));
      ws.close();
      return;
    }

    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message);
        if (data.type === 'install_naive') return handleInstallNaive(ws, data);
        if (data.type === 'install_hy2')   return handleInstallHy2(ws, data);
        if (data.type === 'install_mieru') return handleInstallMieru(ws, data);
        if (data.type === 'install_vless') return handleInstallVless(ws, data);
        if (data.type === 'install_both')  return handleInstallBoth(ws, data);
      } catch (e) {
        ws.send(JSON.stringify({ type: 'error', message: 'bad message' }));
      }
    });
  });
});

function sendLog(ws, text, step = null, progress = null, level = 'info') {
  if (ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ type: 'log', text, step, progress, level }));
}

function parseLogLine(line) {
  const stepMap = [
    { p: /STEP:1/,    step: 'update',    progress: 8,  text: '📦 Обновление системы...' },
    { p: /STEP:2/,    step: 'bbr',       progress: 15, text: '⚡ BBR + UDP тюнинг...' },
    { p: /STEP:3/,    step: 'firewall',  progress: 22, text: '🛡 Файрволл...' },
    { p: /STEP:4/,    step: 'dl',        progress: 35, text: '📥 Загрузка бинарника...' },
    { p: /STEP:5/,    step: 'build',     progress: 60, text: '🔨 Сборка / настройка...' },
    { p: /STEP:6/,    step: 'config',    progress: 75, text: '📝 Конфигурация...' },
    { p: /STEP:7/,    step: 'service',   progress: 85, text: '⚙ Systemd сервис...' },
    { p: /STEP:8/,    step: 'start',     progress: 93, text: '🟢 Запуск...' },
    { p: /STEP:DONE/, step: 'done',      progress: 100, text: '✅ Готово!' },
  ];
  for (const s of stepMap) {
    if (s.p.test(line)) return { text: s.text, step: s.step, progress: s.progress, level: 'step' };
  }
  if (/error|ошибка|failed|fail/i.test(line)) return { text: line, level: 'error' };
  if (/warn|⚠/i.test(line)) return { text: line, level: 'warn' };
  if (/✅|✓|OK:/i.test(line)) return { text: line, level: 'success' };
  return { text: line, level: 'info' };
}

function runScript(ws, scriptName, env, onExit, outputCollector) {
  const scriptPath = path.join(__dirname, '../scripts', scriptName);
  if (!fs.existsSync(scriptPath)) {
    sendLog(ws, `❌ Скрипт ${scriptName} не найден!`, null, null, 'error');
    ws.send(JSON.stringify({ type: 'install_error', message: scriptName + ' not found' }));
    return;
  }
  const child = spawn('bash', [scriptPath], { env: { ...process.env, ...env, DEBIAN_FRONTEND: 'noninteractive' } });

  child.stdout.on('data', (data) => {
    const text = data.toString();
    if (outputCollector) outputCollector.push(text);
    text.split('\n').filter(l => l.trim()).forEach(line => {
      const parsed = parseLogLine(line);
      sendLog(ws, parsed.text, parsed.step, parsed.progress, parsed.level);
    });
  });
  child.stderr.on('data', (data) => {
    data.toString().split('\n').filter(l => l.trim()).forEach(line => {
      if (!line.includes('WARNING')) sendLog(ws, line, null, null, 'warn');
    });
  });
  child.on('close', onExit);
  child.on('error', (err) => {
    sendLog(ws, `❌ ${err.message}`, null, null, 'error');
    ws.send(JSON.stringify({ type: 'install_error', message: err.message }));
  });
}

// Helper: вытянуть server_ip в конфиг
function persistServerIp(cfg) {
  const p = spawn('bash', ['-c', "curl -4 -s --connect-timeout 5 ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}'"], {
    env: { ...process.env, PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin' }
  });
  let ip = '';
  p.stdout.on('data', d => ip += d.toString().trim());
  p.on('close', () => {
    if (ip) {
      updateConfig(c => {
        c.serverIp = ip;
        c.arch = require('os').arch();
      });
    }
  });
}

function handleInstallNaive(ws, data) {
  const { domain, email, login, password } = data;
  if (!isValidDomain(domain)) return ws.send(JSON.stringify({ type: 'install_error', message: 'Неверный домен' }));
  if (!isValidEmail(email)) return ws.send(JSON.stringify({ type: 'install_error', message: 'Неверный email' }));
  if (!isValidUsername(login)) return ws.send(JSON.stringify({ type: 'install_error', message: 'Неверный логин' }));
  if (!isValidPassword(password)) return ws.send(JSON.stringify({ type: 'install_error', message: 'Пароль минимум 8 символов' }));

  const cfg = updateConfig(c => {
    c.domain = domain;
    c.email = email;
    c.stack.naive = true;
    if (!c.naiveUsers.find(u => u.username === login)) {
      c.naiveUsers.push({ username: login, password, createdAt: new Date().toISOString() });
    }
  });
  persistServerIp();

  sendLog(ws, '🚀 Запуск установки NaiveProxy...', 'init', 2, 'info');
  runScript(ws, 'install_naiveproxy.sh', {
    NAIVE_DOMAIN: domain, NAIVE_EMAIL: email,
    NAIVE_LOGIN: login, NAIVE_PASSWORD: password,
    PORT: String(cfg.port || 443)
  }, (code) => {
    if (code === 0) {
      updateConfig(c => { c.installed = true; });
      sendLog(ws, '✅ NaiveProxy готов!', 'done', 100, 'success');
      ws.send(JSON.stringify({
        type: 'install_done',
        links: {
          naive: `naive+https://${encodeURIComponent(login)}:${encodeURIComponent(password)}@${domain}:${cfg.port || 443}#${encodeURIComponent(login)}`
        }
      }));
    } else {
      ws.send(JSON.stringify({ type: 'install_error', message: `Exit code: ${code}` }));
    }
  });
}

function handleInstallHy2(ws, data) {
  const { domain, email, password, useCaddyCert } = data;
  if (!isValidDomain(domain)) return ws.send(JSON.stringify({ type: 'install_error', message: 'Неверный домен' }));
  if (!isValidEmail(email)) return ws.send(JSON.stringify({ type: 'install_error', message: 'Неверный email' }));
  if (!isValidPassword(password)) return ws.send(JSON.stringify({ type: 'install_error', message: 'Пароль минимум 8 символов' }));

  const cfg = updateConfig(c => {
    c.domain = domain;
    c.email = email;
    c.stack.hy2 = true;
    const defUser = c.hy2Users.find(u => u.username === 'default');
    if (defUser) {
      defUser.password = password;
    } else {
      c.hy2Users.push({ username: 'default', password, createdAt: new Date().toISOString() });
    }
  });
  persistServerIp();

  sendLog(ws, '⚡ Запуск установки Hysteria2...', 'init', 2, 'info');
  runScript(ws, 'install_hysteria.sh', {
    HY_DOMAIN: domain, HY_EMAIL: email, HY_PASSWORD: password,
    USE_CADDY_CERT: useCaddyCert ? '1' : '0',
    PORT: String(cfg.port || 443)
  }, (code) => {
    if (code === 0) {
      updateConfig(c => { c.installed = true; });
      sendLog(ws, '✅ Hysteria2 готова!', 'done', 100, 'success');
      ws.send(JSON.stringify({
        type: 'install_done',
        links: {
          hy2: `hysteria2://default:${encodeURIComponent(password)}@${domain}:${cfg.port || 443}?sni=${domain}&insecure=0#default`
        }
      }));
    } else {
      ws.send(JSON.stringify({ type: 'install_error', message: `Exit code: ${code}` }));
    }
  });
}

function handleInstallBoth(ws, data) {
  const { domain, email, naiveLogin, naivePassword, hy2Password } = data;
  if (!isValidDomain(domain)) return ws.send(JSON.stringify({ type: 'install_error', message: 'Неверный домен' }));
  if (!isValidEmail(email)) return ws.send(JSON.stringify({ type: 'install_error', message: 'Неверный email' }));
  if (!isValidUsername(naiveLogin)) return ws.send(JSON.stringify({ type: 'install_error', message: 'Неверный Naive логин' }));
  if (!isValidPassword(naivePassword)) return ws.send(JSON.stringify({ type: 'install_error', message: 'Naive пароль 8+ символов' }));
  if (!isValidPassword(hy2Password)) return ws.send(JSON.stringify({ type: 'install_error', message: 'Hy2 пароль 8+ символов' }));

  const cfg = updateConfig(c => {
    c.domain = domain;
    c.email = email;
    c.stack.naive = true;
    c.stack.hy2 = true;
    if (!c.naiveUsers.find(u => u.username === naiveLogin)) {
      c.naiveUsers.push({ username: naiveLogin, password: naivePassword, createdAt: new Date().toISOString() });
    }
    const existDef = c.hy2Users.find(u => u.username === 'default');
    if (existDef) existDef.password = hy2Password;
    else c.hy2Users.push({ username: 'default', password: hy2Password, createdAt: new Date().toISOString() });
  });
  persistServerIp();

  sendLog(ws, '🚀 Установка Naive + Hy2 последовательно...', 'init', 2, 'info');

  runScript(ws, 'install_naiveproxy.sh', {
    NAIVE_DOMAIN: domain, NAIVE_EMAIL: email,
    NAIVE_LOGIN: naiveLogin, NAIVE_PASSWORD: naivePassword,
    WITH_HY2: '1',
    PORT: String(cfg.port || 443)
  }, (codeNaive) => {
    if (codeNaive !== 0) {
      ws.send(JSON.stringify({ type: 'install_error', message: `Naive failed: ${codeNaive}` }));
      return;
    }
    sendLog(ws, '✅ Naive ок, запускаю Hy2...', null, 50, 'success');
    runScript(ws, 'install_hysteria.sh', {
      HY_DOMAIN: domain, HY_EMAIL: email, HY_PASSWORD: hy2Password,
      USE_CADDY_CERT: '1',
      PORT: String(cfg.port || 443)
    }, (codeHy) => {
      if (codeHy === 0) {
        updateConfig(c => { c.installed = true; });
        sendLog(ws, '✅ Оба протокола готовы!', 'done', 100, 'success');
        ws.send(JSON.stringify({
          type: 'install_done',
          links: {
            naive: `naive+https://${encodeURIComponent(naiveLogin)}:${encodeURIComponent(naivePassword)}@${domain}:${cfg.port || 443}#${encodeURIComponent(naiveLogin)}`,
            hy2:   `hysteria2://default:${encodeURIComponent(hy2Password)}@${domain}:${cfg.port || 443}?sni=${domain}&insecure=0#default`
          }
        }));
      } else {
        ws.send(JSON.stringify({ type: 'install_error', message: `Hy2 failed: ${codeHy}` }));
      }
    });
  });
}

function handleInstallMieru(ws, data) {
  const { domain, password, username } = data;
  if (!isValidDomain(domain)) return ws.send(JSON.stringify({ type: 'install_error', message: 'Неверный домен' }));
  if (!isValidPassword(password)) return ws.send(JSON.stringify({ type: 'install_error', message: 'Пароль минимум 8 символов' }));
  if (!isValidUsername(username)) return ws.send(JSON.stringify({ type: 'install_error', message: 'Неверный логин' }));

  const cfg = updateConfig(c => {
    c.domain = domain;
    c.stack.mieru = true;
    if (!c.mieruUsers) c.mieruUsers = [];
    if (!c.mieruUsers.find(u => u.username === username)) {
      c.mieruUsers.push({ username, password, createdAt: new Date().toISOString() });
    }
    if (!c.mieruPort) c.mieruPort = 9443;
  });
  persistServerIp();

  sendLog(ws, '🔐 Запуск установки mieru...', 'init', 2, 'info');
  runScript(ws, 'install_mieru.sh', {
    MIERU_DOMAIN: domain, MIERU_USERNAME: username, MIERU_PASSWORD: password,
    PORT: String(cfg.mieruPort || 9443)
  }, async (code) => {
    if (code === 0) {
      updateConfig(c => { c.installed = true; });
      const linkPort = cfg.mieruPort || 9443;
      let link = `mierus://${encodeURIComponent(username)}:${encodeURIComponent(password)}@${domain}?profile=default&port=${linkPort}&protocol=TCP&multiplexing=MULTIPLEXING_HIGH`;
      const { code: tpCode, stdout } = await runCommand('mita', ['export', 'traffic-pattern']);
      if (tpCode === 0) {
        const tp = stdout.trim();
        if (tp) link += `&traffic-pattern=${encodeURIComponent(tp)}`;
      }
      sendLog(ws, '✅ mieru готов!', 'done', 100, 'success');
      ws.send(JSON.stringify({ type: 'install_done', links: { mieru: link } }));
    } else {
      ws.send(JSON.stringify({ type: 'install_error', message: `Exit code: ${code}` }));
    }
  });
}

function handleInstallVless(ws, data) {
  const { domain, password, username } = data;
  if (!isValidDomain(domain)) return ws.send(JSON.stringify({ type: 'install_error', message: 'Неверный домен' }));
  if (!isValidPassword(password)) return ws.send(JSON.stringify({ type: 'install_error', message: 'Пароль минимум 8 символов' }));
  if (!isValidUsername(username)) return ws.send(JSON.stringify({ type: 'install_error', message: 'Неверный логин' }));

  const crypto = require('crypto');
  const uuid = crypto.randomUUID();

  const cfg = updateConfig(c => {
    c.domain = domain;
    c.stack.vless = true;
    if (!c.vlessUsers) c.vlessUsers = [];
    if (!c.vlessUsers.find(u => u.username === username)) {
      c.vlessUsers.push({ username, password, uuid, createdAt: new Date().toISOString() });
    }
  });
  persistServerIp();

  sendLog(ws, '🔐 Запуск установки VLESS (Xray)...', 'init', 2, 'info');
  const installOutput = [];
  runScript(ws, 'install_vless.sh', {
    VLESS_DOMAIN: domain, VLESS_USERNAME: username, VLESS_PASSWORD: password,
    VLESS_UUID: uuid,
    PORT: String(cfg.vlessPort || cfg.port || 443),
    VLESS_ENCRYPTION: process.env.VLESS_ENCRYPTION === '1' ? '1' : '0'
  }, (code) => {
    const outputText = installOutput.join('');
    if (code === 0) {
      // Parse REALITY keys from install script output
      let privKey = cfg.vlessRealityPrivateKey || '';
      let pubKey = cfg.vlessRealityPublicKey || '';
      const privMatch = outputText.match(/REALITY_PRIVATE_KEY=(\S+)/);
      const pubMatch = outputText.match(/REALITY_PUBLIC_KEY=(\S+)/);
      if (privMatch) privKey = privMatch[1];
      if (pubMatch) pubKey = pubMatch[1];

      // Fallback: read private key from generated config file
      if (!privKey) {
        try {
          const xrayCfg = JSON.parse(fs.readFileSync(testPath('/etc/xray/config.json'), 'utf8'));
          const rs = xrayCfg.inbounds?.[0]?.streamSettings?.realitySettings;
          if (rs) privKey = rs.privateKey || '';
        } catch {}
      }

      // Parse optional VLESS encryption (PR 5067) keys from install script output
      const decryptionMatch = outputText.match(/VLESS_DECRYPTION=(\S+)/);
      const encryptionMatch = outputText.match(/VLESS_ENCRYPTION_STR=(\S+)/);

      const finalCfg = updateConfig(c => {
        c.installed = true;
        if (privKey) c.vlessRealityPrivateKey = privKey;
        if (pubKey) c.vlessRealityPublicKey = pubKey;
        // Save REALITY target and serverNames for self-steal mode
        if (!c.vlessRealityTarget) c.vlessRealityTarget = 'www.google.com:443';
        if (!c.vlessRealityServerNames) c.vlessRealityServerNames = [domain];
        if (decryptionMatch) c.vlessDecryption = decryptionMatch[1];
        if (encryptionMatch) c.vlessEncryption = encryptionMatch[1];
      });
      sendLog(ws, '✅ VLESS готов!', 'done', 100, 'success');
      const encryption = encodeURIComponent(finalCfg.vlessEncryption || 'none');
      ws.send(JSON.stringify({
        type: 'install_done',
        links: {
          vless: pubKey
            ? `vless://${uuid}@${domain}:${finalCfg.vlessPort || finalCfg.port || 443}?encryption=${encryption}&security=reality&sni=${domain}&fp=chrome&type=xhttp&path=/xhttp&mode=packet-up&noGRPCHeader=true&xmux.maxConcurrency=32-64&pbk=${pubKey}#${encodeURIComponent(username)}`
            : `vless://${uuid}@${domain}:${finalCfg.port || 443}?type=tcp&security=tls&sni=${domain}#${encodeURIComponent(username)}`
        }
      }));
    } else {
      ws.send(JSON.stringify({ type: 'install_error', message: `Exit code: ${code}` }));
    }
  }, installOutput);
}

// ═══════════════════════════════════════════════════════════
//  EXPIRE CHECKER — каждые 5 минут фильтрует истёкших и релоадит сервисы
// ═══════════════════════════════════════════════════════════
let _lastExpireSig = '';
async function expireChecker() {
  try {
    const cfg = loadConfig();
    if (!cfg.installed) return;

    // Сигнатура «кто истёк» — чтобы не релоадить без причины
    const sig = JSON.stringify([
      (cfg.naiveUsers || []).filter(isExpired).map(u => u.username).sort(),
      (cfg.hy2Users   || []).filter(isExpired).map(u => u.username).sort(),
      (cfg.mieruUsers || []).filter(isExpired).map(u => u.username).sort(),
      (cfg.vlessUsers || []).filter(isExpired).map(u => u.username).sort(),
    ]);
    if (sig === _lastExpireSig) return;
    _lastExpireSig = sig;

    const naiveExpired = (cfg.naiveUsers || []).filter(isExpired).length;
    const hy2Expired   = (cfg.hy2Users   || []).filter(isExpired).length;
    const mieruExpired = (cfg.mieruUsers || []).filter(isExpired).length;
    const vlessExpired = (cfg.vlessUsers || []).filter(isExpired).length;
    if (naiveExpired === 0 && hy2Expired === 0 && mieruExpired === 0 && vlessExpired === 0) return;

    console.log(`[expire-check] naive=${naiveExpired} hy2=${hy2Expired} mieru=${mieruExpired} vless=${vlessExpired} — обновляю конфиги`);
    if (cfg.stack.naive && naiveExpired > 0) {
      writeCaddyfile(cfg);
      await reloadNaive();
    }
    if (cfg.stack.hy2 && hy2Expired > 0) {
      writeHysteriaConfig(cfg);
      await reloadHysteria();
    }
    if (cfg.stack.mieru && mieruExpired > 0) {
      writeMieruConfig(cfg);
      await reloadMieru();
    }
    if (cfg.stack.vless && vlessExpired > 0) {
      writeVlessConfig(cfg);
      await reloadVless();
    }
  } catch (e) {
    console.error('[expire-check] error:', e.message);
  }
}
setInterval(expireChecker, 5 * 60 * 1000);
setTimeout(expireChecker, 20 * 1000); // первый запуск через 20 сек после старта

// ─── SPA fallback ─────────────────────────────────────────
app.get(/^(?!\/api).*/, (req, res) => {
  const indexPath = path.join(frontendDir, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).json({ error: 'Frontend not built. Run: npm run build' });
  }
});

if (process.env.NODE_ENV !== 'test') {
  const cfg = loadConfig();
  trafficMonitor.ensureRules(cfg.port).then(ok => {
    if (ok) console.log('[traffic] iptables rules ready');
    else console.log('[traffic] iptables rules not set (not root or error)');
  }).catch(() => {});

  server.listen(PORT, LISTEN_HOST, () => {
    const isLocal = LISTEN_HOST === '127.0.0.1' || LISTEN_HOST === 'localhost';
    console.log(`\n╔═══════════════════════════════════════════════╗`);
    console.log(`║   Panel Naive + Hysteria2 by RIXXX            ║`);
    console.log(`║   Running on http://${LISTEN_HOST}:${PORT}${' '.repeat(Math.max(0, 14 - LISTEN_HOST.length))}║`);
    if (isLocal) {
      console.log(`║   SSH-only mode (доступ через ssh -L)         ║`);
    }
    console.log(`╚═══════════════════════════════════════════════╝\n`);
  });
}

module.exports = { app, server };
