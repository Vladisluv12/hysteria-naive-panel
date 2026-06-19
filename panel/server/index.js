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
  contentSecurityPolicy: false,
}));

app.use(cors({ origin: true, credentials: true }));
app.use(bodyParser.json({ limit: '256kb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '256kb' }));
app.use(session({
  name: 'rixxx_sid',
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: true,
  cookie: {
    secure: false,
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000
  }
}));

app.use((req, res, next) => {
  if (req.session && req.get('X-Forwarded-Proto') === 'https') {
    req.session.cookie.secure = true
  }
  next()
})
const frontendDir = process.env.USE_NEW_FRONTEND === 'true'
  ? path.join(__dirname, '..', 'dist')
  : path.join(__dirname, '..', 'public');

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

const aclRoutes = require('./routes/acl.js');
app.use('/api', aclRoutes);

// ── Экспорт для expireChecker ──
const { writeCaddyfile } = naiveRoutes;
const { writeHysteriaConfig } = hysteriaRoutes;
const { reloadCaddy, restartHysteria: reloadHysteria } = require('./services/systemAdapter.js');

//  INSTALL VIA WEBSOCKET
// ═══════════════════════════════════════════════════════════
wss.on('connection', (ws, req) => {
  // Минимальная защита: проверим session cookie
  const cookie = (req.headers.cookie || '');
  if (!cookie.includes('rixxx_sid=')) {
    ws.send(JSON.stringify({ type: 'error', message: 'unauthorized' }));
    ws.close();
    return;
  }

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      if (data.type === 'install_naive') return handleInstallNaive(ws, data);
      if (data.type === 'install_hy2')   return handleInstallHy2(ws, data);
      if (data.type === 'install_both')  return handleInstallBoth(ws, data);
    } catch (e) {
      ws.send(JSON.stringify({ type: 'error', message: 'bad message' }));
    }
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

function runScript(ws, scriptName, env, onExit) {
  const scriptPath = path.join(__dirname, '../scripts', scriptName);
  if (!fs.existsSync(scriptPath)) {
    sendLog(ws, `❌ Скрипт ${scriptName} не найден!`, null, null, 'error');
    ws.send(JSON.stringify({ type: 'install_error', message: scriptName + ' not found' }));
    return;
  }
  const child = spawn('bash', [scriptPath], { env: { ...process.env, ...env, DEBIAN_FRONTEND: 'noninteractive' } });

  child.stdout.on('data', (data) => {
    data.toString().split('\n').filter(l => l.trim()).forEach(line => {
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
  const p = spawn('bash', ['-c', "curl -4 -s --connect-timeout 5 ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}'"]);
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

  updateConfig(c => {
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
    NAIVE_LOGIN: login, NAIVE_PASSWORD: password
  }, (code) => {
    if (code === 0) {
      updateConfig(c => { c.installed = true; });
      sendLog(ws, '✅ NaiveProxy готов!', 'done', 100, 'success');
      ws.send(JSON.stringify({
        type: 'install_done',
        links: {
          naive: `naive+https://${login}:${password}@${domain}:443`
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

  updateConfig(c => {
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
    USE_CADDY_CERT: useCaddyCert ? '1' : '0'
  }, (code) => {
    if (code === 0) {
      updateConfig(c => { c.installed = true; });
      sendLog(ws, '✅ Hysteria2 готова!', 'done', 100, 'success');
      ws.send(JSON.stringify({
        type: 'install_done',
        links: {
          hy2: `hysteria2://default:${encodeURIComponent(password)}@${domain}:443?sni=${domain}&insecure=0#RIXXX`
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

  updateConfig(c => {
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
    WITH_HY2: '1'  // отключит HTTP/3 в Caddy → UDP/443 свободен для Hy2
  }, (codeNaive) => {
    if (codeNaive !== 0) {
      ws.send(JSON.stringify({ type: 'install_error', message: `Naive failed: ${codeNaive}` }));
      return;
    }
    sendLog(ws, '✅ Naive ок, запускаю Hy2...', null, 50, 'success');
    runScript(ws, 'install_hysteria.sh', {
      HY_DOMAIN: domain, HY_EMAIL: email, HY_PASSWORD: hy2Password,
      USE_CADDY_CERT: '1'
    }, (codeHy) => {
      if (codeHy === 0) {
        updateConfig(c => { c.installed = true; });
        sendLog(ws, '✅ Оба протокола готовы!', 'done', 100, 'success');
        ws.send(JSON.stringify({
          type: 'install_done',
          links: {
            naive: `naive+https://${naiveLogin}:${naivePassword}@${domain}:443`,
            hy2:   `hysteria2://default:${encodeURIComponent(hy2Password)}@${domain}:443?sni=${domain}&insecure=0#RIXXX`
          }
        }));
      } else {
        ws.send(JSON.stringify({ type: 'install_error', message: `Hy2 failed: ${codeHy}` }));
      }
    });
  });
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
      (cfg.hy2Users   || []).filter(isExpired).map(u => u.username).sort()
    ]);
    if (sig === _lastExpireSig) return;
    _lastExpireSig = sig;

    const naiveExpired = (cfg.naiveUsers || []).filter(isExpired).length;
    const hy2Expired   = (cfg.hy2Users   || []).filter(isExpired).length;
    if (naiveExpired === 0 && hy2Expired === 0) return;

    console.log(`[expire-check] naive=${naiveExpired} hy2=${hy2Expired} — обновляю конфиги`);
    if (cfg.stack.naive && naiveExpired > 0) {
      writeCaddyfile(cfg);
      await reloadCaddy();
    }
    if (cfg.stack.hy2 && hy2Expired > 0) {
      writeHysteriaConfig(cfg);
      await reloadHysteria();
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
  trafficMonitor.ensureRules().then(ok => {
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
