'use strict';

const yaml = require('js-yaml');
const { generateNaiveAcl, generateMieruAclJson, generateVlessRoutingRules, needsGeoDatasets, HY2_GEOIP_PATH, HY2_GEOSITE_PATH, loadAcl } = require('./aclBuilder.js');

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
  if (acl.enabled && (acl.blockDomains || []).length > 0) {
    const egress = {
      rules: (acl.blockDomains || []).filter(Boolean).map(d => {
        const domain = String(d).trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '');
        return { domainNames: [domain], action: 'REJECT' };
      }).filter(r => r.domainNames[0].length > 0)
    };
    egress.rules.push({ domainNames: ['*'], action: 'DIRECT' });
    config.egress = egress;
  }

  return config;
}

function buildVlessConfigObject(cfg) {
  if (!cfg || !cfg.stack || !cfg.stack.vless || !cfg.domain) return null;

  const clients = [];
  (cfg.vlessUsers || []).forEach(u => {
    if (u.username && u.uuid && !isExpired(u)) {
      clients.push({ id: u.uuid, email: u.username, level: 0, flow: '' });
    }
  });
  if (clients.length === 0) {
    console.error('[configBuilder] No active VLESS users — config not written');
    return null;
  }

  const vport = cfg.vlessPort || cfg.port;
  const realityTarget = cfg.vlessRealityTarget || 'www.google.com:443';
  const realityServerNames = cfg.vlessRealityServerNames || ['www.google.com'];
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
        decryption: 'none',
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

  const acl = loadAcl();
  if (acl.enabled) {
    const routingRules = generateVlessRoutingRules(acl);
    if (routingRules && routingRules.length > 0) {
      config.outbounds.push({ protocol: 'blackhole', tag: 'blocked' });
      config.routing = {
        domainStrategy: 'IPIfNonMatch',
        rules: routingRules
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
