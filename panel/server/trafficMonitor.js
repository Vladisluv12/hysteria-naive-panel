'use strict';

const { spawn, execSync } = require('child_process');
const fs = require('fs');
const os = require('os');

const COMMENT_TAGS = {
  NAIVE_IN: 'RIXXX_NAIVE_IN',
  NAIVE_OUT: 'RIXXX_NAIVE_OUT',
  HY2_IN: 'RIXXX_HY2_IN',
  HY2_OUT: 'RIXXX_HY2_OUT',
};

function isRoot() {
  return process.getuid && process.getuid() === 0;
}

function iptables(args) {
  return new Promise((resolve, reject) => {
    const p = spawn('iptables', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    p.stdout.on('data', d => out += d.toString());
    p.stderr.on('data', d => err += d.toString());
    p.on('close', code => {
      if (code === 0) resolve(out.trim());
      else reject(new Error(`iptables ${args.join(' ')} exited ${code}: ${err.trim()}`));
    });
    p.on('error', e => reject(e));
  });
}

function parseIptablesLine(line, commentTag) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('Chain ') || trimmed.startsWith('pkts')) return null;
  if (!trimmed.includes(`/* ${commentTag} */`)) return null;
  const parts = trimmed.split(/\s+/);
  if (parts.length < 2) return null;
  const pkts = parseInt(parts[0], 10);
  const bytes = parseInt(parts[1], 10);
  if (!Number.isFinite(pkts) || !Number.isFinite(bytes)) return null;
  return { pkts, bytes };
}

function needsRules(output, commentTag) {
  return !output.includes(commentTag);
}

async function ensureRules() {
  if (!isRoot()) return false;

  const chains = ['INPUT', 'OUTPUT'];
  const rules = [
    { chain: 'INPUT',  proto: 'tcp', port: 'dport', tag: COMMENT_TAGS.NAIVE_IN },
    { chain: 'INPUT',  proto: 'udp', port: 'dport', tag: COMMENT_TAGS.HY2_IN },
    { chain: 'OUTPUT', proto: 'tcp', port: 'sport', tag: COMMENT_TAGS.NAIVE_OUT },
    { chain: 'OUTPUT', proto: 'udp', port: 'sport', tag: COMMENT_TAGS.HY2_OUT },
  ];

  let existing = '';
  for (const chain of chains) {
    try {
      const out = await iptables(['-L', chain, '-v', '-n', '-x']);
      existing += out;
    } catch { return false; }
  }

  for (const rule of rules) {
    if (needsRules(existing, rule.tag)) {
      try {
        await iptables(['-A', rule.chain, '-p', rule.proto, `--${rule.port}`, '443',
          '-m', 'comment', '--comment', rule.tag]);
      } catch {
        return false;
      }
    }
  }

  return true;
}

async function removeRules() {
  if (!isRoot()) return;

  const tags = Object.values(COMMENT_TAGS);
  for (const tag of tags) {
    try {
      const out = await iptables(['-L', 'INPUT', '-v', '-n', '-x']);
      if (out.includes(tag)) {
        await iptables(['-D', 'INPUT', '-p', 'tcp', '--dport', '443',
          '-m', 'comment', '--comment', tag]).catch(() => {});
        await iptables(['-D', 'OUTPUT', '-p', 'tcp', '--sport', '443',
          '-m', 'comment', '--comment', tag]).catch(() => {});
        await iptables(['-D', 'INPUT', '-p', 'udp', '--dport', '443',
          '-m', 'comment', '--comment', tag]).catch(() => {});
        await iptables(['-D', 'OUTPUT', '-p', 'udp', '--sport', '443',
          '-m', 'comment', '--comment', tag]).catch(() => {});
      }
    } catch { /* best-effort */ }
  }
}

async function readCounters() {
  const result = {
    naive: { rx: 0, tx: 0 },
    hy2: { rx: 0, tx: 0 },
  };

  const chains = ['INPUT', 'OUTPUT'];
  let allOutput = '';
  for (const chain of chains) {
    try {
      const out = await iptables(['-L', chain, '-v', '-n', '-x']);
      allOutput += out;
    } catch {
      return result;
    }
  }

  const lines = allOutput.split('\n');

  const naiveIn = lines.map(l => parseIptablesLine(l, COMMENT_TAGS.NAIVE_IN)).find(Boolean);
  const naiveOut = lines.map(l => parseIptablesLine(l, COMMENT_TAGS.NAIVE_OUT)).find(Boolean);
  const hy2In = lines.map(l => parseIptablesLine(l, COMMENT_TAGS.HY2_IN)).find(Boolean);
  const hy2Out = lines.map(l => parseIptablesLine(l, COMMENT_TAGS.HY2_OUT)).find(Boolean);

  if (naiveIn) result.naive.rx = naiveIn.bytes;
  if (naiveOut) result.naive.tx = naiveOut.bytes;
  if (hy2In) result.hy2.rx = hy2In.bytes;
  if (hy2Out) result.hy2.tx = hy2Out.bytes;

  return result;
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const v = bytes / Math.pow(1024, i);
  if (i === 0) return Math.round(v) + ' ' + units[i];
  return v.toFixed(1) + ' ' + units[i];
}

module.exports = {
  ensureRules,
  removeRules,
  readCounters,
  parseIptablesLine,
  needsRules,
  formatBytes,
  COMMENT_TAGS,
};
