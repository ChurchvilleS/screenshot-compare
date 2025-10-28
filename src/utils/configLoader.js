/**
 * Configuration loader utility for the screenshot comparison tool.
 */
const fs = require('fs');
const path = require('path');

const CONFIG_DIR = path.resolve(__dirname, '..', '..', 'config');
const DEFAULT_CONFIG_FILE = 'default.json';
const REQUIRED_PROPERTIES = [
  'app.name',
  'outputDir',
  'viewport.width',
  'viewport.height',
  'environments'
];

let cachedConfig;
let cachedEnvironment;

/**
 * Determine the active application environment.
 * Prefers APP_ENV, then NODE_ENV, defaulting to development.
 * @returns {string} Active environment identifier in lowercase.
 */
function getEnvironment() {
  const env = process.env.APP_ENV || process.env.NODE_ENV || 'development';
  return String(env).trim().toLowerCase() || 'development';
}

/**
 * Safely parse a JSON configuration file.
 * @param {string} filePath Absolute path to the configuration file.
 * @returns {object} Parsed configuration object or an empty object if the file is missing.
 * @throws {Error} When the file contents cannot be parsed as valid JSON.
 */
function readConfigFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  try {
    const fileContents = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(fileContents);
  } catch (error) {
    throw new Error(`Failed to parse configuration file ${filePath}: ${error.message}`);
  }
}

/**
 * Perform a deep merge of source into target objects.
 * @param {object} target Base object that will receive properties.
 * @param {object} source Object containing override values.
 * @returns {object} The mutated target object.
 */
function mergeDeep(target, source) {
  if (!isPlainObject(target) || !isPlainObject(source)) {
    return target;
  }

  Object.keys(source).forEach((key) => {
    const sourceValue = source[key];
    const targetValue = target[key];

    if (Array.isArray(sourceValue)) {
      target[key] = sourceValue.slice();
      return;
    }

    if (isPlainObject(sourceValue)) {
      target[key] = mergeDeep(isPlainObject(targetValue) ? targetValue : {}, sourceValue);
      return;
    }

    target[key] = sourceValue;
  });

  return target;
}

/**
 * Determine whether the supplied value is a plain object.
 * @param {*} value Value to evaluate.
 * @returns {boolean} True when the value is a plain object.
 */
function isPlainObject(value) {
  return Object.prototype.toString.call(value) === '[object Object]';
}

/**
 * Retrieve a nested property using dot-notation.
 * @param {object} obj Source object to traverse.
 * @param {string} propertyPath Dot-notated property path (e.g., app.name).
 * @returns {*} The resolved value or undefined when missing.
 */
function getNestedProperty(obj, propertyPath) {
  return propertyPath.split('.').reduce((accumulator, key) => {
    if (accumulator === undefined || accumulator === null) {
      return undefined;
    }
    return accumulator[key];
  }, obj);
}

/**
 * Validate that required configuration properties are present and well-formed.
 * @param {object} config Configuration object to validate.
 * @throws {Error} When required properties are missing or malformed.
 */
function validateConfig(config) {
  if (!isPlainObject(config)) {
    throw new Error('Configuration must resolve to an object.');
  }

  const missing = REQUIRED_PROPERTIES.filter((propertyPath) => {
    const value = getNestedProperty(config, propertyPath);
    return value === undefined || value === null || value === '';
  });

  if (missing.length > 0) {
    throw new Error(`Missing required configuration properties: ${missing.join(', ')}`);
  }

  if (!Array.isArray(config.environments) || config.environments.length === 0) {
    throw new Error('Configuration must include at least one environment definition.');
  }

  config.environments.forEach((env, index) => {
    if (!env || typeof env !== 'object') {
      throw new Error(`Environment entry at index ${index} must be an object.`);
    }
    if (!env.name) {
      throw new Error(`Environment entry at index ${index} is missing the "name" property.`);
    }
    if (!env.baseUrl) {
      throw new Error(`Environment entry at index ${index} is missing the "baseUrl" property.`);
    }
  });
}

/**
 * Load and memoize configuration with optional environment overrides.
 * @param {boolean} [forceReload=false] When true, bypasses the in-memory cache.
 * @returns {object} Loaded configuration with overrides applied.
 */
function loadConfig(forceReload = false) {
  const environment = getEnvironment();

  if (!forceReload && cachedConfig && cachedEnvironment === environment) {
    return cachedConfig;
  }

  const defaultConfigPath = path.join(CONFIG_DIR, DEFAULT_CONFIG_FILE);
  if (!fs.existsSync(defaultConfigPath)) {
    throw new Error(`Missing base configuration file at ${defaultConfigPath}`);
  }

  const baseConfig = readConfigFile(defaultConfigPath);
  const environmentConfigPath = path.join(CONFIG_DIR, `${environment}.json`);
  const environmentOverrides = readConfigFile(environmentConfigPath);

  const mergedConfig = mergeDeep({}, baseConfig);
  mergeDeep(mergedConfig, environmentOverrides);

  validateConfig(mergedConfig);

  cachedEnvironment = environment;
  cachedConfig = Object.freeze({ ...mergedConfig, environment });

  return cachedConfig;
}

/**
 * Retrieve the active configuration object.
 * @param {object} [options]
 * @param {boolean} [options.reload=false] When true, the configuration cache is refreshed.
 * @returns {object} The cached configuration object.
 */
function getConfig(options = {}) {
  return loadConfig(options.reload === true);
}

/**
 * Force a configuration reload from disk.
 * @returns {object} The freshly loaded configuration object.
 */
function reloadConfig() {
  return loadConfig(true);
}

/**
 * Resolve a configuration value using dot-notation.
 * @param {string} propertyPath Dot-notated property path.
 * @param {*} [defaultValue] Fallback value when the property is undefined.
 * @returns {*} The resolved configuration value or the provided default.
 */
function get(propertyPath, defaultValue) {
  const config = getConfig();
  const value = getNestedProperty(config, propertyPath);
  return value === undefined ? defaultValue : value;
}

module.exports = {
  get,
  getConfig,
  getEnvironment,
  reloadConfig,
  validateConfig
};
