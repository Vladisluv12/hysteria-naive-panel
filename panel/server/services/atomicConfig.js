'use strict';

const fs = require('fs');
const path = require('path');

class AtomicFileTransaction {
  constructor(filePath) {
    this.targetPath = filePath;
    this.tmpPath = filePath + '.new';
    this.backupPath = filePath + '.last';
  }

  backup() {
    if (fs.existsSync(this.targetPath)) {
      try { fs.copyFileSync(this.targetPath, this.backupPath); } catch (e) { /* best-effort */ }
    }
  }

  write(content) {
    fs.writeFileSync(this.tmpPath, content, 'utf8');
  }

  validate(validatorFn) {
    if (typeof validatorFn !== 'function') return true;
    try {
      const result = validatorFn(this.tmpPath);
      if (result === false) throw new Error('validator returned false');
      return true;
    } catch (e) {
      console.error(`[AtomicFileTransaction] validate failed: ${e.message}`);
      this._cleanupTmp();
      return false;
    }
  }

  commit() {
    fs.renameSync(this.tmpPath, this.targetPath);
    return true;
  }

  rollback() {
    try { this._cleanupTmp(); } catch {}
    try {
      if (fs.existsSync(this.backupPath) && !fs.existsSync(this.targetPath)) {
        fs.copyFileSync(this.backupPath, this.targetPath);
        console.warn('[AtomicFileTransaction] Rolled back to backup.');
      }
    } catch (rb) { /* best-effort */ }
  }

  execute(content, validatorFn) {
    try {
      this.backup();
      this.write(content);
      if (!this.validate(validatorFn)) return false;
      this.commit();
      return true;
    } catch (e) {
      console.error(`[AtomicFileTransaction] error: ${e.message}`);
      this.rollback();
      return false;
    }
  }

  _cleanupTmp() {
    if (fs.existsSync(this.tmpPath)) fs.unlinkSync(this.tmpPath);
  }
}

function caddyValidator(tmpPath) {
  const { execSync } = require('child_process');
  try {
    execSync(`caddy validate --config ${tmpPath}`, { stdio: 'pipe', timeout: 10000 });
    return true;
  } catch (validateErr) {
    const stderr = (validateErr && validateErr.stderr) ? validateErr.stderr.toString() : '';
    if (stderr && /error|adapt|parse/i.test(stderr)) {
      console.error(`[caddyValidator] ${stderr.slice(0, 500)}`);
      return false;
    }
    return true;
  }
}

function yamlSelfValidator(yamlContent) {
  const yaml = require('js-yaml');
  try {
    const reparsed = yaml.load(yamlContent);
    if (!reparsed || typeof reparsed !== 'object' || !reparsed.auth) {
      throw new Error('parsed config is empty or missing auth section');
    }
    return true;
  } catch (e) {
    console.error(`[yamlSelfValidator] ${e.message}`);
    return false;
  }
}

module.exports = { AtomicFileTransaction, caddyValidator, yamlSelfValidator };
