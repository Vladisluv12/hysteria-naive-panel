'use strict';

const yaml = require('js-yaml');
const { generateNaiveAcl, needsGeoDatasets, HY2_GEOIP_PATH, HY2_GEOSITE_PATH } = require('./aclBuilder.js');

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

module.exports = {
  buildCaddyContent,
  buildHysteriaConfigObject,
  buildHysteriaConfigYaml,
};
