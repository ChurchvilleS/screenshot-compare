const path = require('path');
const { Command, InvalidArgumentError } = require('commander');
const chalk = require('chalk');
const { ScreenshotService } = require('./services/screenshot');
const { ComparisonService } = require('./services/comparison');
const { checkBrowsersInstalled, ensureBrowsersInstalled } = require('./utils/browserSetup');
const environmentConfig = require('./utils/environmentConfig');

function parsePaths(value, previous) {
  if (!value) {
    return previous;
  }
  const paths = Array.isArray(previous) ? previous.slice() : [];
  if (Array.isArray(value)) {
    return paths.concat(value);
  }
  return paths.concat(String(value).split(',').map((segment) => segment.trim()).filter(Boolean));
}

function parseFloatOption(value, label) {
  if (value === undefined || value === null) {
    return undefined;
  }
  const parsed = parseFloat(value);
  if (Number.isNaN(parsed)) {
    throw new InvalidArgumentError(`${label} must be a number. Received: ${value}`);
  }
  return parsed;
}

function parseIntOption(value, label) {
  if (value === undefined || value === null) {
    return undefined;
  }
  const parsed = parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    throw new InvalidArgumentError(`${label} must be an integer. Received: ${value}`);
  }
  return parsed;
}

function parseViewports(value) {
  if (!value) {
    return [];
  }

  return String(value)
    .split(',')
    .map((entry, index) => entry.trim())
    .filter(Boolean)
    .map((entry, index) => {
      const [size, label] = entry.split('@');
      const [widthStr, heightStr] = size.split('x');
      const width = parseInt(widthStr, 10);
      const height = parseInt(heightStr, 10);
      if (Number.isNaN(width) || Number.isNaN(height)) {
        throw new InvalidArgumentError(`Viewport must be provided as WIDTHxHEIGHT. Received: ${entry}`);
      }
      return {
        width,
        height,
        label: label || `viewport-${index + 1}`
      };
    });
}

function validateUrlInput(input, label) {
  try {
    // eslint-disable-next-line no-new
    new URL(input);
    return input;
  } catch (error) {
    throw new InvalidArgumentError(`${label} must be a valid absolute URL. Received: ${input}`);
  }
}

function toPercent(ratio) {
  if (typeof ratio !== 'number' || Number.isNaN(ratio)) {
    return 0;
  }
  return Math.round(ratio * 10000) / 100;
}

function parseWaitUntil(value) {
  if (!value) {
    return undefined;
  }

  const normalized = String(value).trim().toLowerCase();
  const allowed = new Set(['load', 'domcontentloaded', 'networkidle', 'commit']);
  if (!allowed.has(normalized)) {
    throw new InvalidArgumentError('wait-until must be one of load, domcontentloaded, networkidle, commit.');
  }
  return normalized;
}

function resolveComparisonConfiguration(referenceKey, targetKey, options = {}) {
  const overrides = {
    outputDir: options.baseDir,
    diffDir: options.diffDir,
    threshold: {
      maxChangeRatio: typeof options.significantThreshold === 'number' ? options.significantThreshold : undefined
    }
  };

  const attemptKeys = [];
  if (options.comparisonKey) {
    attemptKeys.push(options.comparisonKey);
  }
  attemptKeys.push(`${referenceKey}-vs-${targetKey}`);
  attemptKeys.push(`${targetKey}-vs-${referenceKey}`);

  for (const key of attemptKeys.filter(Boolean)) {
    try {
      const config = environmentConfig.loadEnvironmentConfig({
        comparisonKey: key,
        outputDir: overrides.outputDir,
        diffDir: overrides.diffDir,
        threshold: overrides.threshold
      });
      return {
        config,
        comparisonKey: key,
        resolvedFromComparison: true
      };
    } catch (error) {
      if (options.comparisonKey === key) {
        throw error;
      }
    }
  }

  const config = environmentConfig.loadEnvironmentPair(referenceKey, targetKey, {
    outputDir: overrides.outputDir,
    diffDir: overrides.diffDir,
    threshold: overrides.threshold
  });

  return {
    config,
    comparisonKey: null,
    resolvedFromComparison: false
  };
}

async function handleCaptureCommand(sourceUrl, targetUrl, options) {
  validateUrlInput(sourceUrl, 'Source URL');
  validateUrlInput(targetUrl, 'Target URL');

  if (!options.skipSetup) {
    const status = checkBrowsersInstalled();
    if (!status.installed) {
      const message = status.message || 'Playwright browsers are not installed.';
      throw new Error(`${message} Run "${process.argv[0]} ${process.argv[1]} setup" or "npx playwright install".`);
    }
  }

  const service = new ScreenshotService({
    outputDir: options.output,
    retries: options.retries,
    retryDelay: options.retryDelay,
    waitUntil: options.waitUntil,
    postWait: options.postWait
  });
  const paths = options.paths && options.paths.length > 0 ? options.paths : ['/'];
  const environments = [
    { name: options.sourceLabel || 'source', baseUrl: sourceUrl },
    { name: options.targetLabel || 'target', baseUrl: targetUrl }
  ];

  const captures = [];
  const failures = [];
  const viewportVariants = Array.isArray(options.viewports) && options.viewports.length > 0
    ? options.viewports
    : [null];

  try {
    for (const pathSegment of paths) {
      const cleanedPath = pathSegment === undefined || pathSegment === null ? '' : String(pathSegment);
      console.log(chalk.cyan(`\nCapturing path: ${cleanedPath || '/'}`));
      if (options.compare) {
        try {
          const comparison = await service.captureAndCompare({
            reference: environments[0],
            target: environments[1],
            pathSegment: cleanedPath,
            viewports: viewportVariants,
            captureOptions: {
              label: options.label,
              outputDir: options.output,
              fullPage: options.fullPage,
              timeout: options.timeout,
              device: options.device,
              retries: options.retries,
              retryDelay: options.retryDelay,
              waitUntil: options.waitUntil,
              postWait: options.postWait
            },
            comparison: {
              diffDir: options.comparisonDiffDir || options.diffDir,
              threshold: options.comparisonThreshold,
              mode: options.comparisonMode,
              reportName: options.comparisonReportName,
              reportOutput: options.comparisonReportOutput,
              reportTitle: options.comparisonReportTitle,
              generateReport: options.noReport !== true
            }
          });

          captures.push(...comparison.captures.reference, ...comparison.captures.target);
          const summary = comparison.comparisonResults.map((result) => `${result.pathSlug}: ${toPercent(result.changeRatio)}% change`).join(', ');
          console.log(`  ${chalk.green('✔')} Comparison complete (${summary})`);
          if (comparison.reportPath) {
            console.log(`  Report: ${comparison.reportPath}`);
          }
        } catch (error) {
          failures.push({ env: `${environments[0].name} vs ${environments[1].name}`, path: cleanedPath, error });
          console.error(`  ${chalk.red('✖')} Comparison failed: ${error.message}`);
        }
        continue;
      }

      for (const env of environments) {
        for (const viewport of viewportVariants) {
          const labelParts = [env.name];
          if (options.label) {
            labelParts.push(options.label);
          }
          if (cleanedPath && cleanedPath !== '/') {
            labelParts.push(cleanedPath.replace(/\//g, '-'));
          }
          if (viewport?.label) {
            labelParts.push(viewport.label);
          }
          const label = labelParts.filter(Boolean).join('-');

          try {
            const result = await service.capture(env.baseUrl, cleanedPath, {
              label,
              outputDir: options.output,
              fullPage: options.fullPage,
              timeout: options.timeout,
              environment: env,
              device: options.device || viewport?.label,
              viewport,
              retries: options.retries,
              retryDelay: options.retryDelay,
              waitUntil: options.waitUntil,
              postWait: options.postWait
            });
            captures.push(result);
            const outputPath = result.absolutePath || path.resolve(options.output || service.outputDir, result.output?.fileName || '');
            const viewportLabel = viewport ? ` [${viewport.width}x${viewport.height}]` : '';
            console.log(`  ${chalk.green('✔')} ${env.name}${viewportLabel} -> ${outputPath}`);
          } catch (error) {
            failures.push({ env: env.name, path: cleanedPath, error });
            console.error(`  ${chalk.red('✖')} ${env.name} failed (${viewport?.label || `${viewport?.width}x${viewport?.height}` || 'default'}): ${error.message}`);
          }
        }
      }
    }
  } finally {
    await service.close();
  }

  if (failures.length > 0) {
    const errorMessages = failures
      .map((failure) => `${failure.env} ${failure.path || '/'}: ${failure.error.message}`)
      .join('; ');
    throw new Error(`One or more captures failed: ${errorMessages}`);
  }

  console.log(chalk.green(`\nCompleted ${captures.length} captures.`));
  return captures;
}

async function handleCompareCommand(referenceEnvKey, targetEnvKey, options) {
  const resolution = resolveComparisonConfiguration(referenceEnvKey, targetEnvKey, {
    baseDir: options.baseDir,
    diffDir: options.diffDir,
    comparisonKey: options.comparison,
    significantThreshold: options.significantThreshold
  });

  const config = resolution.config;
  const referenceEnv = config.environments.source;
  const targetEnv = config.environments.target;

  const baseDir = path.resolve(options.baseDir || config.outputDir);
  const diffDir = path.resolve(options.diffDir || config.diffDir);

  const viewports = Array.isArray(options.viewports) && options.viewports.length > 0
    ? options.viewports
    : (config.capture?.viewport ? [config.capture.viewport] : undefined);

  const captureDefaults = { ...config.capture };
  const defaultFullPage = typeof captureDefaults.fullPage === 'boolean' ? captureDefaults.fullPage : true;
  const captureOptions = {
    ...captureDefaults,
    outputDir: baseDir,
    device: options.device || captureDefaults.device,
    fullPage: options.fullPage !== undefined ? options.fullPage : defaultFullPage,
    timeout: options.timeout ?? captureDefaults.timeout,
    retries: options.retries ?? captureDefaults.retries,
    retryDelay: options.retryDelay ?? captureDefaults.retryDelay,
    viewport: captureDefaults.viewport,
    waitUntil: options.waitUntil || captureDefaults.waitUntil,
    postWait: options.postWait ?? captureDefaults.postWait,
    launchOptions: captureDefaults.launchOptions
  };

  const pixelmatchThreshold = typeof options.threshold === 'number'
    ? options.threshold
    : config.comparison?.threshold;
  const significantThreshold = typeof options.significantThreshold === 'number'
    ? options.significantThreshold
    : config.threshold?.maxChangeRatio;

  const comparisonService = new ComparisonService({
    baseDir,
    diffDir,
    mode: options.mode || config.comparison?.mode,
    threshold: pixelmatchThreshold,
    minDelta: options.minDelta,
    limit: options.limit ?? config.comparison?.limit,
    significantThreshold,
    ensureSetup: options.skipSetup !== true
  });

  const pathList = Array.isArray(options.paths) && options.paths.length > 0
    ? options.paths
    : config.paths;

  const configuredReportName = options.reportName || config.reports?.htmlName || null;
  const reportOutputDir = options.reportOutput || diffDir;

  const batchResult = await comparisonService.compareBatch({
    reference: referenceEnv,
    target: targetEnv,
    paths: pathList,
    viewports,
    capture: captureOptions,
    comparison: {
      ...config.comparison,
      threshold: pixelmatchThreshold,
      diffDir,
      mode: options.mode || config.comparison?.mode,
      significantThreshold,
      reportOutput: reportOutputDir,
      ...(configuredReportName ? { reportName: configuredReportName } : {})
    },
    report: {
      outputDir: reportOutputDir,
      title: options.title || config.metadata?.comparisonLabel || `${referenceEnvKey} vs ${targetEnvKey}`,
      generate: options.report !== false,
      referenceUrl: referenceEnv.baseUrl,
      targetUrl: targetEnv.baseUrl,
      ...(configuredReportName ? { reportName: configuredReportName } : {})
    },
    minDelta: options.minDelta,
    maxDelta: options.maxDelta,
    limit: options.limit
  });

  if (resolution.comparisonKey) {
    console.log(chalk.gray(`Using comparison preset "${resolution.comparisonKey}".`));
  }

  if (!batchResult.results.length) {
    console.log('No comparison results generated. Ensure screenshots can be captured for the requested paths.');
  }

  const renderList = batchResult.filtered.length ? batchResult.filtered : batchResult.results;
  const significantCount = renderList.filter((result) => result.significant).length;

  if (renderList.length) {
    console.log(chalk.cyan(`\nComparison results for ${referenceEnv.label || referenceEnvKey} vs ${targetEnv.label || targetEnvKey}:`));
    renderList.forEach((result) => {
      const statusIcon = result.significant ? chalk.red('✖') : chalk.green('✔');
      const deviceToken = result.reference?.device?.token || result.reference?.device?.name || '';
      const viewportLabel = deviceToken ? ` [${deviceToken}]` : '';
      const changeText = `${toPercent(result.changeRatio)}%`;
      console.log(`${statusIcon} ${result.pathSlug}${viewportLabel} -> ${changeText} change`);
      if (result.diffAbsolutePath) {
        console.log(`   Diff: ${result.diffAbsolutePath}`);
      }
    });
  }

  if (batchResult.reportPath) {
    console.log(chalk.cyan(`\nHTML report: ${batchResult.reportPath}`));
  }

  console.log(chalk.green(`
Completed ${batchResult.results.length} comparison result(s); ${significantCount} significant change(s).`));

  if (options.json) {
    console.log(JSON.stringify({
      results: batchResult.results,
      filtered: batchResult.filtered,
      reportPath: batchResult.reportPath
    }, null, 2));
  }

  return batchResult;
}

async function handleSetupCommand(options) {
  if (options.check) {
    const status = checkBrowsersInstalled();
    if (status.installed) {
      console.log('✅ Playwright browsers already installed at:', status.executable);
    } else {
      console.log('⚠ Playwright browsers missing. Run "npx playwright install" or rerun this command without --check.');
      if (status.message) {
        console.log(`   Details: ${status.message}`);
      }
    }
    return;
  }

  console.log('Installing Playwright browsers...');
  const status = await ensureBrowsersInstalled({ force: options.force });
  if (status.installed) {
    console.log('✅ Playwright browsers installed at:', status.executable);
  } else {
    throw new Error(status.message || 'Unable to verify Playwright installation.');
  }
}

async function runCli(argv = process.argv) {
  const program = new Command();
  program
    .name('screenshot-comparison-tool')
    .description('Capture and compare screenshots across environments')
    .version('0.1.0');

  program
    .command('setup')
    .description('Install required Playwright browsers')
    .option('--force', 'Reinstall browsers even if already installed')
    .option('--check', 'Only verify installation status without installing')
    .action(async (options) => {
      await handleSetupCommand(options);
    });

  program
    .command('capture <sourceUrl> <targetUrl>')
    .description('Capture screenshots from source and target environments for the provided paths')
    .option('-p, --paths <paths...>', 'Paths to capture (space separated)', parsePaths, [])
    .option('-o, --output <dir>', 'Output directory for screenshots')
    .option('--label <label>', 'Label prefix applied to captured files')
    .option('--source-label <label>', 'Label for the source environment', 'source')
    .option('--target-label <label>', 'Label for the target environment', 'target')
    .option('--timeout <ms>', 'Navigation timeout in milliseconds', (value) => parseInt(value, 10))
    .option('--no-full-page', 'Disable full page screenshots')
    .option('--skip-setup', 'Skip browser installation verification')
    .option('--device <name>', 'Device descriptor used for metadata and naming')
    .option('--viewports <list>', 'Comma-separated viewport list (WIDTHxHEIGHT[@label])', parseViewports)
    .option('--retries <n>', 'Retry attempts per capture', (value) => parseIntOption(value, 'retries'))
    .option('--retry-delay <ms>', 'Delay between retries in milliseconds', (value) => parseIntOption(value, 'retry-delay'))
    .option('--wait-until <state>', 'Navigation waitUntil state (load, domcontentloaded, networkidle, commit)', parseWaitUntil)
  .option('--post-wait <ms>', 'Delay after navigation before taking a screenshot (milliseconds)', (value) => parseIntOption(value, 'post-wait'))
    .option('--compare', 'Run comparison pipeline after capturing each path')
    .option('--comparison-threshold <value>', 'Override comparison threshold (0-1)', (value) => parseFloatOption(value, 'comparison-threshold'))
    .option('--comparison-mode <mode>', 'Comparison mode for auto comparison (side-by-side, diff, both)')
    .option('--comparison-report-name <name>', 'Filename for generated comparison report')
    .option('--comparison-report-output <dir>', 'Directory for comparison reports')
    .option('--comparison-report-title <title>', 'Title used in generated comparison reports')
    .option('--comparison-diff-dir <dir>', 'Directory for comparison diff artifacts')
    .action(async (sourceUrl, targetUrl, options) => {
      await handleCaptureCommand(sourceUrl, targetUrl, options);
    });

  program
    .command('compare <referenceEnv> <targetEnv>')
    .description('Capture and compare screenshots across two environments')
    .option('-p, --paths <paths...>', 'Limit comparison to specific paths', parsePaths, [])
    .option('--mode <mode>', 'Comparison mode: side-by-side, diff, both', 'both')
    .option('--threshold <value>', 'Pixelmatch threshold (0-1)', (value) => parseFloatOption(value, 'threshold'))
    .option('--significant-threshold <value>', 'Change ratio treated as significant (0-1)', (value) => parseFloatOption(value, 'significant-threshold'))
    .option('--min-delta <value>', 'Minimum change ratio to include (0-1)', (value) => parseFloatOption(value, 'min-delta'))
    .option('--max-delta <value>', 'Maximum change ratio to include (0-1)', (value) => parseFloatOption(value, 'max-delta'))
    .option('--limit <n>', 'Limit number of comparisons in output', (value) => parseIntOption(value, 'limit'))
    .option('--diff-dir <dir>', 'Directory to store diff artifacts')
    .option('--report-output <dir>', 'Directory to write generated reports')
    .option('--report-name <name>', 'Filename for the HTML report')
    .option('--title <title>', 'Title used in generated reports')
    .option('--base-dir <dir>', 'Base screenshots directory')
    .option('--comparison <key>', 'Use a named comparison defined in config/environments.json')
    .option('--viewports <list>', 'Comma-separated viewport list (WIDTHxHEIGHT[@label])', parseViewports)
    .option('--device <name>', 'Device descriptor used for metadata and naming')
    .option('--retries <n>', 'Retry attempts per capture', (value) => parseIntOption(value, 'retries'))
    .option('--retry-delay <ms>', 'Delay between retries in milliseconds', (value) => parseIntOption(value, 'retry-delay'))
    .option('--timeout <ms>', 'Navigation timeout in milliseconds', (value) => parseIntOption(value, 'timeout'))
    .option('--no-full-page', 'Disable full page screenshots during capture')
  .option('--wait-until <state>', 'Navigation waitUntil state (load, domcontentloaded, networkidle, commit)', parseWaitUntil)
  .option('--post-wait <ms>', 'Delay after navigation before taking a screenshot (milliseconds)', (value) => parseIntOption(value, 'post-wait'))
    .option('--no-report', 'Skip report generation')
    .option('--json', 'Output raw comparison data as JSON')
    .option('--skip-setup', 'Skip Playwright browser installation verification')
    .action(async (referenceEnv, targetEnv, options) => {
      await handleCompareCommand(referenceEnv, targetEnv, options);
    });

  program.configureOutput({
    outputError: (str, write) => write(chalk.red(str))
  });

  await program.parseAsync(argv);
}

module.exports = {
  runCli,
  handleCaptureCommand,
  handleSetupCommand,
  handleCompareCommand
};
