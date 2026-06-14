'use strict';

function extractCustomBlocks(content, domain, panelDomain) {
  if (!content) return '';
  const lines = content.split('\n');
  const blocks = [];
  let buf = null;

  function flushBlock() {
    if (!buf) return;
    const full = [buf.header, ...buf.lines].join('\n');
    const h = buf.header.trim();

    const isGlobal = h === '{';
    const isProxy = domain && (h.startsWith(`:443, ${domain}`) || h.startsWith(`:443,${domain}`) || h === domain);
    const isPanel = panelDomain && panelDomain !== domain && (h === panelDomain || h.startsWith(`${panelDomain} `) || h.startsWith(`${panelDomain}:`));

    if (!isGlobal && !isProxy && !isPanel) {
      blocks.push(full);
    }
    buf = null;
  }

  for (const raw of lines) {
    if (buf === null) {
      const trimmed = raw.trim();
      if (trimmed === '' || trimmed.startsWith('#')) continue;
      const openBraces = (raw.match(/{/g) || []).length;
      const closeBraces = (raw.match(/}/g) || []).length;
      if (openBraces === 0 && closeBraces === 0) continue;
      const depth = openBraces - closeBraces;
      if (depth <= 0) continue;
      buf = { header: raw, lines: [], braceDepth: depth };
    } else {
      buf.lines.push(raw);
      buf.braceDepth += (raw.match(/{/g) || []).length;
      buf.braceDepth -= (raw.match(/}/g) || []).length;
      if (buf.braceDepth <= 0) flushBlock();
    }
  }
  flushBlock();
  return blocks.join('\n\n');
}

module.exports = { extractCustomBlocks };
