/* eslint-disable no-console */
const path = require('path');
const os = require('os');
const fs = require('fs-extra');
const { performance } = require('perf_hooks');
const { spawnSync } = require('child_process');
const { PNG } = require('pngjs');
const pixelmatch = require('pixelmatch');
const { ComparisonService } = require('../src/services/comparison');
const fileManager = require('../src/utils/file-manager');

const ITERATIONS = Math.max(5, parseInt(process.env.BASELINE_ITERATIONS || '5', 10));
const OUTPUT_JSON = path.resolve(__dirname, '..', 'performance-baseline.json');
const OUTPUT_MD = path.resolve(__dirname, '..', 'PERFORMANCE-BASELINE.md');
const TEMP_ROOT = path.resolve(__dirname, '..', '.baseline-temp');

const TEST_CASES = [
  {
    id: 'mobile-minimal-diff',
    description: '375px mobile viewport with minor textual change',
    dimensions: { width: 375, height: 667 },
    pathSegment: '/mobile-minimal',
    pattern: {
      reference: {
        background: [240, 240, 240, 255],
        stripes: { orientation: 'vertical', stripeWidth: 30, colors: [[220, 220, 220, 255], [200, 200, 200, 255]] }
      },
      target: {
        background: [240, 240, 240, 255],
        stripes: { orientation: 'vertical', stripeWidth: 30, colors: [[220, 220, 220, 255], [200, 200, 200, 255]], offset: 5 },
        rectangles: [
          { x: 40, y: 320, width: 290, height: 28, color: [180, 30, 70, 255] }
        ]
      }
    }
  },
  {
    id: 'tablet-layout-shift',
    description: '768px tablet viewport with layout shift and minimal content change',
    dimensions: { width: 768, height: 1024 },
    pathSegment: '/tablet-shift',
    pattern: {
      reference: {
        background: [250, 250, 255, 255],
        stripes: { orientation: 'horizontal', stripeWidth: 40, colors: [[210, 220, 250, 255], [190, 200, 240, 255]] },
        rectangles: [
          { x: 120, y: 220, width: 520, height: 160, color: [70, 130, 180, 255] }
        ]
      },
      target: {
        background: [250, 250, 255, 255],
        stripes: { orientation: 'horizontal', stripeWidth: 40, colors: [[210, 220, 250, 255], [190, 200, 240, 255]], offset: 20 },
        rectangles: [
          { x: 120, y: 260, width: 520, height: 160, color: [70, 130, 180, 255] },
          { x: 140, y: 460, width: 240, height: 60, color: [255, 215, 0, 255] }
        ]
      }
    }
  },
  {
    id: 'desktop-content-change',
    description: '1280px desktop viewport with significant content differences',
    dimensions: { width: 1280, height: 720 },
    pathSegment: '/desktop-diff',
    pattern: {
      reference: {
        background: [245, 245, 245, 255],
        stripes: { orientation: 'vertical', stripeWidth: 60, colors: [[230, 230, 230, 255], [210, 210, 210, 255]] },
        rectangles: [
          { x: 160, y: 140, width: 960, height: 240, color: [60, 120, 200, 255] },
          { x: 160, y: 420, width: 960, height: 180, color: [90, 160, 220, 255] }
        ]
      },
      target: {
        background: [255, 250, 245, 255],
        stripes: { orientation: 'vertical', stripeWidth: 60, colors: [[255, 240, 220, 255], [255, 220, 200, 255]], offset: 30 },
        rectangles: [
          { x: 120, y: 120, width: 1040, height: 280, color: [200, 80, 60, 255] },
          { x: 120, y: 420, width: 1040, height: 220, color: [220, 110, 80, 255] }
        ]
      }
    }
  },
  {
    id: 'desktop-complex-page',
    description: '1440px desktop viewport with dense content and moderate differences',
    dimensions: { width: 1440, height: 900 },
    pathSegment: '/desktop-complex',
    pattern: {
      reference: {
        background: [235, 238, 240, 255],
        stripes: { orientation: 'grid', stripeWidth: 80, colors: [[210, 214, 219, 255], [190, 195, 200, 255]] },
        rectangles: [
          { x: 200, y: 200, width: 1040, height: 200, color: [80, 110, 150, 255] },
          { x: 220, y: 460, width: 480, height: 140, color: [120, 160, 90, 255] },
          { x: 740, y: 460, width: 480, height: 140, color: [150, 115, 180, 255] }
        ]
      },
      target: {
        background: [235, 238, 240, 255],
        stripes: { orientation: 'grid', stripeWidth: 80, colors: [[210, 214, 219, 255], [190, 195, 200, 255]], offset: 25 },
        rectangles: [
          { x: 180, y: 230, width: 1080, height: 160, color: [90, 130, 180, 255] },
          { x: 220, y: 460, width: 480, height: 140, color: [120, 160, 90, 255] },
          { x: 760, y: 460, width: 480, height: 140, color: [175, 135, 205, 255] },
          { x: 220, y: 640, width: 1020, height: 120, color: [230, 180, 80, 255] }
        ]
      }
    }
  },
  {
    id: 'large-diff-heavy',
    description: '1920px wide hero page with extensive differences',
    dimensions: { width: 1920, height: 1080 },
    pathSegment: '/hero-heavy',
    pattern: {
      reference: {
        background: [220, 225, 235, 255],
        stripes: { orientation: 'horizontal', stripeWidth: 90, colors: [[190, 200, 215, 255], [205, 215, 230, 255]] },
        rectangles: [
          { x: 160, y: 180, width: 1600, height: 360, color: [55, 105, 160, 255] },
          { x: 160, y: 600, width: 1600, height: 280, color: [75, 125, 190, 255] }
        ]
      },
      target: {
        background: [240, 225, 220, 255],
        stripes: { orientation: 'horizontal', stripeWidth: 90, colors: [[230, 210, 200, 255], [220, 190, 180, 255]], offset: 45 },
        rectangles: [
          { x: 200, y: 220, width: 1520, height: 280, color: [190, 70, 60, 255] },
          { x: 200, y: 540, width: 1520, height: 320, color: [210, 105, 90, 255] },
          { x: 200, y: 900, width: 1520, height: 100, color: [250, 200, 90, 255] }
        ]
      }
    }
  }
];

function ensureCleanGitState() {
  const status = spawnSync('git', ['status', '--porcelain'], { encoding: 'utf8' });
  if (status.status !== 0) {
    throw new Error(`Unable to verify git status (exit ${status.status}): ${status.stderr}`);
  }
  if (status.stdout.trim().length > 0) {
    throw new Error('Working tree has uncommitted changes. Please commit or stash before capturing the baseline.');
  }
}

function resolveCommitHash() {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`Unable to resolve commit hash: ${result.stderr}`);
  }
  return result.stdout.trim();
}

function ensureTempRoot() {
  return fs.ensureDir(TEMP_ROOT);
}

function rgbaTuple(color) {
  if (!Array.isArray(color) || color.length < 3) {
    return [0, 0, 0, 255];
  }
  return [color[0], color[1], color[2], color[3] != null ? color[3] : 255];
}

function applyBackground(png, color) {
  const [r, g, b, a] = rgbaTuple(color);
  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      const idx = (png.width * y + x) << 2;
      png.data[idx] = r;
      png.data[idx + 1] = g;
      png.data[idx + 2] = b;
      png.data[idx + 3] = a;
    }
  }
}

function applyStripes(png, options = {}) {
  if (!options || !options.colors || options.colors.length === 0) {
    return;
  }
  const colors = options.colors.map(rgbaTuple);
  const stripeWidth = Math.max(1, options.stripeWidth || 20);
  const offset = options.offset || 0;
  const orientation = options.orientation || 'vertical';

  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      let index;
      if (orientation === 'horizontal') {
        index = Math.floor((y + offset) / stripeWidth) % colors.length;
      } else if (orientation === 'grid') {
        const column = Math.floor((x + offset) / stripeWidth) % colors.length;
        const row = Math.floor((y + offset) / stripeWidth) % colors.length;
        index = (column + row) % colors.length;
      } else {
        index = Math.floor((x + offset) / stripeWidth) % colors.length;
      }
      if (index < 0) {
        index += colors.length;
      }
      const color = colors[index];
      const idx = (png.width * y + x) << 2;
      png.data[idx] = color[0];
      png.data[idx + 1] = color[1];
      png.data[idx + 2] = color[2];
      png.data[idx + 3] = color[3];
    }
  }
}

function applyRectangles(png, rectangles = []) {
  for (const rect of rectangles) {
    if (!rect) {
      continue;
    }
    const color = rgbaTuple(rect.color);
    const startX = Math.max(0, Math.floor(rect.x || 0));
    const startY = Math.max(0, Math.floor(rect.y || 0));
    const endX = Math.min(png.width, Math.floor((rect.x || 0) + (rect.width || png.width)));
    const endY = Math.min(png.height, Math.floor((rect.y || 0) + (rect.height || png.height)));

    for (let y = startY; y < endY; y += 1) {
      for (let x = startX; x < endX; x += 1) {
        const idx = (png.width * y + x) << 2;
        png.data[idx] = color[0];
        png.data[idx + 1] = color[1];
        png.data[idx + 2] = color[2];
        png.data[idx + 3] = color[3];
      }
    }
  }
}

function createPatternedBuffer(dimensions, pattern = {}) {
  const png = new PNG({ width: dimensions.width, height: dimensions.height });
  applyBackground(png, pattern.background || [255, 255, 255, 255]);
  applyStripes(png, pattern.stripes);
  applyRectangles(png, pattern.rectangles);
  return PNG.sync.write(png);
}

async function createCapture(baseDir, { environment, pathSegment, label, timestamp, dimensions, pattern }) {
  const artifact = await fileManager.prepareCapture({
    baseDir,
    environment,
    pathSegment,
    url: `${environment.baseUrl}${pathSegment}`,
    viewport: { width: dimensions.width, height: dimensions.height },
    device: `${dimensions.width}x${dimensions.height}`,
    label,
    sessionId: `baseline-${environment.slug}`,
    timestamp
  });

  const buffer = createPatternedBuffer(dimensions, pattern);
  await fs.ensureDir(path.dirname(artifact.filePath));
  await fs.writeFile(artifact.filePath, buffer);
  const stats = await fs.stat(artifact.filePath);

  return fileManager.finalizeCapture(artifact, {
    fileSize: stats.size,
    capturedAt: timestamp.toISOString()
  });
}

async function buildCaseFixtures(baseDir, testCase) {
  const timestamp = new Date();
  const environments = {
    reference: {
      name: 'Baseline Reference',
      slug: 'baseline-reference',
      baseUrl: 'https://baseline.reference.test'
    },
    target: {
      name: 'Baseline Target',
      slug: 'baseline-target',
      baseUrl: 'https://baseline.target.test'
    }
  };

  const reference = await createCapture(baseDir, {
    environment: environments.reference,
    pathSegment: testCase.pathSegment,
    label: `${testCase.id}-ref`,
    timestamp,
    dimensions: testCase.dimensions,
    pattern: testCase.pattern.reference
  });

  const target = await createCapture(baseDir, {
    environment: environments.target,
    pathSegment: testCase.pathSegment,
    label: `${testCase.id}-target`,
    timestamp,
    dimensions: testCase.dimensions,
    pattern: testCase.pattern.target
  });

  return { reference, target, environments };
}

function resolveImagePaths(baseDir, pair) {
  const referencePath = pair.reference.absolutePath
    || path.resolve(baseDir, pair.reference.output?.relativePath || '');
  const targetPath = pair.target.absolutePath
    || path.resolve(baseDir, pair.target.output?.relativePath || '');
  return { referencePath, targetPath };
}

async function measureComparisonMetrics(paths, options = {}) {
  if (typeof global.gc === 'function') {
    global.gc();
  }

  const totalStart = performance.now();
  const loadStart = performance.now();
  const referenceBuffer = await fs.readFile(paths.referencePath);
  const targetBuffer = await fs.readFile(paths.targetPath);
  const referencePng = PNG.sync.read(referenceBuffer);
  const targetPng = PNG.sync.read(targetBuffer);
  const loadTime = performance.now() - loadStart;

  let normalizeTime = 0;
  let reference = referencePng;
  let target = targetPng;

  if (referencePng.width !== targetPng.width || referencePng.height !== targetPng.height) {
    const normalizeStart = performance.now();
    const width = Math.min(referencePng.width, targetPng.width);
    const height = Math.min(referencePng.height, targetPng.height);
    const refCropped = new PNG({ width, height });
    const tgtCropped = new PNG({ width, height });

    for (let y = 0; y < height; y += 1) {
      const refSrc = (referencePng.width * y) << 2;
      const tgtSrc = (targetPng.width * y) << 2;
      const dest = (width * y) << 2;
      referencePng.data.copy(refCropped.data, dest, refSrc, refSrc + width * 4);
      targetPng.data.copy(tgtCropped.data, dest, tgtSrc, tgtSrc + width * 4);
    }

    normalizeTime = performance.now() - normalizeStart;
    reference = refCropped;
    target = tgtCropped;
  }

  const diffStart = performance.now();
  const diff = new PNG({ width: reference.width, height: reference.height });
  const diffPixels = pixelmatch(reference.data, target.data, diff.data, reference.width, reference.height, {
    threshold: options.threshold ?? 0.1,
    includeAA: true
  });
  const diffTime = performance.now() - diffStart;

  const totalTime = performance.now() - totalStart;
  const pixelCount = reference.width * reference.height;
  const timePerPixelNs = (totalTime * 1e6) / (pixelCount || 1);
  const memoryUsage = process.memoryUsage();

  return {
    width: reference.width,
    height: reference.height,
    diffPixels,
    changeRatio: diffPixels / (pixelCount || 1),
    loadTime,
    normalizeTime,
    diffTime,
    totalTime,
    timePerPixelNs,
    memoryRssMb: memoryUsage.rss / (1024 * 1024),
    memoryHeapMb: memoryUsage.heapUsed / (1024 * 1024)
  };
}

function summarize(values) {
  if (!values.length) {
    return { average: 0, min: 0, max: 0, median: 0 };
  }
  const sorted = values.slice().sort((a, b) => a - b);
  const sum = values.reduce((acc, value) => acc + value, 0);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
  return {
    average: sum / values.length,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    median
  };
}

function buildCaseSummary(caseId, iterations) {
  return {
    id: caseId,
    totalTimeMs: summarize(iterations.map((entry) => entry.totalTime)),
    loadTimeMs: summarize(iterations.map((entry) => entry.loadTime)),
    normalizeTimeMs: summarize(iterations.map((entry) => entry.normalizeTime)),
    diffTimeMs: summarize(iterations.map((entry) => entry.diffTime)),
    timePerPixelNs: summarize(iterations.map((entry) => entry.timePerPixelNs)),
    changeRatio: summarize(iterations.map((entry) => entry.changeRatio)),
    memoryRssMb: {
      ...summarize(iterations.map((entry) => entry.memoryRssMb)),
      peak: Math.max(...iterations.map((entry) => entry.memoryRssMb))
    },
    memoryHeapMb: {
      ...summarize(iterations.map((entry) => entry.memoryHeapMb)),
      peak: Math.max(...iterations.map((entry) => entry.memoryHeapMb))
    }
  };
}

function formatNumber(value, digits = 2) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : 0;
}

function buildJsonReport(meta, resultsByCase) {
  const summary = {
    averageTotalTimeMs: formatNumber(
      resultsByCase.reduce((acc, entry) => acc + entry.summary.totalTimeMs.average, 0) / resultsByCase.length
    ),
    peakTotalTimeMs: formatNumber(Math.max(...resultsByCase.map((entry) => entry.summary.totalTimeMs.max))),
    slowestCaseId: resultsByCase.reduce((slowest, entry) => {
      if (!slowest || entry.summary.totalTimeMs.average > slowest.average) {
        return { id: entry.case.id, average: entry.summary.totalTimeMs.average };
      }
      return slowest;
    }, null)?.id || null,
    peakRssMb: formatNumber(Math.max(...resultsByCase.map((entry) => entry.summary.memoryRssMb.peak))),
    peakHeapMb: formatNumber(Math.max(...resultsByCase.map((entry) => entry.summary.memoryHeapMb.peak)))
  };

  return {
    meta,
    cases: resultsByCase.map((entry) => ({
      id: entry.case.id,
      description: entry.case.description,
      dimensions: entry.case.dimensions,
      pathSegment: entry.case.pathSegment,
      summary: {
        totalTimeMs: entry.summary.totalTimeMs,
        loadTimeMs: entry.summary.loadTimeMs,
        normalizeTimeMs: entry.summary.normalizeTimeMs,
        diffTimeMs: entry.summary.diffTimeMs,
        timePerPixelNs: entry.summary.timePerPixelNs,
        changeRatio: entry.summary.changeRatio,
        memoryRssMb: entry.summary.memoryRssMb,
        memoryHeapMb: entry.summary.memoryHeapMb
      }
    })),
    summary
  };
}

function buildMarkdownReport(jsonReport) {
  const lines = [];
  lines.push('# Performance Baseline Report');
  lines.push('');
  lines.push(`- Captured: ${jsonReport.meta.timestamp}`);
  lines.push(`- Commit: ${jsonReport.meta.commit}`);
  lines.push(`- Node.js: ${jsonReport.meta.node}`);
  lines.push(`- OS: ${jsonReport.meta.os.platform} ${jsonReport.meta.os.release} (${jsonReport.meta.os.arch})`);
  lines.push(`- CPU: ${jsonReport.meta.os.cpu}`);
  lines.push(`- Iterations per case: ${jsonReport.meta.iterations}`);
  lines.push('');
  lines.push('## Aggregate Summary');
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('| --- | --- |');
  lines.push(`| Average total time (ms) | ${jsonReport.summary.averageTotalTimeMs} |`);
  lines.push(`| Peak total time (ms) | ${jsonReport.summary.peakTotalTimeMs} |`);
  lines.push(`| Peak RSS (MB) | ${jsonReport.summary.peakRssMb} |`);
  lines.push(`| Peak Heap (MB) | ${jsonReport.summary.peakHeapMb} |`);
  lines.push(`| Slowest case | ${jsonReport.summary.slowestCaseId || 'n/a'} |`);
  lines.push('');
  lines.push('## Case Metrics');
  lines.push('');
  lines.push('| Case | Dimensions | Avg Total (ms) | Avg Load (ms) | Avg Normalize (ms) | Avg Diff (ms) | Time/Pixel (ns) | Change Ratio (%) | Peak RSS (MB) |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- |');

  jsonReport.cases.forEach((entry) => {
    const dims = `${entry.dimensions.width}×${entry.dimensions.height}`;
    const total = formatNumber(entry.summary.totalTimeMs.average);
    const load = formatNumber(entry.summary.loadTimeMs.average);
    const normalize = formatNumber(entry.summary.normalizeTimeMs.average);
    const diff = formatNumber(entry.summary.diffTimeMs.average);
    const tpp = formatNumber(entry.summary.timePerPixelNs.average);
    const change = formatNumber(entry.summary.changeRatio.average * 100);
    const peakRss = formatNumber(entry.summary.memoryRssMb.peak);
    lines.push(`| ${entry.id} | ${dims} | ${total} | ${load} | ${normalize} | ${diff} | ${tpp} | ${change} | ${peakRss} |`);
  });

  lines.push('');
  lines.push('## Comparison Guidance');
  lines.push('');
  lines.push('1. Run `node --expose-gc scripts/capture-performance-baseline.js` to generate a fresh report.');
  lines.push('2. Compare new `performance-baseline.json` metrics against the values above.');
  lines.push('3. Flag regressions where total time exceeds the recorded peak by more than 20%.');
  lines.push('4. If updating the baseline is required, obtain a review comment containing `BASELINE-UPDATE-APPROVED`.');

  return `${lines.join('\n')}\n`;
}

async function writeReports(jsonReport) {
  await fs.writeJson(OUTPUT_JSON, jsonReport, { spaces: 2 });
  await fs.writeFile(OUTPUT_MD, buildMarkdownReport(jsonReport), 'utf8');
}

async function runBaselineCapture() {
  console.log('🔍 Verifying git status...');
  ensureCleanGitState();
  const commit = resolveCommitHash();
  console.log(`✅ Clean worktree detected at commit ${commit}`);

  if (typeof global.gc !== 'function') {
    console.warn('⚠️  global.gc is not available. Run with "node --expose-gc" for accurate memory metrics.');
  }

  console.log('📁 Preparing temporary workspace...');
  await ensureTempRoot();
  const runDir = path.join(TEMP_ROOT, `baseline-run-${Date.now()}`);
  await fs.ensureDir(runDir);

  const service = new ComparisonService({
    baseDir: runDir,
    diffDir: path.join(runDir, 'diff'),
    ensureSetup: false,
    threshold: 0.1
  });

  const caseResults = [];

  for (const testCase of TEST_CASES) {
    console.log(`
📊 Measuring case: ${testCase.id} — ${testCase.description}`);
    const fixtures = await buildCaseFixtures(runDir, testCase);

    const pairs = await service.loadPairs(fixtures.environments.reference.slug, fixtures.environments.target.slug, {
      paths: [testCase.pathSegment],
      includeArchived: true
    });

    if (!pairs.length) {
      throw new Error(`Unable to load comparison pair for ${testCase.id}`);
    }

    const pair = pairs[0];
    const paths = resolveImagePaths(runDir, pair);
    const iterations = [];

    for (let i = 0; i < ITERATIONS; i += 1) {
      console.log(`   → Iteration ${i + 1} of ${ITERATIONS}`);
      const metrics = await measureComparisonMetrics(paths, { threshold: 0.1 });
      iterations.push(metrics);
      console.log(`     Total: ${formatNumber(metrics.totalTime)} ms, Diff: ${formatNumber(metrics.changeRatio * 100)}%, RSS: ${formatNumber(metrics.memoryRssMb)} MB`);
    }

    caseResults.push({
      case: testCase,
      summary: buildCaseSummary(testCase.id, iterations)
    });
  }

  const meta = {
    timestamp: new Date().toISOString(),
    commit,
    node: process.version,
    os: {
      platform: os.platform(),
      release: os.release(),
      arch: os.arch(),
      cpu: os.cpus()[0]?.model || 'unknown'
    },
    iterations: ITERATIONS
  };

  const jsonReport = buildJsonReport(meta, caseResults);
  console.log('\n📝 Writing reports...');
  await writeReports(jsonReport);
  console.log(`✅ Baseline JSON written to ${path.relative(process.cwd(), OUTPUT_JSON)}`);
  console.log(`✅ Baseline Markdown written to ${path.relative(process.cwd(), OUTPUT_MD)}`);

  await fs.remove(runDir).catch(() => {});
  const leftover = await fs.readdir(TEMP_ROOT).catch(() => []);
  if (!leftover.length) {
    await fs.remove(TEMP_ROOT).catch(() => {});
  }
  console.log('🧹 Temporary workspace cleaned up.');
  console.log('🎯 Performance baseline capture complete.');

  return jsonReport;
}

if (require.main === module) {
  runBaselineCapture().catch((error) => {
    console.error('❌ Baseline capture failed:', error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  runBaselineCapture
};
