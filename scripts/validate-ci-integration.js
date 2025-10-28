/* eslint-disable no-console */
const path = require('path');
const fs = require('fs-extra');
const { PNG } = require('pngjs');
const { runRegression } = require('../src/ci/regressionRunner');
const fileManager = require('../src/utils/file-manager');

async function createTestImage(filePath, colors) {
  const size = 40;
  const png = new PNG({ width: size, height: size });
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const offset = (size * y + x) << 2;
      const [r, g, b] = colors[(x + y) % colors.length];
      png.data[offset] = r;
      png.data[offset + 1] = g;
      png.data[offset + 2] = b;
      png.data[offset + 3] = 255;
    }
  }
  await fs.ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, PNG.sync.write(png));
  return filePath;
}

async function seedDataset(baseDir) {
  await fs.remove(baseDir).catch(() => {});
  await fs.ensureDir(baseDir);

  const now = new Date();
  const environments = [
    { name: 'Staging', baseUrl: 'https://staging.example.com' },
    { name: 'Production', baseUrl: 'https://example.com' }
  ];
  const paths = ['/home'];

  for (const env of environments) {
    for (const p of paths) {
      const artifact = await fileManager.prepareCapture({
        baseDir,
        environment: env,
        pathSegment: p,
        url: `${env.baseUrl}${p}`,
        viewport: { width: 1280, height: 720 },
        device: 'desktop',
        label: `${env.name.toLowerCase()}-${p.replace(/\//g, '') || 'root'}`,
        sessionId: 'ci-validation',
        timestamp: now
      });

      const colors = env.name === 'Staging'
        ? [[66, 135, 245], [66, 245, 161]]
        : [[245, 66, 123], [66, 135, 245]];

      await createTestImage(artifact.filePath, colors);
      const stats = await fs.stat(artifact.filePath);
      await fileManager.finalizeCapture(artifact, {
        fileSize: stats.size,
        capturedAt: now.toISOString()
      });
    }
  }
}

async function runScenario(label, config, expectFailure = false) {
  try {
    const result = await runRegression(config);
    console.log(`${result.status === 'passed' ? '✅' : '❌'} ${label} status: ${result.status}`);
    console.log(`   HTML report: ${result.reports.htmlReportPath}`);
    console.log(`   JSON summary: ${result.reports.jsonSummaryPath}`);
    if (!await fs.pathExists(result.reports.htmlReportPath)) {
      console.log('   ❌ Missing HTML report file.');
    }
    if (!await fs.pathExists(result.reports.jsonSummaryPath)) {
      console.log('   ❌ Missing JSON summary file.');
    }
    if (expectFailure ? result.status === 'passed' : result.status !== 'passed') {
      console.log('   ❌ Scenario did not meet expected outcome.');
    }
  } catch (error) {
    if (expectFailure) {
      console.log(`✅ ${label} threw as expected: ${error.message}`);
    } else {
      console.error(`❌ ${label} failed:`, error.message);
    }
  }
}

async function validateCiIntegration() {
  console.log('Validating CI regression runner integration...');
  const baseDir = path.resolve(__dirname, '..', 'screenshots', 'ci-integration');
  await seedDataset(baseDir);

  const sharedConfig = {
    outputDir: baseDir,
    diffDir: path.join(baseDir, 'diff'),
    capture: { enabled: false },
    ensureSetup: false,
    environments: {
      source: { name: 'Staging', baseUrl: 'https://staging.example.com' },
      target: { name: 'Production', baseUrl: 'https://example.com' }
    },
    paths: ['/home']
  };

  await runScenario('Passing threshold', {
    ...sharedConfig,
    threshold: { maxChangeRatio: 1 }
  });

  await runScenario('Failing threshold', {
    ...sharedConfig,
    diffDir: path.join(baseDir, 'diff-fail'),
    reports: { htmlName: 'fail-report.html', jsonName: 'fail-summary.json' },
    threshold: { maxChangeRatio: 0 }
  }, true);

  await runScenario('Invalid configuration', {
    diffDir: path.join(baseDir, 'invalid')
  }, true);

  console.log('CI regression runner validation complete!');
}

validateCiIntegration().catch((error) => {
  console.error('CI validation failed:', error);
  process.exitCode = 1;
});
