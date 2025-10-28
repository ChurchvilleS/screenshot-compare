const path = require('path');
const fs = require('fs-extra');
const slugify = require('slugify');
const { ensureBrowsersInstalled } = require('../utils/browserSetup');
const { ScreenshotService } = require('../services/screenshot');
const { ComparisonService } = require('../services/comparison');
const { loadEnvironmentConfig } = require('../utils/environmentConfig');

const DEFAULT_PATHS = ['/'];
const DEFAULT_THRESHOLD = 0.05;
const DEFAULT_REPORT_PATTERN = 'ci-comparison-report*.html';
const DEFAULT_JSON_NAME = 'ci-comparison-summary.json';
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


function formatPercent(ratio) {
  if (typeof ratio !== 'number' || Number.isNaN(ratio)) {
    return 0;
  }
  return Math.round(ratio * 10000) / 100;
}

function mergeDeep(target, source) {
  if (!target || typeof target !== 'object' || !source || typeof source !== 'object') {
    return target;
  }

  Object.keys(source).forEach((key) => {
    const sourceValue = source[key];
    const targetValue = target[key];

    if (Array.isArray(sourceValue)) {
      target[key] = sourceValue.slice();
      return;
    }

    if (sourceValue && typeof sourceValue === 'object') {
      target[key] = mergeDeep(targetValue && typeof targetValue === 'object' ? targetValue : {}, sourceValue);
      return;
    }

    target[key] = sourceValue;
  });

  return target;
}

function sanitizeEnvironmentForReport(environment) {
  if (!environment) {
    return null;
  }

  const sanitized = {
    name: environment.name,
    label: environment.label,
    slug: environment.slug,
    baseUrl: environment.baseUrl,
    paths: Array.isArray(environment.paths) ? environment.paths.slice() : undefined
  };

  const browserDetails = environment.browser || {};
  const device = environment.device || browserDetails.device;
  const viewport = environment.viewport || browserDetails.viewport;

  if (device) {
    sanitized.device = device;
  }

  if (viewport) {
    sanitized.viewport = viewport;
  }

  return sanitized;
}

function normalizeEnvironment(env, fallbackName) {
  if (!env || (!env.baseUrl && !env.url)) {
    throw new Error('Environment configuration requires a baseUrl.');
  }
  const name = env.name || fallbackName;
  const slug = env.slug || slugify(name, { lower: true, strict: true }) || fallbackName;
  const normalized = {
    ...env,
    name,
    slug,
    baseUrl: env.baseUrl || env.url,
    label: env.label || name
  };

  if (!normalized.device && normalized.browser?.device) {
    normalized.device = normalized.browser.device;
  }

  if (!normalized.viewport && normalized.browser?.viewport) {
    normalized.viewport = normalized.browser.viewport;
  }

  return normalized;
}

function normalizeConfig(config = {}) {
  if (!config.environments) {
    throw new Error('Configuration must include environments.source and environments.target.');
  }

  const source = normalizeEnvironment(config.environments.source, 'source');
  const target = normalizeEnvironment(config.environments.target, 'target');

  const paths = Array.isArray(config.paths) && config.paths.length > 0
    ? config.paths
    : DEFAULT_PATHS;

  const baseDir = path.resolve(config.outputDir || config.baseDir || 'screenshots/regression');
  const diffDir = path.resolve(config.diffDir || path.join(baseDir, 'diff'));

  const thresholds = {
    maxChangeRatio: typeof config.threshold?.maxChangeRatio === 'number'
      ? config.threshold.maxChangeRatio
      : DEFAULT_THRESHOLD,
    maxFailed: typeof config.threshold?.maxFailed === 'number'
      ? config.threshold.maxFailed
      : 0
  };

  const configuredHtmlName = config.reports?.htmlName || null;
  const configuredPattern = config.reports?.htmlPattern
    || (configuredHtmlName ? derivePatternFromName(configuredHtmlName) : null);
  const reports = {
    htmlName: configuredHtmlName,
    htmlPattern: configuredPattern || DEFAULT_REPORT_PATTERN,
    jsonName: config.reports?.jsonName || DEFAULT_JSON_NAME,
    outputDir: config.reports?.outputDir
      ? path.resolve(config.reports.outputDir)
      : diffDir
  };

  return {
    baseDir,
    diffDir,
    paths,
    thresholds,
    reports,
    capture: {
      enabled: config.capture?.enabled !== false,
      fullPage: config.capture?.fullPage !== false,
      timeout: typeof config.capture?.timeout === 'number' ? config.capture.timeout : undefined,
      device: config.capture?.device,
      viewport: config.capture?.viewport,
      launchOptions: config.capture?.launchOptions
    },
    ensureSetup: config.ensureSetup !== false,
    comparison: {
      mode: config.comparison?.mode || 'both',
      threshold: typeof config.comparison?.threshold === 'number'
        ? config.comparison.threshold
        : config.comparison?.pixelThreshold,
      minDelta: typeof config.comparison?.minDelta === 'number' ? config.comparison.minDelta : undefined,
      maxDelta: typeof config.comparison?.maxDelta === 'number' ? config.comparison.maxDelta : undefined,
      limit: typeof config.comparison?.limit === 'number' ? config.comparison.limit : undefined
    },
    source,
    target,
    metadata: config.metadata || {}
  };
}

async function performCapture(normalized) {
  const { baseDir, paths, source, target } = normalized;
  const screenshotService = new ScreenshotService({
    outputDir: baseDir,
    device: normalized.capture.device,
    viewport: normalized.capture.viewport,
    launchOptions: normalized.capture.launchOptions
  });

  const captures = [];
  const environments = [source, target];

  try {
    for (const env of environments) {
      for (const segment of paths) {
        const labelParts = [env.slug];
        if (segment && segment !== '/') {
          labelParts.push(segment.replace(/\//g, '-'));
        }
        const label = labelParts.filter(Boolean).join('-');
        const capture = await screenshotService.capture(env.baseUrl, segment || '', {
          environment: env,
          label,
          device: normalized.capture.device,
          fullPage: normalized.capture.fullPage,
          timeout: normalized.capture.timeout
        });
        captures.push(capture);
      }
    }
  } finally {
    await screenshotService.close();
  }

  return captures;
}

async function compareEnvironments(normalized) {
  const comparisonService = new ComparisonService({
    baseDir: normalized.baseDir,
    diffDir: normalized.diffDir,
    mode: normalized.comparison.mode,
    threshold: normalized.comparison.threshold,
    minDelta: normalized.comparison.minDelta,
    ensureSetup: false,
    limit: normalized.comparison.limit
  });

  const pairs = await comparisonService.loadPairs(normalized.source.slug, normalized.target.slug, {
    paths: normalized.paths,
    includeArchived: false
  });

  if (!pairs.length) {
    throw new Error('No screenshot pairs available for comparison. Capture step may have failed.');
  }

  const results = [];
  for (const pair of pairs) {
    const result = await comparisonService.comparePair(pair, {
      mode: normalized.comparison.mode,
      threshold: normalized.comparison.threshold
    });
    results.push(result);
  }

  return { results, comparisonService };
}

function evaluateThresholds(results, thresholds) {
  const failing = results.filter((result) => result.changeRatio > thresholds.maxChangeRatio);
  const status = failing.length > thresholds.maxFailed ? 'failed' : 'passed';
  return {
    status,
    failing,
    changeSummary: results.map((result) => ({
      path: result.pathSlug,
      changeRatio: result.changeRatio,
      changePercent: formatPercent(result.changeRatio),
      diffRelativePath: result.diffRelativePath,
      mode: result.mode
    }))
  };
}

async function writeReports(normalized, results, reportSummary) {
  const { reports, diffDir, metadata } = normalized;
  const htmlReportPath = await reportSummary.comparisonService.generateReport(results, {
    outputDir: reports.outputDir,
    title: `Comparison: ${normalized.source.label} vs ${normalized.target.label}`,
    referenceUrl: normalized.source.baseUrl,
    targetUrl: normalized.target.baseUrl,
    ...(reports.htmlName ? { reportName: reports.htmlName } : {})
  });

  const jsonSummaryPath = path.resolve(reports.outputDir || diffDir, reports.jsonName);
  await fs.ensureDir(path.dirname(jsonSummaryPath));
  await fs.writeJson(jsonSummaryPath, {
    generatedAt: new Date().toISOString(),
    status: reportSummary.status,
    thresholds: normalized.thresholds,
    comparison: {
      key: metadata?.comparisonKey || null,
      label: metadata?.comparisonLabel || `${normalized.source.label} vs ${normalized.target.label}`,
      description: metadata?.description || null,
      environments: {
        source: metadata?.sanitizedEnvironments?.source || sanitizeEnvironmentForReport(normalized.source),
        target: metadata?.sanitizedEnvironments?.target || sanitizeEnvironmentForReport(normalized.target)
      }
    },
    metadata: {
      configPath: metadata?.configPath || null,
      requiredSecrets: metadata?.requiredSecrets || [],
      documentation: metadata?.documentation || {}
    },
    results: reportSummary.changeSummary
  }, { spaces: 2 });

  return {
    htmlReportPath,
    jsonSummaryPath
  };
}

function resolveRegressionConfig(inputConfig = {}) {
  if (inputConfig && inputConfig.environments) {
    return mergeDeep({}, inputConfig);
  }

  const envBackedConfig = loadEnvironmentConfig({
    comparisonKey: inputConfig?.comparisonKey,
    outputDir: inputConfig?.outputDir,
    diffDir: inputConfig?.diffDir,
    threshold: inputConfig?.threshold
  });

  const merged = mergeDeep({}, envBackedConfig);
  mergeDeep(merged, inputConfig || {});

  return merged;
}

function buildMetadata(normalized, baseMetadata = {}, fallbackKey = null) {
  const sanitized = baseMetadata.sanitizedEnvironments || {
    source: sanitizeEnvironmentForReport(normalized.source),
    target: sanitizeEnvironmentForReport(normalized.target)
  };

  return {
    comparisonKey: baseMetadata.comparisonKey || fallbackKey || null,
    comparisonLabel: baseMetadata.comparisonLabel || `${normalized.source.label} vs ${normalized.target.label}`,
    description: baseMetadata.description || null,
    configPath: baseMetadata.configPath || null,
    requiredSecrets: baseMetadata.requiredSecrets || [],
    documentation: baseMetadata.documentation || {},
    sanitizedEnvironments: sanitized
  };
}

async function runRegression(config = {}) {
  const preparedConfig = resolveRegressionConfig(config);
  const normalized = normalizeConfig(preparedConfig);
  normalized.metadata = buildMetadata(normalized, preparedConfig.metadata || {}, preparedConfig.comparisonKey);
  await fs.ensureDir(normalized.baseDir);
  await fs.ensureDir(normalized.diffDir);

  if (normalized.ensureSetup) {
    await ensureBrowsersInstalled();
  }

  if (normalized.capture.enabled) {
    await performCapture(normalized);
  }

  const comparisonOutput = await compareEnvironments(normalized);
  const evaluation = evaluateThresholds(comparisonOutput.results, normalized.thresholds);
  const reports = await writeReports(normalized, comparisonOutput.results, {
    ...evaluation,
    comparisonService: comparisonOutput.comparisonService
  });

  return {
    status: evaluation.status,
    results: evaluation.changeSummary,
    reports,
    thresholds: normalized.thresholds,
    environments: normalized.metadata.sanitizedEnvironments,
    comparison: {
      key: normalized.metadata.comparisonKey,
      label: normalized.metadata.comparisonLabel,
      description: normalized.metadata.description
    },
    metadata: normalized.metadata
  };
}

async function loadConfigFromFile(filePath) {
  const absolute = path.resolve(filePath);
  const exists = await fs.pathExists(absolute);
  if (!exists) {
    throw new Error(`Configuration file not found at ${absolute}`);
  }
  const data = await fs.readJson(absolute);
  return data;
}

async function executeFromCli() {
  const args = process.argv.slice(2);
  let configPath = null;
  const inlineConfig = {};

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--config' || arg === '-c') {
      configPath = args[i + 1];
      i += 1;
    } else if (arg === '--skip-capture') {
      inlineConfig.capture = inlineConfig.capture || {};
      inlineConfig.capture.enabled = false;
    } else if (arg.startsWith('--')) {
      // ignore unknown flags for now, could extend in future
    }
  }

  let config = inlineConfig;
  if (configPath) {
    const fileConfig = await loadConfigFromFile(configPath);
    config = { ...fileConfig, ...inlineConfig };
  }

  try {
    const result = await runRegression(config);
    console.log(`Regression status: ${result.status.toUpperCase()}`);
    console.log(`HTML report: ${result.reports.htmlReportPath}`);
    console.log(`JSON summary: ${result.reports.jsonSummaryPath}`);
    if (result.status !== 'passed') {
      process.exitCode = 1;
    }
  } catch (error) {
    console.error('Regression runner failed:', error.message);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  executeFromCli().catch((error) => {
    console.error('Unexpected regression runner error:', error);
    process.exitCode = 1;
  });
}

module.exports = {
  runRegression
};
