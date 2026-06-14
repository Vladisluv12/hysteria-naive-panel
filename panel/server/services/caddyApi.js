'use strict';

const http = require('http');
const CADDY_ADMIN_HOST = process.env.CADDY_ADMIN_HOST || '127.0.0.1';
const CADDY_ADMIN_PORT = parseInt(process.env.CADDY_ADMIN_PORT || '2019', 10);
const REQUEST_TIMEOUT = parseInt(process.env.CADDY_API_TIMEOUT || '5000', 10);

function createCaddyApi(httpModule) {
  const httpAgent = httpModule || http;

  function adminRequest(method, path, body) {
    return new Promise((resolve) => {
      const options = {
        hostname: CADDY_ADMIN_HOST,
        port: CADDY_ADMIN_PORT,
        path,
        method,
        timeout: REQUEST_TIMEOUT,
      };

      const req = httpAgent.request(options, (res) => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          resolve({ status: res.statusCode, body: data });
        });
      });

      req.on('error', (err) => {
        resolve({ status: 0, body: err.message });
      });

      req.on('timeout', () => {
        req.destroy();
        resolve({ status: 0, body: 'timeout' });
      });

      req.setTimeout(REQUEST_TIMEOUT);

      if (body) req.write(body);
      req.end();
    });
  }

  async function reloadCaddy(caddyfileContent) {
    try {
      const result = await adminRequest('POST', '/load', caddyfileContent);
      if (result.status >= 200 && result.status < 300) {
        return { success: true };
      }
      return {
        success: false,
        error: `admin API responded ${result.status}: ${result.body.slice(0, 200)}`,
      };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  async function getConfig() {
    try {
      const result = await adminRequest('GET', '/config/');
      if (result.status >= 200 && result.status < 300) {
        try {
          return { success: true, config: JSON.parse(result.body) };
        } catch {
          return { success: false, error: 'invalid JSON from admin API' };
        }
      }
      return { success: false, error: `admin API responded ${result.status}` };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  return { reloadCaddy, getConfig };
}

const defaultApi = createCaddyApi();

module.exports = {
  createCaddyApi,
  reloadCaddy: defaultApi.reloadCaddy,
  getConfig: defaultApi.getConfig,
};
