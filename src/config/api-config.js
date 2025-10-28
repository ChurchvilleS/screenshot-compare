/**
 * API configuration helper.
 *
 * Reads connection details from environment variables and provides defaults
 * for local development. All values are resolved once at module load.
 *
 * Environment variables:
 * - API_HOST: optional hostname/interface to bind to or contact (default: localhost)
 * - API_PORT: API port number (default: 5001)
 * - API_TARGET: full base URL for proxied requests, overrides host/port (default: http://localhost:5001)
 */

function resolveEnv(env, keys) {
  if (!Array.isArray(keys)) {
    return undefined;
  }
  for (const key of keys) {
    const value = env?.[key];
    if (value != null && value !== '') {
      return value;
    }
  }
  return undefined;
}

function getRuntimeEnv() {
  if (typeof process !== 'undefined' && process.env) {
    return process.env;
  }
  if (typeof globalThis !== 'undefined' && globalThis.__APP_ENV__) {
    return globalThis.__APP_ENV__;
  }
  return undefined;
}

function createApiConfig(envOverrides = {}) {
  const runtimeEnv = getRuntimeEnv() || {};
  const env = { ...runtimeEnv, ...envOverrides };

  const host = resolveEnv(env, ['API_HOST', 'VITE_API_HOST']) || 'localhost';
  const portRaw = resolveEnv(env, ['API_PORT', 'VITE_API_PORT']);
  const port = Number.parseInt(portRaw, 10) || 5001;
  const target = resolveEnv(env, ['API_TARGET', 'VITE_API_TARGET']) || `http://${host}:${port}`;

  return { host, port, target };
}

const defaultConfig = createApiConfig();

function getApiConfig() {
  return { ...defaultConfig };
}

exports.createApiConfig = createApiConfig;
exports.getApiConfig = getApiConfig;
exports.host = defaultConfig.host;
exports.port = defaultConfig.port;
exports.target = defaultConfig.target;
exports.default = {
  createApiConfig,
  getApiConfig,
  host: defaultConfig.host,
  port: defaultConfig.port,
  target: defaultConfig.target
};
