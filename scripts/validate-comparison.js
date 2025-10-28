/* eslint-disable no-console */
const path = require('path');
const fs = require('fs-extra');
const { PNG } = require('pngjs');
const { spawnSync } = require('child_process');
const { ComparisonService } = require(path.resolve(__dirname, '..', 'src', 'services', 'comparison'));
const fileManager = require(path.resolve(__dirname, '..', 'src', 'utils', 'file-manager'));
const { checkBrowsersInstalled, ensureBrowsersInstalled } = require(path.resolve(__dirname, '..', 'src', 'utils', 'browserSetup'));

const CLI_ENTRY = path.resolve(__dirname, '..', 'src', 'index.js');
const DEFAULT_REPORT_PATTERN = 'comparison-report*.html';
const DEFAULT_BASE_DIR = process.env.VALIDATE_COMPARISON_BASE_DIR
  || path.join('screenshots', 'cv');

function resolveBaseDir({ baseDir, args = process.argv.slice(2) } = {}) {
  if (baseDir) {
    return path.isAbsolute(baseDir)
      ? baseDir
      : path.resolve(__dirname, '..', baseDir);
  }

  let candidate = DEFAULT_BASE_DIR;
  const inlineArg = args.find((arg) => arg.startsWith('--base-dir='));
  if (inlineArg) {
    const value = inlineArg.slice('--base-dir='.length);
    if (value) {
      candidate = value;
    }
  } else {
    const flagIndex = args.findIndex((arg) => arg === '--base-dir');
    if (flagIndex !== -1 && args[flagIndex + 1]) {
      candidate = args[flagIndex + 1];
    }
  }

  return path.isAbsolute(candidate)
    ? candidate
    : path.resolve(__dirname, '..', candidate);
}

function resolveScriptOptions(overrides = {}) {
  const args = Array.isArray(overrides.args) ? overrides.args.slice() : process.argv.slice(2);
  let mock = typeof overrides.mock === 'boolean' ? overrides.mock : false;

  for (const arg of args) {
    if (arg === '--mock') {
      mock = true;
      continue;
    }
    if (arg.startsWith('--mock=')) {
      const value = arg.slice('--mock='.length).trim().toLowerCase();
      if (!value || ['1', 'true', 'yes', 'on'].includes(value)) {
        mock = true;
      }
      if (['0', 'false', 'no', 'off'].includes(value)) {
        mock = false;
      }
    }
  }

  const baseDir = resolveBaseDir({ baseDir: overrides.baseDir, args });
  return { baseDir, mock, args };
}

function globToRegExp(pattern) {
  if (!pattern || typeof pattern !== 'string') {
    return /^$/;
  }
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  const regexSource = `^${escaped.replace(/\*/g, '.*')}$`;
  return new RegExp(regexSource, 'i');
}

async function findMostRecentReport(reportDir, pattern = DEFAULT_REPORT_PATTERN) {
  if (!reportDir) {
    return null;
  }

  const resolvedDir = path.resolve(reportDir);
  const exists = await fs.pathExists(resolvedDir);
  if (!exists) {
    return null;
  }

  const regex = globToRegExp(pattern);
  const entries = await fs.readdir(resolvedDir);
  if (!entries || entries.length === 0) {
    return null;
  }

  const matches = [];

  for (const entry of entries) {
    if (!regex.test(entry)) {
      continue;
    }

    const entryPath = path.join(resolvedDir, entry);
    const stats = await fs.stat(entryPath).catch(() => null);
    if (!stats || !stats.isFile()) {
      continue;
    }

    matches.push({
      path: entryPath,
      mtime: stats.mtimeMs
    });
  }

  if (matches.length === 0) {
    return null;
  }

  matches.sort((a, b) => b.mtime - a.mtime);
  return matches[0].path;
}

async function ensurePlaywrightBrowsers() {
  const status = checkBrowsersInstalled();
  if (status.installed) {
    console.log('✅ Playwright browsers detected:', status.executable);
    return;
  }

  console.log('⚠ Playwright browsers not detected. Attempting automatic installation...');
  try {
    await ensureBrowsersInstalled();
    console.log('✅ Playwright browsers installed for validation.');
  } catch (error) {
    console.log('⚠ Automatic installation failed:', error.message);
    console.log('   Run "npm run setup" or "npx playwright install" before executing capture-based workflows.');
  }
}

async function createTestImage(filePath, colors) {
  console.log(`   → Creating test image at ${filePath}`);
  const size = 40;
  const png = new PNG({ width: size, height: size });
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const idx = (size * y + x) << 2;
      const colorIndex = Math.floor((x / size) * colors.length) % colors.length;
      const [r, g, b] = colors[colorIndex];
      png.data[idx] = r;
      png.data[idx + 1] = g;
      png.data[idx + 2] = b;
      png.data[idx + 3] = 255;
    }
  }
  await fs.ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, PNG.sync.write(png));
  console.log(`   ✔ Test image written (${filePath})`);
  return filePath;
}

async function createMetadata(baseDir, { environment, pathSegment, label, timestamp, colors }) {
  const artifact = await fileManager.prepareCapture({
    baseDir,
    environment,
    pathSegment,
    url: `${environment.baseUrl}${pathSegment}`,
    viewport: { width: 1280, height: 720 },
    device: 'desktop',
    label,
    sessionId: 'comparison-validation',
    timestamp
  });

  console.log(' → Prepared capture:', {
    filePath: artifact.filePath,
    metadataPath: artifact.metadataPath,
    environment: environment?.name || environment?.slug,
    pathSegment
  });

  await createTestImage(artifact.filePath, colors);
  const stats = await getFileStatsWithRetry(artifact.filePath);
  console.log(`   ✔ Image size ${stats.size} bytes at ${artifact.filePath}`);
  return fileManager.finalizeCapture(artifact, {
    fileSize: stats.size,
    capturedAt: timestamp.toISOString()
  });
}

async function getFileStatsWithRetry(targetPath, attempts = 3, delayMs = 60) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fs.stat(targetPath);
    } catch (error) {
      lastError = error;
      if (error.code !== 'ENOENT' || attempt === attempts) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs * attempt));
    }
  }
  throw lastError;
}

async function setupTestDataset(baseDir) {
  await fs.ensureDir(baseDir);

  const now = new Date();
  const earlier = new Date(now.getTime() - 30 * 60 * 1000);

  const records = [];
  records.push(
    await createMetadata(baseDir, {
      environment: { name: 'Staging', baseUrl: 'https://staging.example.com' },
      pathSegment: '/home',
      label: 'staging-home',
      timestamp: now,
      colors: [
        [66, 135, 245],
        [66, 245, 161]
      ]
    })
  );
  records.push(
    await createMetadata(baseDir, {
      environment: { name: 'Production', baseUrl: 'https://example.com' },
      pathSegment: '/home',
      label: 'production-home',
      timestamp: now,
      colors: [
        [245, 66, 123],
        [66, 135, 245]
      ]
    })
  );
  records.push(
    await createMetadata(baseDir, {
      environment: { name: 'Staging', baseUrl: 'https://staging.example.com' },
      pathSegment: '/pricing',
      label: 'staging-pricing',
      timestamp: earlier,
      colors: [
        [220, 220, 220],
        [120, 120, 120]
      ]
    })
  );
  records.push(
    await createMetadata(baseDir, {
      environment: { name: 'Production', baseUrl: 'https://example.com' },
      pathSegment: '/pricing',
      label: 'production-pricing',
      timestamp: earlier,
      colors: [
        [220, 220, 220],
        [120, 120, 120]
      ]
    })
  );

  console.log(`✅ Created ${records.length} synthetic capture records for comparison tests`);
  return records;
}

function runCli(args) {
  return spawnSync(process.execPath, [CLI_ENTRY, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });
}

function summarizeComparisons(results) {
  return results.map((result) => ({
    path: result.pathSlug,
    change: Math.round(result.changeRatio * 10000) / 100,
    diff: result.diffRelativePath
  }));
}

async function validateComparisonUtilities(options = {}) {
  const { baseDir, mock } = resolveScriptOptions(options);
  console.log('Validating comparison utilities...');
  await ensurePlaywrightBrowsers();

  await setupTestDataset(baseDir);

  const service = new ComparisonService({
    baseDir,
    diffDir: path.join(baseDir, 'diff'),
    ensureSetup: false,
    threshold: 0.1
  });

  const pairs = await service.loadPairs('staging', 'production');
  console.log(`✅ Loaded ${pairs.length} comparison pair(s)`);

  const comparisons = [];
  for (const pair of pairs) {
    const result = await service.comparePair(pair, { mode: 'both', threshold: 0.1 });
    comparisons.push(result);
  }

  const filtered = service.filterComparisons(comparisons, { minDelta: 0 });
  console.log('✅ Comparison summary:', summarizeComparisons(filtered));

  const reportOutputDir = path.join(baseDir, 'reports');
  const sampleResult = filtered[0] || {};
  await service.generateReport(filtered, {
    outputDir: reportOutputDir,
    title: 'Validation Report: Staging vs Production',
    referenceUrl: sampleResult.reference?.url,
    targetUrl: sampleResult.target?.url
  });

  const latestReport = await findMostRecentReport(reportOutputDir, DEFAULT_REPORT_PATTERN)
    || path.join(reportOutputDir, 'comparison-report.html');
  const reportExists = await fs.pathExists(latestReport);
  console.log(`${reportExists ? '✅' : '❌'} HTML report generated at ${latestReport}`);

  const cliReportDir = path.join(baseDir, 'cli-reports');

  if (mock) {
    console.log('🧪 Mock mode detected: skipping CLI network capture.');
    await fs.ensureDir(cliReportDir);
    const mockReportPath = path.join(cliReportDir, 'cli-report-mock.html');
    const mockMarkup = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Mock CLI Report</title></head><body><h1>Mock CLI Report</h1><p>Validation executed in mock mode at ${new Date().toISOString()}.</p></body></html>`;
    await fs.writeFile(mockReportPath, mockMarkup, 'utf8');
    console.log('✅ Mock CLI compare command (network skipped)');
    console.log(`✅ CLI report located at ${mockReportPath}`);
  } else {
    const cliResult = runCli([
      'compare',
      'staging',
      'production',
      '--base-dir',
      baseDir,
      '--diff-dir',
      path.join(baseDir, 'cli-diff'),
      '--report-output',
      cliReportDir,
      '--mode',
      'diff',
      '--json',
      '--skip-setup'
    ]);

    const cliSuccess = cliResult.status === 0;
    console.log(`${cliSuccess ? '✅' : '❌'} CLI compare command (exit ${cliResult.status})`);
    if (!cliSuccess) {
      console.log('   stderr:', cliResult.stderr.trim());
      console.log('   stdout:', cliResult.stdout.trim());
    }

    const cliReportPath = await findMostRecentReport(cliReportDir, 'cli-report*.html')
      || path.join(cliReportDir, 'cli-report.html');
    const cliReportExists = await fs.pathExists(cliReportPath);
    console.log(`${cliReportExists ? '✅' : '❌'} CLI report located at ${cliReportPath}`);
  }

  console.log('Comparison utilities validation complete!');
}

if (require.main === module) {
  validateComparisonUtilities().catch((error) => {
    console.error('Comparison validation failed:', error);
    process.exitCode = 1;
  });
}

module.exports = {
  globToRegExp,
  findMostRecentReport,
  DEFAULT_REPORT_PATTERN,
  DEFAULT_BASE_DIR,
  resolveBaseDir,
  resolveScriptOptions,
  getFileStatsWithRetry,
  validateComparisonUtilities
};
