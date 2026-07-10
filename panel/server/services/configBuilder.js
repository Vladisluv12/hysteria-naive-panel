'use strict';

const fs = require('fs');
const yaml = require('js-yaml');
const { generateNaiveAcl, generateMieruAclJson, generateVlessRoutingRules, needsGeoDatasets, HY2_GEOIP_PATH, HY2_GEOSITE_PATH, loadAcl, PRIVATE_CIDRS, GEOSITE_CATEGORIES, GEOIP_COUNTRIES } = require('./aclBuilder.js');

function normalizeDomain(d) {
  return String(d).trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '');
}

const WARP_CONFIG_PATH = '/etc/wireguard/warp-config.json';
const WARP_CONF_PATH = '/etc/wireguard/warp.conf';

function loadWarpConfig() {
  try {
    if (fs.existsSync(WARP_CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(WARP_CONFIG_PATH, 'utf8'));
    }
  } catch (_) {}
  return { enabled: false, domains: [], cidrs: [] };
}

function loadWarpWireguardConf() {
  try {
    if (!fs.existsSync(WARP_CONF_PATH)) return null;
    const text = fs.readFileSync(WARP_CONF_PATH, 'utf8');
    const privKey = text.match(/PrivateKey\s*=\s*(\S+)/)?.[1] || '';
    const pubKey = text.match(/PublicKey\s*=\s*(\S+)/g)?.pop()?.match(/=\s*(\S+)/)?.[1] || '';
    const endpoint = text.match(/Endpoint\s*=\s*(\S+)/)?.[1] || '';
    const addr = text.match(/Address\s*=\s*(\S+)/)?.[1] || '';
    if (!privKey || !pubKey || !endpoint) return null;
    return { privateKey: privKey, publicKey: pubKey, endpoint, address: addr.split('/')[0] || '172.16.0.2' };
  } catch (_) {}
  return null;
}

function buildCaddyContent(cfg, customBlocks, acl) {
  if (!cfg.stack || !cfg.stack.naive || !cfg.domain) return '';

  const lines = (cfg.naiveUsers || [])
    .filter(u => !isExpired(u))
    .map(u => `    basic_auth ${u.username} ${u.password}`)
    .join('\n');

  const disableH3 = cfg.stack && cfg.stack.hy2;
  const globalBlock = disableH3
    ? `{\n  order forward_proxy before file_server\n  servers {\n    protocols h1 h2\n  }\n}`
    : `{\n  order forward_proxy before file_server\n}`;

  const masqueradeBlock = (cfg.masqueradeMode === 'mirror' && cfg.masqueradeUrl)
    ? `  reverse_proxy ${cfg.masqueradeUrl} {\n    header_up Host {upstream_hostport}\n    transport http {\n      tls_insecure_skip_verify\n    }\n  }`
    : `  file_server {\n    root /var/www/html\n  }`;

  let forwardProxyBlock = `${lines || '    # no users yet'}\n    hide_ip\n    hide_via\n    probe_resistance\n    traffic_file /var/lib/naive/traffic.json`;

  if (acl && needsGeoDatasets() && !process.env.NO_GEO_DATA) {
    forwardProxyBlock += `\n    geoip_dat ${HY2_GEOIP_PATH}`;
    forwardProxyBlock += `\n    geosite_dat ${HY2_GEOSITE_PATH}`;
  }

  const aclBlock = acl ? generateNaiveAcl(acl) : '';
  if (aclBlock) {
    forwardProxyBlock += '\n' + aclBlock;
  }

  let content = `${globalBlock}\n\n:${cfg.port}, ${cfg.domain} {\n  tls ${cfg.email}\n\n  forward_proxy {\n${forwardProxyBlock}\n  }\n\n${masqueradeBlock}\n}\n`;

  const internalPort = process.env.PORT || 3000;
  if (cfg.panelDomain && cfg.panelDomain !== cfg.domain && cfg.sshOnly !== 1) {
    const panelEmail = cfg.panelEmail || cfg.email;
    content += `\n${cfg.panelDomain} {\n  tls ${panelEmail}\n  encode gzip\n  reverse_proxy 127.0.0.1:${internalPort}\n}\n`;
  }

  if (customBlocks) {
    content += '\n\n' + customBlocks;
  }

  return content;
}

function buildHysteriaConfigObject(cfg, existingYaml, tlsBlock) {
  if (!cfg.stack || !cfg.stack.hy2 || !cfg.domain) return null;

  const userpass = {};
  (cfg.hy2Users || []).forEach(u => {
    if (u.username && u.password && !isExpired(u)) userpass[u.username] = u.password;
  });
  if (Object.keys(userpass).length === 0) {
    console.error('[configBuilder] No active Hy2 users — config not written (all expired or missing)');
    return null;
  }

  if (existingYaml && typeof existingYaml === 'object') {
    if (!existingYaml.auth) existingYaml.auth = { type: 'userpass' };
    existingYaml.auth.type = 'userpass';
    existingYaml.auth.userpass = userpass;

    if (cfg.masqueradeMode === 'mirror' && cfg.masqueradeUrl) {
      existingYaml.masquerade = { type: 'proxy', proxy: { url: cfg.masqueradeUrl, rewriteHost: true } };
    } else if (cfg.masqueradeMode === 'local') {
      existingYaml.masquerade = { type: 'file', file: { dir: '/var/www/html' } };
    }

    return existingYaml;
  }

  const masqueradeBlock = (cfg.masqueradeMode === 'mirror' && cfg.masqueradeUrl)
    ? { type: 'proxy', proxy: { url: cfg.masqueradeUrl, rewriteHost: true } }
    : { type: 'file', file: { dir: '/var/www/html' } };

  const base = {
    listen: `:${cfg.port}`,
    auth: { type: 'userpass', userpass },
    masquerade: masqueradeBlock,
    ignoreClientBandwidth: true,
    quic: {
      initStreamReceiveWindow: 8388608, maxStreamReceiveWindow: 8388608,
      initConnReceiveWindow: 20971520, maxConnReceiveWindow: 20971520,
      maxIdleTimeout: '30s', keepAlivePeriod: '10s', disablePathMTUDiscovery: false,
    },
  };

  if (tlsBlock) {
    base.tls = { cert: tlsBlock.cert, key: tlsBlock.key };
  }

  return base;
}

function buildHysteriaConfigYaml(cfg, existingYaml, tlsBlock) {
  const obj = buildHysteriaConfigObject(cfg, existingYaml, tlsBlock);
  if (!obj) return null;
  return yaml.dump(obj, { lineWidth: 120, quotingType: '"' });
}

function isExpired(u) {
  if (!u || !u.expiresAt) return false;
  return Date.now() > new Date(u.expiresAt).getTime();
}

function buildMieruConfigObject(cfg) {
  if (!cfg || !cfg.stack || !cfg.stack.mieru || !cfg.domain) return null;

  const users = [];
  (cfg.mieruUsers || []).forEach(u => {
    if (u.username && u.password && !isExpired(u)) {
      users.push({ name: u.username, password: u.password });
    } else if (u.username && !u.password) {
      console.error('[configBuilder] mieru user without password skipped:', u.username);
    }
  });
  if (users.length === 0) {
    console.error('[configBuilder] No active mieru users — config not written');
    return null;
  }

  const port = cfg.mieruPort || cfg.port;

  const config = {
    portBindings: [{
      port: port,
      protocol: 'TCP',
    }],
    users,
    loggingLevel: 'INFO',
    mtu: 1400,
  };

  const acl = loadAcl();
  const hasBlockDomains = (acl.blockDomains || []).length > 0;
  const hasBlockGeosite = (acl.blockGeosite || []).length > 0;
  const hasBlockGeoip = (acl.blockGeoip || []).length > 0;

  if (acl.enabled && (hasBlockDomains || hasBlockGeosite || hasBlockGeoip)) {
    const rules = [];

    (acl.blockDomains || []).filter(Boolean).forEach(d => {
      const domain = String(d).trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '');
      if (domain.length > 0 && domain.length <= 253) {
        rules.push({ domainNames: [domain], action: 'REJECT' });
      }
    });

    (acl.blockGeosite || []).forEach(c => {
      if (c && GEOSITE_CATEGORIES.includes(c)) {
        rules.push({ domainNames: [`geosite:${c}`], action: 'REJECT' });
      }
    });

    (acl.blockGeoip || []).forEach(c => {
      if (c && GEOIP_COUNTRIES.includes(c)) {
        rules.push({ domainNames: [`geoip:${c}`], action: 'REJECT' });
      }
    });

    if (rules.length > 0) {
      rules.push({ domainNames: ['*'], action: 'DIRECT' });
      config.egress = { rules };
    }
  }

  return config;
}

function buildVlessConfigObject(cfg) {
  if (!cfg || !cfg.stack || !cfg.stack.vless || !cfg.domain) return null;

  const clients = [];
  (cfg.vlessUsers || []).forEach(u => {
    if (u.username && u.uuid && !isExpired(u)) {
      clients.push({ id: u.uuid, email: u.username, level: 0, flow: '' });
    } else if (u.username && !u.uuid) {
      console.error('[configBuilder] vless user without uuid skipped:', u.username);
    }
  });
  if (clients.length === 0) {
    console.error('[configBuilder] No active VLESS users — config not written');
    return null;
  }

  const vport = cfg.vlessPort || cfg.port;
  const realityTarget = cfg.vlessRealityTarget || '1.1.1.1:443';
  const realityServerNames = cfg.vlessRealityServerNames || ['cloudflare-dns.com'];
  if (cfg.domain && !realityServerNames.includes(cfg.domain)) {
    realityServerNames.unshift(cfg.domain);
  }
  const realityPrivateKey = cfg.vlessRealityPrivateKey || '';

  if (!realityPrivateKey) {
    console.error('[configBuilder] VLESS: no REALITY private key — config not written');
    return null;
  }

  const config = {
    log: { loglevel: 'warning' },
    stats: {},
    policy: {
      levels: { '0': { statsUserUplink: true, statsUserDownlink: true } },
      system: { statsInboundUplink: true, statsInboundDownlink: true },
    },
    api: { tag: 'api', services: ['StatsService'] },
    inbounds: [{
      listen: '0.0.0.0',
      port: vport,
      protocol: 'vless',
      tag: 'vless-in',
      settings: {
        clients,
        decryption: cfg.vlessDecryption || 'none',
      },
      streamSettings: {
        network: 'xhttp',
        security: 'reality',
        realitySettings: {
          target: realityTarget,
          serverNames: realityServerNames,
          privateKey: realityPrivateKey,
          shortIds: [''],
        },
        xhttpSettings: {
          mode: 'packet-up',
          path: '/xhttp',
        },
      },
    }, {
      listen: '127.0.0.1',
      port: 10085,
      protocol: 'dokodemo-door',
      settings: { address: '127.0.0.1' },
      tag: 'api',
    }],
    outbounds: [
      { protocol: 'freedom', tag: 'direct' },
      { protocol: 'freedom', tag: 'api' },
    ],
    routing: {
      rules: [{ type: 'field', inboundTag: ['api'], outboundTag: 'api' }],
    },
  };

  // ACL: always block private IPs, block other rules when acl.enabled
  const acl = loadAcl();
  const aclRules = [];

  // Private IPs always blocked
  if (acl.blockPrivateIPs !== false) {
    PRIVATE_CIDRS.forEach(cidr => {
      aclRules.push({ type: 'field', ip: [cidr], outboundTag: 'blocked' });
    });
  }

  // Domain/geo rules only when ACL enabled
  if (acl.enabled) {
    (acl.blockDomains || []).forEach(d => {
      const domain = normalizeDomain(d);
      if (domain && domain.length <= 253) {
        aclRules.push({ type: 'field', domain: [domain], outboundTag: 'blocked' });
      }
    });
    (acl.blockGeosite || []).forEach(c => {
      if (c && GEOSITE_CATEGORIES.includes(c)) {
        aclRules.push({ type: 'field', domain: [`geosite:${c}`], outboundTag: 'blocked' });
      }
    });
    (acl.blockGeoip || []).forEach(c => {
      if (c && GEOIP_COUNTRIES.includes(c)) {
        aclRules.push({ type: 'field', ip: [`geoip:${c}`], outboundTag: 'blocked' });
      }
    });
  }

  if (aclRules.length > 0) {
    config.outbounds.push({ protocol: 'blackhole', tag: 'blocked' });
    config.routing = {
      domainStrategy: 'IPIfNonMatch',
      rules: [...aclRules, ...config.routing.rules],
    };
  }

  // WARP integration: add WireGuard outbound + routing for selected domains
  const warpConfig = loadWarpConfig();
  if (warpConfig.enabled && warpConfig.domains && warpConfig.domains.length > 0) {
    const wg = loadWarpWireguardConf();
    if (wg) {
      config.outbounds.push({
        protocol: 'wireguard',
        tag: 'warp',
        settings: {
          secretKey: wg.privateKey,
          address: [wg.address + '/32'],
          peers: [{
            endpoint: wg.endpoint,
            publicKey: wg.publicKey,
          }],
          mtu: 1280,
          reserved: [0, 0, 0],
        },
      });

      const warpRule = {
        type: 'field',
        domain: warpConfig.domains,
        outboundTag: 'warp',
      };

      // Merge with existing routing rules
      const existingRules = config.routing.rules || [];
      config.routing = {
        domainStrategy: 'IPIfNonMatch',
        rules: [warpRule, ...existingRules],
      };
    }
  }

  return config;
}

module.exports = {
  buildCaddyContent,
  buildHysteriaConfigObject,
  buildHysteriaConfigYaml,
  buildMieruConfigObject,
  buildVlessConfigObject,
};
