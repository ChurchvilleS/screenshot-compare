const path = require('path');
const fs = require('fs-extra');
const { PNG } = require('pngjs');
const pixelmatch = require('pixelmatch');
const slugify = require('slugify');
const configLoader = require('../utils/configLoader');
const fileManager = require('../utils/file-manager');
const { ensureBrowsersInstalled } = require('../utils/browserSetup');
const { generateReportPath } = require('../report-path-generator');

const DEFAULT_THRESHOLD = 0.1;
const DEFAULT_MIN_DELTA = 0;
const DEFAULT_REPORT_NAME = 'comparison-report.html';
const DEFAULT_BATCH_REPORT_NAME = 'batch-comparison-report.html';
const DEFAULT_SIGNIFICANT_THRESHOLD = 0.02;
const DEFAULT_NORMALIZE_STRATEGY = 'crop';

function toPercent(value) {
  return Math.round(value * 10000) / 100;
}

async function loadPng(imagePath) {
  const buffer = await fs.readFile(imagePath);
  return PNG.sync.read(buffer);
}

function cropPng(source, width, height) {
  const cropped = new PNG({ width, height });
  for (let y = 0; y < height; y += 1) {
    const srcStart = (y * source.width) * 4;
    const destStart = (y * width) * 4;
    source.data.copy(cropped.data, destStart, srcStart, srcStart + width * 4);
  }
  return cropped;
}

function normalizePngPair(referencePng, targetPng, strategy, contextLabel) {
  if (!strategy || strategy === 'strict' || strategy === 'error' || strategy === 'none') {
    throw new Error(`Image dimensions differ for path ${contextLabel}`);
  }

  if (strategy !== 'crop') {
    throw new Error(`Image dimensions differ for path ${contextLabel} and cannot be normalized with strategy "${strategy}".`);
  }

  const width = Math.min(referencePng.width, targetPng.width);
  const height = Math.min(referencePng.height, targetPng.height);

  if (width <= 0 || height <= 0) {
    throw new Error(`Image dimensions differ for path ${contextLabel} and produced an invalid crop size.`);
  }

  const reference = cropPng(referencePng, width, height);
  const target = cropPng(targetPng, width, height);

  return {
    reference,
    target,
    metadata: {
      applied: true,
      strategy: strategy,
      width,
      height,
      message: `Cropped to shared dimensions ${width}x${height}`
    }
  };
}

function buildDiffFileName(pair, mode = 'diff') {
  const timestamp = pair.reference?.capturedAt || pair.reference?.timestamp || new Date().toISOString();
  const safeTimestamp = timestamp.replace(/[:.]/g, '-');
  const parts = [
    pair.pathSlug,
    `${pair.reference?.environment?.slug || 'env1'}-vs-${pair.target?.environment?.slug || 'env2'}`,
    mode,
    safeTimestamp
  ];
  return `${parts.filter(Boolean).join('__')}.png`;
}

function createReportHtml(results, options = {}) {
  const title = options.title || 'Screenshot Comparison Report';
  const generatedAt = new Date().toISOString();
  const significantCount = results.filter((item) => item.significant).length;
  const summary = `Total Results: ${results.length} | Significant Changes: ${significantCount}`;
  const rows = results
    .map((result) => {
      const changePercent = toPercent(result.changeRatio || 0);
      const pathLabel = result.reference?.path?.segment || result.pathSlug;
      const deviceLabel = result.deviceLabel || result.deviceToken || result.reference?.device?.token || result.target?.device?.token || '';
      const viewport = result.deviceViewport || {};
      const viewportLabel = viewport.width && viewport.height ? `${viewport.width}x${viewport.height}` : '';
      const headerLabel = [pathLabel, deviceLabel, viewportLabel].filter(Boolean).join(' · ');
      const diffImage = result.diffSrc || '';
      const refImage = result.referenceSrc || '';
      const targetImage = result.targetSrc || '';
      const statusClass = result.significant ? 'significant' : 'minor';
      const statusLabel = result.significant ? 'Significant change detected' : 'Minor change';
      return `
        <section class="comparison ${statusClass}">
          <header>
            <h2>${headerLabel}</h2>
            <div class="meta">
              <span>Change: ${changePercent}%</span>
              <span>Status: ${statusLabel}</span>
              <span>Mode: ${result.mode}</span>
              <span>Resolution: ${result.width}x${result.height}</span>
            </div>
          </header>
          <div class="images">
            <figure>
              <figcaption>${result.reference.environment.name || 'Reference'}</figcaption>
              <img src="${refImage}" alt="Reference" />
            </figure>
            <figure>
              <figcaption>${result.target.environment.name || 'Target'}</figcaption>
              <img src="${targetImage}" alt="Target" />
            </figure>
            ${diffImage ? `
            <figure>
              <figcaption>Diff</figcaption>
              <img src="${diffImage}" alt="Diff" />
            </figure>` : ''}
          </div>
        </section>
      `;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>${title}</title>
<style>
body { font-family: Arial, sans-serif; margin: 2rem; background: #fafafa; }
header { margin-bottom: 1rem; }
.comparison { background: #fff; border: 1px solid #ddd; border-radius: 8px; padding: 1rem 1.5rem; margin-bottom: 2rem; box-shadow: 0 2px 4px rgba(0,0,0,0.05); }
.comparison.significant { border-color: #d9534f; box-shadow: 0 2px 6px rgba(217,83,79,0.25); }
.comparison.significant header h2 { color: #c9302c; }
.comparison h2 { margin: 0; font-size: 1.2rem; }
.comparison .meta { color: #555; font-size: 0.9rem; display: flex; gap: 1rem; margin-top: 0.5rem; flex-wrap: wrap; }
.comparison .images { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 1rem; align-items: start; }
.comparison figure { margin: 0; background: #f4f4f4; border-radius: 4px; padding: 0.5rem; border: 1px solid #e0e0e0; }
.comparison figcaption { font-weight: bold; margin-bottom: 0.5rem; font-size: 0.9rem; }
.comparison img { width: 100%; border: 1px solid #ccc; border-radius: 4px; background: #fff; }
footer { color: #777; font-size: 0.85rem; margin-top: 2rem; text-align: center; }
.summary { background: #fff; border: 1px solid #ddd; border-radius: 6px; padding: 1rem; margin-bottom: 2rem; }
.summary strong { display: block; margin-bottom: 0.5rem; }
</style>
</head>
<body>
<h1>${title}</h1>
<p>Generated: ${generatedAt}</p>
<div class="summary">
<strong>Summary</strong>
<span>${summary}</span>
</div>
${rows}
<footer>Generated by screenshot-comparison-tool</footer>
</body>
</html>`;
}

class ComparisonService {
  constructor(options = {}) {
    this.config = options.config || configLoader.getConfig();
    this.baseDir = path.resolve(options.baseDir || this.config.outputDir || 'screenshots');
    this.diffDir = path.resolve(options.diffDir || this.config.comparison?.diffDir || path.join(this.baseDir, 'diff'));
    this.threshold = options.threshold ?? DEFAULT_THRESHOLD;
    this.minDelta = options.minDelta ?? DEFAULT_MIN_DELTA;
    this.mode = options.mode || 'both';
    this.ensureSetup = options.ensureSetup !== false;
    this.limit = options.limit;
    this.significantThreshold = options.significantThreshold
      ?? this.config.comparison?.significantThreshold
      ?? DEFAULT_SIGNIFICANT_THRESHOLD;
    this.normalizeStrategy = options.normalizeStrategy
      || this.config.comparison?.normalizeStrategy
      || DEFAULT_NORMALIZE_STRATEGY;
  }

  async ensureDependencies() {
    if (!this.ensureSetup) {
      return;
    }
    await ensureBrowsersInstalled().catch((error) => {
      console.warn(`Playwright setup warning: ${error.message}`);
      console.warn('Run "npm run setup" to install required browsers.');
    });
  }

  async loadPairs(referenceEnv, targetEnv, options = {}) {
    const grouped = await fileManager.getScreenshotsForComparison(this.baseDir, {
      includeArchived: options.includeArchived,
      environments: [referenceEnv, targetEnv]
    });

    const providedPaths = Array.isArray(options.paths) ? options.paths.filter(Boolean) : [];
    const paths = providedPaths.length > 0
      ? providedPaths.map((p) => fileManager_preparePathKey(p))
      : Object.keys(grouped);
    const pairs = [];

    for (const pathKey of paths) {
      const pathGroup = grouped[pathKey];
      if (!pathGroup) {
        continue;
      }
      const referenceCandidates = collectCandidatesForEnvironment(pathGroup, referenceEnv);
      const targetCandidates = collectCandidatesForEnvironment(pathGroup, targetEnv);

      if (!referenceCandidates.length || !targetCandidates.length) {
        continue;
      }

      const referenceByToken = groupCandidatesByDevice(referenceCandidates);
      const targetByToken = groupCandidatesByDevice(targetCandidates);

      const deviceTokens = Array.from(new Set([...Object.keys(referenceByToken), ...Object.keys(targetByToken)]));
      for (const token of deviceTokens) {
        const reference = referenceByToken[token]?.[0];
        const target = targetByToken[token]?.[0];
        if (!reference || !target) {
          continue;
        }

        const tokenSlug = token ? slugify(token, { lower: true, strict: true }) : null;
        const pathSlug = tokenSlug ? `${pathKey}-${tokenSlug}` : pathKey;
        pairs.push({
          pathSlug,
          reference,
          target,
          deviceToken: token || null,
          deviceLabel: reference.device?.name || target.device?.name || token || null,
          deviceViewport: reference.device?.viewport || target.device?.viewport || null
        });
      }
    }

    return pairs;
  }

  async comparePair(pair, options = {}) {
    const mode = options.mode || this.mode || 'both';
    const threshold = options.threshold ?? this.threshold;
    const significantThreshold = options.significantThreshold ?? this.significantThreshold;

    await fs.ensureDir(this.diffDir);

    const referencePath = pair.reference.absolutePath || path.resolve(this.baseDir, pair.reference.output.relativePath);
    const targetPath = pair.target.absolutePath || path.resolve(this.baseDir, pair.target.output.relativePath);

    let referencePng = await loadPng(referencePath);
    let targetPng = await loadPng(targetPath);
    let normalization = null;

    if (referencePng.width !== targetPng.width || referencePng.height !== targetPng.height) {
      const strategy = options.normalizeStrategy || this.normalizeStrategy;
      const normalized = normalizePngPair(referencePng, targetPng, strategy, pair.pathSlug);
      referencePng = normalized.reference;
      targetPng = normalized.target;
      normalization = normalized.metadata;
    }

    const { width, height } = referencePng;
    const diff = new PNG({ width, height });

    const diffPixels = pixelmatch(referencePng.data, targetPng.data, diff.data, width, height, {
      threshold,
      includeAA: true
    });

    const totalPixels = width * height;
    const changeRatio = diffPixels / totalPixels;
    const significant = changeRatio >= significantThreshold;

    let diffRelativePath = null;
    let diffAbsolutePath = null;
    if (mode === 'diff' || mode === 'both') {
      const diffFileName = buildDiffFileName(pair, 'diff');
      diffAbsolutePath = path.join(this.diffDir, diffFileName);
      await fs.ensureDir(path.dirname(diffAbsolutePath));
      await fs.writeFile(diffAbsolutePath, PNG.sync.write(diff));
      diffRelativePath = path.relative(this.baseDir, diffAbsolutePath);
    }

    return {
      pathSlug: pair.pathSlug,
      reference: pair.reference,
      target: pair.target,
      diffPixels,
      totalPixels,
      changeRatio,
      width,
      height,
      mode,
      diffRelativePath,
      diffAbsolutePath,
      significant,
      significantThreshold,
      deviceToken: pair.deviceToken || pair.reference?.device?.token || pair.target?.device?.token || null,
      deviceLabel: pair.deviceLabel || pair.reference?.device?.name || pair.target?.device?.name || null,
      deviceViewport: pair.deviceViewport || pair.reference?.device?.viewport || pair.target?.device?.viewport || null,
      normalization
    };
  }

  filterComparisons(results, options = {}) {
    const minDelta = options.minDelta ?? this.minDelta;
    const maxDelta = options.maxDelta ?? 1;
    const filtered = results
      .filter((result) => result.changeRatio >= minDelta && result.changeRatio <= maxDelta)
      .sort((a, b) => b.changeRatio - a.changeRatio);

    const limit = options.limit ?? this.limit;
    if (limit && limit > 0) {
      return filtered.slice(0, limit);
    }
    return filtered;
  }

  async generateReport(results, options = {}) {
    const reportDir = path.resolve(options.outputDir || this.diffDir);
    const timestamp = options.timestamp || new Date();
    const referenceUrl = options.referenceUrl || options.reference?.baseUrl || null;
    const targetUrl = options.targetUrl || options.target?.baseUrl || null;

    let reportPath;

    if (options.reportPath) {
      reportPath = path.isAbsolute(options.reportPath)
        ? options.reportPath
        : path.join(reportDir, options.reportPath);
    } else if (options.reportName) {
      reportPath = path.join(reportDir, options.reportName);
    } else {
      try {
        reportPath = generateReportPath({
          directory: reportDir,
          referenceUrl,
          targetUrl,
          timestamp
        });
      } catch (error) {
        reportPath = path.join(reportDir, DEFAULT_REPORT_NAME);
      }
    }

    await fs.ensureDir(path.dirname(reportPath));

    const normalizedResults = results.map((result) => {
      const referenceAbsolute = result.reference?.absolutePath
        || path.resolve(this.baseDir, result.reference?.output?.relativePath || '');
      const targetAbsolute = result.target?.absolutePath
        || path.resolve(this.baseDir, result.target?.output?.relativePath || '');
      const diffAbsolute = result.diffAbsolutePath
        || (result.diffRelativePath ? path.resolve(this.baseDir, result.diffRelativePath) : null);

      return {
        ...result,
        referenceSrc: referenceAbsolute ? path.relative(path.dirname(reportPath), referenceAbsolute) : '',
        targetSrc: targetAbsolute ? path.relative(path.dirname(reportPath), targetAbsolute) : '',
        diffSrc: diffAbsolute ? path.relative(path.dirname(reportPath), diffAbsolute) : ''
      };
    });

    const reportHtml = createReportHtml(normalizedResults, options);
    await fs.writeFile(reportPath, reportHtml, 'utf8');
    return reportPath;
  }

  async compareBatch(options = {}) {
    const {
      reference,
      target,
      paths,
      viewports,
      capture = {},
      comparison = {},
      report = {},
      minDelta,
      maxDelta,
      limit
    } = options;

    if (!reference?.baseUrl || !target?.baseUrl) {
      throw new Error('compareBatch requires reference and target environments with baseUrl properties.');
    }

    if (this.ensureSetup) {
      await this.ensureDependencies();
    }

    const pathList = this.normalizePaths(paths);
    const captureOutputDir = capture.outputDir || this.baseDir;
    const { ScreenshotService } = require('./screenshot');
    const screenshotService = new ScreenshotService({
      outputDir: captureOutputDir,
      viewport: capture.viewport,
      device: capture.device,
      retries: capture.retries,
      retryDelay: capture.retryDelay,
      waitUntil: capture.waitUntil,
      launchOptions: capture.launchOptions
    });

    const aggregatedResults = [];

    try {
      for (const pathSegment of pathList) {
        const comparisonPayload = await screenshotService.captureAndCompare({
          reference,
          target,
          pathSegment,
          viewports,
          captureOptions: {
            ...capture,
            outputDir: captureOutputDir,
            label: capture.label,
            fullPage: capture.fullPage,
            timeout: capture.timeout,
            retries: capture.retries,
            retryDelay: capture.retryDelay,
            waitUntil: capture.waitUntil
          },
          comparison: {
            ...comparison,
            diffDir: comparison.diffDir || this.diffDir,
            threshold: comparison.threshold ?? this.threshold,
            mode: comparison.mode || this.mode,
            generateReport: false,
            significantThreshold: comparison.significantThreshold ?? this.significantThreshold
          }
        });

        comparisonPayload.comparisonResults.forEach((result) => {
          const changeRatio = result.changeRatio ?? 0;
          const significantThreshold = comparison.significantThreshold ?? this.significantThreshold;
          const deviceToken = result.deviceToken || result.reference?.device?.token || result.target?.device?.token || null;
          const deviceLabel = result.deviceLabel || result.reference?.device?.name || result.target?.device?.name || deviceToken;
          aggregatedResults.push({
            ...result,
            pathSegment,
            pathSlug: result.pathSlug || fileManager_preparePathKey(pathSegment),
            deviceToken,
            deviceLabel,
            significant: changeRatio >= significantThreshold,
            significantThreshold
          });
        });
      }
    } finally {
      await screenshotService.close().catch(() => {});
    }

    const filtered = this.filterComparisons(aggregatedResults, {
      minDelta: minDelta ?? this.minDelta,
      maxDelta,
      limit: limit ?? this.limit
    });

    let reportPath = null;
    if (report.generate !== false && filtered.length > 0) {
      const explicitReportName = report.reportName || comparison.reportName;
      const timestamp = report.timestamp || comparison.timestamp || new Date();
      reportPath = await this.generateReport(filtered, {
        outputDir: report.outputDir || comparison.reportOutput || comparison.diffDir || this.diffDir,
        reportName: explicitReportName,
        title: report.title || options.title || `${reference.name || reference.slug || 'Reference'} vs ${target.name || target.slug || 'Target'}`,
        referenceUrl: reference.baseUrl,
        targetUrl: target.baseUrl,
        timestamp
      });
    }

    return {
      results: aggregatedResults,
      filtered,
      reportPath
    };
  }

  normalizePaths(paths, fallback = ['/']) {
    if (Array.isArray(paths) && paths.length > 0) {
      return paths.map((segment) => {
        const value = segment == null ? '' : String(segment).trim();
        if (!value) {
          return '/';
        }
        if (value.startsWith('/') || value.startsWith('?') || value.startsWith('#')) {
          return value;
        }
        return `/${value}`;
      });
    }
    return Array.isArray(fallback) && fallback.length > 0 ? fallback : ['/'];
  }
}

function collectCandidatesForEnvironment(pathGroup, env) {
  const candidates = [];
  const keys = resolveEnvironmentKeys(env);
  for (const key of keys) {
    const records = pathGroup[key];
    if (records && records.length) {
      candidates.push(...records);
    }
  }
  return dedupeCandidates(candidates);
}

function resolveEnvironmentKeys(env) {
  const raw = [];
  if (!env) {
    return raw;
  }
  if (typeof env === 'string') {
    raw.push(env, fileManager_slug(env));
    return Array.from(new Set(raw.filter(Boolean)));
  }
  raw.push(env.slug, env.name, env.id);
  const normalized = new Set();
  raw.filter(Boolean).forEach((value) => {
    normalized.add(value);
    normalized.add(fileManager_slug(value));
  });
  return Array.from(normalized);
}

function dedupeCandidates(candidates) {
  const seen = new Set();
  return candidates.filter((candidate) => {
    const key = candidate.metadataPath || candidate.output?.metadataRelativePath || candidate.output?.relativePath;
    if (!key) {
      return true;
    }
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function groupCandidatesByDevice(candidates) {
  const grouped = {};
  candidates.forEach((candidate) => {
    const viewport = candidate.device?.viewport || {};
    const token = candidate.device?.token || `${viewport.width || 'na'}x${viewport.height || 'na'}`;
    if (!grouped[token]) {
      grouped[token] = [];
    }
    grouped[token].push(candidate);
  });

  Object.keys(grouped).forEach((token) => {
    grouped[token].sort((a, b) => {
      const aTime = new Date(a.capturedAt || a.timestamp).getTime();
      const bTime = new Date(b.capturedAt || b.timestamp).getTime();
      return bTime - aTime;
    });
  });

  return grouped;
}

function fileManager_slug(value) {
  if (typeof value !== 'string') {
    return value;
  }
  return slugify(value, { lower: true, strict: true }) || value.toLowerCase();
}

function fileManager_preparePathKey(pathSegment) {
  const normalized = typeof pathSegment === 'string' ? pathSegment.trim() : '';
  if (!normalized || normalized === '/') {
    return 'root';
  }
  return slugify(normalized.replace(/^\/+|\/+$/g, '') || 'root', { lower: true, strict: true }) || 'root';
}

module.exports = {
  ComparisonService,
  createReportHtml,
  buildDiffFileName
};
