/**
 * Screenshot service built on Playwright for capturing environment URLs.
 */
const path = require('path');
const fs = require('fs-extra');
const { chromium } = require('playwright');
const configLoader = require('../utils/configLoader');
const { joinUrlAndPath } = require('../utils/urlBuilder');
const fileManager = require('../utils/file-manager');
const { ComparisonService } = require('./comparison');
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const DEFAULT_RETRY_ATTEMPTS = 2;
const DEFAULT_RETRY_DELAY = 500;
const DEFAULT_VIEWPORT = { width: 1280, height: 720 };
const DEFAULT_RETENTION = {
  maxPerEnvironment: 50,
  archiveDirName: '_archive'
};

/**
 * Service responsible for managing Playwright browser lifecycle and captures.
 */
class ScreenshotService {
  /**
   * @param {object} [options]
   * @param {object} [options.config] Preloaded configuration object; defaults to global config.
   * @param {string} [options.outputDir] Override directory for captured screenshots.
   * @param {object} [options.viewport] Viewport configuration passed to Playwright.
   * @param {object} [options.launchOptions] Additional launch options passed to Playwright.
   */
  constructor(options = {}) {
    this.config = options.config || configLoader.getConfig();
    this.outputDir = path.resolve(
      options.outputDir || this.config.outputDir || 'screenshots'
    );
    this.viewport = options.viewport || this.config.viewport || DEFAULT_VIEWPORT;
    this.launchOptions = options.launchOptions || this.config.browser?.launchOptions || {};
    this.browser = null;
    this.device = options.device || this.config.device?.name || 'desktop';
    this.sessionId = options.sessionId || `session-${Date.now()}`;
    this.retention = {
      ...DEFAULT_RETENTION,
      ...(this.config.storage?.retention || {}),
      ...(options.retention || {})
    };
    this.captureDefaults = {
      retries: options.retries ?? this.config.capture?.retries ?? DEFAULT_RETRY_ATTEMPTS,
      retryDelay: options.retryDelay ?? this.config.capture?.retryDelay ?? DEFAULT_RETRY_DELAY,
      waitUntil: options.waitUntil || this.config.capture?.waitUntil || 'networkidle',
      postWait: options.postWait ?? this.config.capture?.postWait ?? 0
    };
  }

  /**
   * Initialize the underlying Playwright browser if not already running.
   * @returns {Promise<void>} Resolves when the browser is ready for captures.
   */
  async init() {
    if (this.browser) {
      return;
    }
    this.browser = await chromium.launch(this.launchOptions);
  }

  /**
   * Capture a screenshot for the provided base URL and path segment.
   * @param {string} baseUrl Absolute base URL for the environment.
   * @param {string} [pathSegment=""] Path or query string joined to the base URL.
   * @param {object} [options]
   * @param {string} [options.label] Optional label included in the file name.
   * @param {string} [options.outputDir] Optional override output directory.
   * @param {boolean} [options.fullPage=true] Capture the full scrollable page when true.
   * @param {number} [options.timeout=30000] Navigation timeout in milliseconds.
  * @returns {Promise<object>} Capture metadata persisted by the file manager.
   */
  async capture(baseUrl, pathSegment = '', options = {}) {
    if (!baseUrl) {
      throw new Error('A baseUrl must be provided for screenshot capture.');
    }

    await this.init();

    const targetDir = path.resolve(options.outputDir || this.outputDir);
    await fs.ensureDir(targetDir);

    const environment = {
      name: options.environment?.name || options.environmentName || 'environment',
      baseUrl
    };

    const combinedUrl = joinUrlAndPath(baseUrl, pathSegment);
    const captureTimestamp = new Date();

    const artifact = await fileManager.prepareCapture({
      baseDir: targetDir,
      environment,
      pathSegment,
      url: combinedUrl,
      viewport: options.viewport || this.viewport,
      device: options.device || options.viewport?.label || options.viewport?.name || this.device,
      label: options.label,
      sessionId: this.sessionId,
      timestamp: captureTimestamp
    });

    const retries = options.retryAttempts ?? options.retries ?? this.captureDefaults.retries;
    const retryDelay = options.retryDelay ?? this.captureDefaults.retryDelay;
    let attempt = 0;
    let lastError = null;

    const waitUntil = options.waitUntil || this.captureDefaults.waitUntil || 'networkidle';
    const postWait = options.postWait ?? this.captureDefaults.postWait ?? 0;

    while (attempt <= retries) {
      try {
        const metadata = await this.performCaptureAttempt({
          artifact,
          combinedUrl,
          timeout: options.timeout,
          fullPage: options.fullPage,
          viewport: options.viewport || this.viewport,
          waitUntil,
          postWait
        });
        await this.applyRetention(targetDir);
        return metadata;
      } catch (error) {
        lastError = error;
        attempt += 1;
        if (attempt > retries) {
          const envLabel = environment.name || 'environment';
          throw new Error(
            `Failed to capture ${envLabel} ${pathSegment || '/'} after ${attempt} attempt(s): ${error.message}`
          );
        }
        await delay(Math.max(retryDelay, 0) * attempt);
      }
    }

    throw lastError || new Error(`Failed to capture screenshot for ${combinedUrl}`);
  }

  async performCaptureAttempt(options) {
    const { artifact, combinedUrl, timeout, fullPage, viewport, waitUntil, postWait } = options;
    let page;
    try {
      page = await this.browser.newPage({ viewport: viewport || this.viewport });
      await page.goto(combinedUrl, {
        waitUntil: waitUntil || 'networkidle',
        timeout: timeout ?? 30000
      });
      if (postWait && postWait > 0) {
        await page.waitForTimeout(postWait);
      }
      await page.screenshot({ path: artifact.filePath, fullPage: fullPage !== false });
    } catch (error) {
      await fs.remove(artifact.filePath).catch(() => {});
      await fileManager.recordFailure(artifact, error);
      throw new Error(`Capture attempt failed for ${combinedUrl}: ${error.message}`);
    } finally {
      if (page) {
        await page.close();
      }
    }

    const stats = await fs.stat(artifact.filePath);
    return fileManager.finalizeCapture(artifact, {
      fileSize: stats.size,
      capturedAt: new Date().toISOString()
    });
  }

  async captureWithViewports(baseUrl, pathSegment = '', options = {}) {
    const viewports = this.normalizeViewports(options.viewports, options.viewport);
    const results = [];
    for (const vp of viewports) {
      const captureResult = await this.capture(baseUrl, pathSegment, {
        ...options,
        viewport: vp,
        device: options.device || vp?.label || vp?.name || this.device
      });
      results.push(captureResult);
    }
    return results;
  }

  normalizeViewports(viewports, fallback) {
    if (Array.isArray(viewports) && viewports.length > 0) {
      return viewports.map((viewport) => {
        if (!viewport) {
          return { ...this.viewport };
        }
        if (typeof viewport === 'string') {
          const [width, height] = viewport.split('x').map((value) => parseInt(value, 10));
          return { width, height };
        }
        return viewport;
      });
    }
    if (fallback) {
      return [fallback];
    }
    return [this.viewport];
  }

  async captureAndCompare(options) {
    const {
      reference,
      target,
      pathSegment = '/',
      viewports,
      captureOptions = {},
      comparison = {}
    } = options || {};

    if (!reference?.baseUrl || !target?.baseUrl) {
      throw new Error('captureAndCompare requires both reference and target environments with baseUrl properties.');
    }

    const viewportVariants = this.normalizeViewports(viewports, captureOptions.viewport);
    const captures = {
      reference: [],
      target: []
    };

    for (const viewport of viewportVariants) {
      const referenceCapture = await this.capture(reference.baseUrl, pathSegment, {
        ...captureOptions,
        environment: reference,
        viewport,
        device: captureOptions.device || viewport?.label || viewport?.name || this.device
      });
      const targetCapture = await this.capture(target.baseUrl, pathSegment, {
        ...captureOptions,
        environment: target,
        viewport,
        device: captureOptions.device || viewport?.label || viewport?.name || this.device
      });

      captures.reference.push(referenceCapture);
      captures.target.push(targetCapture);
    }

    const comparisonService = new ComparisonService({
      baseDir: comparison.baseDir || this.outputDir,
      diffDir: comparison.diffDir,
      mode: comparison.mode,
      threshold: comparison.threshold,
      ensureSetup: false,
      limit: comparison.limit,
      significantThreshold: comparison.significantThreshold,
      normalizeStrategy: comparison.normalizeStrategy
    });

    const sourceSlug = captures.reference[0]?.environment?.slug || reference.slug || reference.name;
    const targetSlug = captures.target[0]?.environment?.slug || target.slug || target.name;
    const comparisonPaths = Array.isArray(comparison.paths) && comparison.paths.length > 0
      ? comparison.paths
      : [pathSegment];

    const pairs = await comparisonService.loadPairs(sourceSlug, targetSlug, {
      paths: comparisonPaths,
      includeArchived: comparison.includeArchived
    });

    if (!pairs.length) {
      throw new Error('No screenshot pairs available after capture. Comparison cannot proceed.');
    }

    const comparisonResults = [];
    for (const pair of pairs) {
      const result = await comparisonService.comparePair(pair, {
        mode: comparison.mode,
        threshold: comparison.threshold,
        significantThreshold: comparison.significantThreshold,
        normalizeStrategy: comparison.normalizeStrategy
      });
      comparisonResults.push(result);
    }

    let reportPath = null;
    if (comparison.generateReport !== false) {
      reportPath = await comparisonService.generateReport(comparisonResults, {
        outputDir: comparison.reportOutput || comparison.diffDir,
        reportName: comparison.reportName,
        title: comparison.reportTitle
          || `${reference.name || 'Reference'} vs ${target.name || 'Target'} (${pathSegment})`
      });
    }

    return {
      captures,
      comparisonResults,
      reportPath
    };
  }

  /**
   * Close the underlying Playwright browser and release resources.
   * @returns {Promise<void>} Resolves once the browser is terminated.
   */
  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  async applyRetention(directory) {
    if (!this.retention?.maxPerEnvironment) {
      return;
    }

    try {
      await fileManager.pruneOldScreenshots(directory, this.retention);
    } catch (error) {
      console.warn(`Retention cleanup failed for ${directory}: ${error.message}`);
    }
  }

  async cleanup(options = {}) {
    const targetDir = path.resolve(options.outputDir || this.outputDir);
    return fileManager.pruneOldScreenshots(targetDir, {
      ...this.retention,
      ...(options.retention || {})
    });
  }
}

module.exports = {
  ScreenshotService
};
