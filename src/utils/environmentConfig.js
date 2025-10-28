const path = require('path');
const fs = require('fs-extra');
const slugify = require('slugify');

const CONFIG_DIR = path.resolve(__dirname, '..', '..', 'config');
const CONFIG_FILE = path.join(CONFIG_DIR, 'environments.json');
const EXAMPLE_FILE = path.join(CONFIG_DIR, 'environments.example.json');

const FALLBACK_DEFAULTS = {
  outputDir: 'screenshots/regression',
  diffDir: path.join('screenshots', 'regression', 'diff'),
  paths: ['/'],
  threshold: {
    maxChangeRatio: 0.05,
    maxFailed: 0
  },
  capture: {
    enabled: true,
    fullPage: true,
    device: 'desktop',
    timeout: 45000
  },
  comparison: {
    mode: 'both',
    threshold: 0.1,
    limit: 50
  },
  reports: {
    htmlPattern: 'comparison-report*.html',
    jsonName: 'comparison-summary.json'
  }
};

let cachedConfig;

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

function isPlainObject(value) {
  return Object.prototype.toString.call(value) === '[object Object]';
}

function readConfiguration() {
  if (cachedConfig) {
    return cachedConfig;
  }

  const candidateFiles = [CONFIG_FILE, EXAMPLE_FILE];
  let loadedPath = null;
  let rawConfig = null;

  for (const candidate of candidateFiles) {
    if (fs.existsSync(candidate)) {
      loadedPath = candidate;
      rawConfig = fs.readJsonSync(candidate);
      break;
    }
  }

  if (!rawConfig) {
    throw new Error('Unable to locate environment configuration. Expected config/environments.json or config/environments.example.json.');
  }

  const defaults = mergeDeep({}, FALLBACK_DEFAULTS);
  if (rawConfig.defaults) {
    mergeDeep(defaults, rawConfig.defaults);
  }

  cachedConfig = {
    raw: rawConfig,
    defaults,
    path: loadedPath
  };

  return cachedConfig;
}

function ensureArray(value, fallback = []) {
  if (Array.isArray(value) && value.length > 0) {
    return value.slice();
  }
  return fallback.slice();
}

function getEnvValue(variableName, { required = true, context }) {
  if (!variableName) {
    return null;
  }
  const trimmed = String(variableName).trim();
  if (!trimmed) {
    return null;
  }
  const value = process.env[trimmed];
  if (!value && required) {
    throw new Error(`Missing required environment variable ${trimmed} for ${context}.`);
  }
  return value || null;
}

function setSensitiveProperty(target, key, value) {
  if (value === undefined || value === null) {
    return;
  }
  Object.defineProperty(target, key, {
    value,
    enumerable: false,
    writable: false,
    configurable: false
  });
}

function resolveAuth(authConfig, envKey, requiredSecrets) {
  if (!authConfig) {
    return null;
  }

  const context = `environment:${envKey}`;
  const required = authConfig.required !== false;
  const type = authConfig.type || 'basic';

  if (type === 'basic') {
    const username = authConfig.username || getEnvValue(authConfig.usernameEnv, { required, context });
    const password = authConfig.password || getEnvValue(authConfig.passwordEnv, { required, context });

    if (required && (!username || !password)) {
      throw new Error(`Basic auth credentials are required for ${context}.`);
    }

    if (authConfig.usernameEnv) {
      requiredSecrets.push(authConfig.usernameEnv);
    }
    if (authConfig.passwordEnv) {
      requiredSecrets.push(authConfig.passwordEnv);
    }

    if (!username || !password) {
      return null;
    }

    return { type: 'basic', username, password };
  }

  if (type === 'bearer') {
    const token = authConfig.token || getEnvValue(authConfig.tokenEnv, { required, context });
    if (authConfig.tokenEnv) {
      requiredSecrets.push(authConfig.tokenEnv);
    }
    if (required && !token) {
      throw new Error(`Bearer token is required for ${context}.`);
    }
    if (!token) {
      return null;
    }
    return { type: 'bearer', token };
  }

  throw new Error(`Unsupported auth type "${type}" for ${context}.`);
}

function buildEnvironment(envKey, definitions, defaults) {
  if (!definitions.environments || !definitions.environments[envKey]) {
    throw new Error(`Unknown environment key "${envKey}" in comparison configuration.`);
  }

  const definition = definitions.environments[envKey];
  const name = definition.name || envKey;
  const slug = definition.slug || slugify(name, { lower: true, strict: true }) || envKey;
  const requiredSecrets = [];

  let baseUrl = definition.baseUrl || null;
  if (!baseUrl && definition.baseUrlEnv) {
    requiredSecrets.push(definition.baseUrlEnv);
    baseUrl = getEnvValue(definition.baseUrlEnv, {
      required: definition.baseUrlRequired !== false,
      context: `environment:${envKey}`
    });
  }

  if (!baseUrl) {
    throw new Error(`Environment "${envKey}" must define a baseUrl or baseUrlEnv.`);
  }

  const environment = {
    name,
    label: definition.label || name,
    slug,
    baseUrl,
    paths: ensureArray(definition.paths),
    browser: {
      viewport: definition.browser?.viewport || null,
      device: definition.browser?.device || defaults.capture?.device || 'desktop',
      launchOptions: definition.browser?.launchOptions || null
    },
    requiredSecrets
  };

  const auth = resolveAuth(definition.auth, envKey, requiredSecrets);
  if (auth) {
    setSensitiveProperty(environment, 'auth', auth);
  }

  if (definition.headers && isPlainObject(definition.headers)) {
    const headers = {};
    Object.entries(definition.headers).forEach(([headerKey, headerDef]) => {
      if (typeof headerDef === 'string') {
        headers[headerKey] = headerDef;
        return;
      }
      if (!headerDef) {
        return;
      }
      if (headerDef.env) {
        const headerValue = getEnvValue(headerDef.env, {
          required: headerDef.required !== false,
          context: `header:${envKey}:${headerKey}`
        });
        if (headerDef.env) {
          requiredSecrets.push(headerDef.env);
        }
        if (headerValue) {
          headers[headerKey] = headerDef.prefix ? `${headerDef.prefix}${headerValue}` : headerValue;
        }
        return;
      }
      if (headerDef.value) {
        headers[headerKey] = headerDef.value;
      }
    });

    if (Object.keys(headers).length > 0) {
      setSensitiveProperty(environment, 'headers', headers);
    }
  }

  return environment;
}

function determinePaths(comparison, sourceEnv, targetEnv, defaults) {
  if (Array.isArray(comparison.paths) && comparison.paths.length > 0) {
    return comparison.paths.slice();
  }

  const token = typeof comparison.paths === 'string' ? comparison.paths.trim().toLowerCase() : '';
  if (token === '@source') {
    return ensureArray(sourceEnv.paths, defaults);
  }
  if (token === '@target') {
    return ensureArray(targetEnv.paths, defaults);
  }
  if (token === '@union') {
    const unique = new Set([...ensureArray(sourceEnv.paths), ...ensureArray(targetEnv.paths)]);
    if (unique.size > 0) {
      return Array.from(unique);
    }
  }

  return ensureArray(defaults, ['/']);
}

function mergeThreshold(defaultDefaults, comparisonThreshold, overrides = {}) {
  const threshold = {
    maxChangeRatio: defaultDefaults?.maxChangeRatio ?? FALLBACK_DEFAULTS.threshold.maxChangeRatio,
    maxFailed: defaultDefaults?.maxFailed ?? FALLBACK_DEFAULTS.threshold.maxFailed
  };

  if (comparisonThreshold) {
    if (typeof comparisonThreshold.maxChangeRatio === 'number') {
      threshold.maxChangeRatio = comparisonThreshold.maxChangeRatio;
    }
    if (typeof comparisonThreshold.maxFailed === 'number') {
      threshold.maxFailed = comparisonThreshold.maxFailed;
    }
  }

  if (typeof overrides.maxChangeRatio === 'number') {
    threshold.maxChangeRatio = overrides.maxChangeRatio;
  }
  if (typeof overrides.maxFailed === 'number') {
    threshold.maxFailed = overrides.maxFailed;
  }

  return threshold;
}

function mergeSettings(defaultSettings, override = {}) {
  const merged = mergeDeep({}, defaultSettings || {});
  mergeDeep(merged, override);
  return merged;
}

function derivePatternFromName(name) {
  if (!name || typeof name !== 'string') {
    return null;
  }
  const trimmed = name.trim();
  if (!trimmed) {
    return null;
  }
  const withoutExtension = trimmed.replace(/\.html$/i, '');
  if (!withoutExtension) {
    return null;
  }
  return `${withoutExtension}*.html`;
}

function normalizeReportSettings(settings, fallbackPattern) {
  const normalized = mergeDeep({}, settings || {});
  if (!normalized.htmlPattern && normalized.htmlName) {
    normalized.htmlPattern = derivePatternFromName(normalized.htmlName);
  }
  if (!normalized.htmlPattern && fallbackPattern) {
    normalized.htmlPattern = fallbackPattern;
  }
  return normalized;
}

function sanitizeEnvironment(environment) {
  return {
    name: environment.name,
    label: environment.label,
    slug: environment.slug,
    baseUrl: environment.baseUrl,
    paths: ensureArray(environment.paths),
    device: environment.browser?.device || null,
    viewport: environment.browser?.viewport || null
  };
}

function loadEnvironmentConfig(options = {}) {
  const { raw, defaults, path: configPath } = readConfiguration();
  const availableComparisons = raw.comparisons ? Object.keys(raw.comparisons) : [];

  const comparisonKey = options.comparisonKey
    || process.env.REGRESSION_COMPARISON
    || availableComparisons[0];

  if (!comparisonKey) {
    throw new Error('No comparison key provided and no comparisons defined in configuration.');
  }

  if (!raw.comparisons || !raw.comparisons[comparisonKey]) {
    throw new Error(`Comparison "${comparisonKey}" is not defined in environment configuration.`);
  }

  const comparison = raw.comparisons[comparisonKey];
  const sourceEnv = buildEnvironment(comparison.source, raw, defaults);
  const targetEnv = buildEnvironment(comparison.target, raw, defaults);

  const resolvedPaths = determinePaths(comparison, sourceEnv, targetEnv, defaults.paths);
  if (!resolvedPaths.length) {
    throw new Error(`No paths configured for comparison "${comparisonKey}".`);
  }

  const threshold = mergeThreshold(defaults.threshold, comparison.threshold, options.threshold);
  const captureSettings = mergeSettings(defaults.capture, comparison.capture);
  if (!captureSettings.device) {
    captureSettings.device = sourceEnv.browser?.device || targetEnv.browser?.device || defaults.capture?.device;
  }
  const derivedViewport = sourceEnv.browser?.viewport || targetEnv.browser?.viewport;
  if (!captureSettings.viewport && derivedViewport) {
    captureSettings.viewport = derivedViewport;
  }
  const derivedLaunch = sourceEnv.browser?.launchOptions || targetEnv.browser?.launchOptions;
  if (!captureSettings.launchOptions && derivedLaunch) {
    captureSettings.launchOptions = mergeDeep({}, derivedLaunch);
  }
  const comparisonSettings = mergeSettings(defaults.comparison, comparison.comparison);
  const reportSettings = normalizeReportSettings(
    mergeSettings(defaults.reports, comparison.reports),
    defaults.reports?.htmlPattern || FALLBACK_DEFAULTS.reports.htmlPattern
  );

  const comparisonLabel = comparison.label || `${sourceEnv.label} vs ${targetEnv.label}`;
  const resolvedOutputRoot = options.outputDir || defaults.outputDir || FALLBACK_DEFAULTS.outputDir;
  const resolvedDiffRoot = options.diffDir || defaults.diffDir || FALLBACK_DEFAULTS.diffDir;
  const outputDir = path.join(resolvedOutputRoot, comparisonKey);
  const diffDir = path.join(resolvedDiffRoot, comparisonKey);

  const requiredSecrets = new Set([
    ...ensureArray(comparison.requiredSecrets),
    ...(sourceEnv.requiredSecrets || []),
    ...(targetEnv.requiredSecrets || [])
  ]);

  const documentation = raw.documentation || {};

  const regressionConfig = {
    outputDir,
    diffDir,
    paths: resolvedPaths,
    threshold,
    capture: captureSettings,
    comparison: comparisonSettings,
  reports: reportSettings,
    environments: {
      source: sourceEnv,
      target: targetEnv
    },
    metadata: {
      comparisonKey,
      comparisonLabel,
      description: comparison.description || null,
      configPath,
      requiredSecrets: Array.from(requiredSecrets),
      documentation,
      sanitizedEnvironments: {
        source: sanitizeEnvironment(sourceEnv),
        target: sanitizeEnvironment(targetEnv)
      }
    }
  };

  return regressionConfig;
}

function loadEnvironmentPair(sourceKey, targetKey, options = {}) {
  if (!sourceKey || !targetKey) {
    throw new Error('Both sourceKey and targetKey are required to load environment pair configuration.');
  }

  const { raw, defaults, path: configPath } = readConfiguration();

  const sourceEnv = buildEnvironment(sourceKey, raw, defaults);
  const targetEnv = buildEnvironment(targetKey, raw, defaults);

  const defaultPaths = ensureArray(defaults.paths, ['/']);
  const requestedPaths = Array.isArray(options.paths) && options.paths.length > 0
    ? options.paths.slice()
    : determinePaths({ paths: '@union' }, sourceEnv, targetEnv, defaultPaths);

  const threshold = mergeThreshold(defaults.threshold, null, options.threshold);
  const captureSettings = mergeSettings(defaults.capture, options.capture);
  if (!captureSettings.device) {
    captureSettings.device = sourceEnv.browser?.device || targetEnv.browser?.device || defaults.capture?.device;
  }
  if (!captureSettings.viewport) {
    captureSettings.viewport = sourceEnv.browser?.viewport || targetEnv.browser?.viewport || defaults.capture?.viewport || null;
  }
  const comparisonSettings = mergeSettings(defaults.comparison, options.comparison);
  const reportSettings = normalizeReportSettings(
    mergeSettings(defaults.reports, options.reports),
    defaults.reports?.htmlPattern || FALLBACK_DEFAULTS.reports.htmlPattern
  );

  const outputDir = path.resolve(options.outputDir || defaults.outputDir || FALLBACK_DEFAULTS.outputDir);
  const diffDir = path.resolve(options.diffDir || defaults.diffDir || FALLBACK_DEFAULTS.diffDir);

  const requiredSecrets = new Set([
    ...(sourceEnv.requiredSecrets || []),
    ...(targetEnv.requiredSecrets || [])
  ]);

  const metadata = {
    comparisonLabel: `${sourceEnv.label || sourceKey} vs ${targetEnv.label || targetKey}`,
    configPath,
    requiredSecrets: Array.from(requiredSecrets),
    sanitizedEnvironments: {
      source: sanitizeEnvironment(sourceEnv),
      target: sanitizeEnvironment(targetEnv)
    }
  };

  return {
    outputDir,
    diffDir,
    paths: requestedPaths,
    threshold,
    capture: captureSettings,
    comparison: comparisonSettings,
    reports: reportSettings,
    environments: {
      source: sourceEnv,
      target: targetEnv
    },
    metadata
  };
}

function getAvailableComparisons() {
  const { raw } = readConfiguration();
  return raw.comparisons ? Object.keys(raw.comparisons) : [];
}

function clearEnvironmentConfigCache() {
  cachedConfig = null;
}

module.exports = {
  loadEnvironmentConfig,
  loadEnvironmentPair,
  getAvailableComparisons,
  clearEnvironmentConfigCache
};
