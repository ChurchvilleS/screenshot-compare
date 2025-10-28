const path = require('path');
const fs = require('fs-extra');
const { runRegression } = require('../../src/ci/regressionRunner');
const { createTempDir, createComparisonPair } = require('../setup');
const { clearEnvironmentConfigCache } = require('../../src/utils/environmentConfig');

jest.mock('../../src/utils/browserSetup', () => ({
  ensureBrowsersInstalled: jest.fn(async () => {})
}));

jest.mock('../../src/services/screenshot', () => ({
  ScreenshotService: jest.fn(() => ({
    capture: jest.fn(async () => ({})),
    close: jest.fn(async () => {})
  }))
}));

describe('CI regression runner integration', () => {
  const snapshot = { ...process.env };

  beforeEach(() => {
    process.env.DEV_BASE_URL = 'https://dev.example.test';
    process.env.DEV_BASIC_AUTH_USER = 'dev-user';
    process.env.DEV_BASIC_AUTH_PASS = 'dev-pass';
    process.env.STAGING_BASE_URL = 'https://staging.example.test';
    process.env.STAGING_API_TOKEN = 'token';
    process.env.PRODUCTION_BASE_URL = 'https://prod.example.test';
    clearEnvironmentConfigCache();
  });

  afterAll(() => {
    Object.keys(process.env).forEach((key) => {
      delete process.env[key];
    });
    Object.assign(process.env, snapshot);
    clearEnvironmentConfigCache();
  });

  it('evaluates environment comparison and writes artifacts', async () => {
    const baseDir = createTempDir('ci-regression');
    const diffDir = path.join(baseDir, 'diff');

    await createComparisonPair(baseDir, {
      pathSegment: '/',
      pathSlug: 'root',
      source: { name: 'Development', slug: 'development', baseUrl: process.env.DEV_BASE_URL },
      target: { name: 'Staging', slug: 'staging', baseUrl: process.env.STAGING_BASE_URL },
      sourceColors: [[255, 0, 0, 255], [0, 0, 0, 255]],
      targetColors: [[255, 0, 0, 255], [0, 0, 0, 255]]
    });

    const result = await runRegression({
      comparisonKey: 'dev-vs-staging',
      outputDir: baseDir,
      diffDir,
      capture: { enabled: false },
      ensureSetup: false,
      threshold: { maxChangeRatio: 0.2 }
    });

    expect(result.status).toBe('passed');
    expect(result.reports.htmlReportPath).toBeTruthy();
    expect(await fs.pathExists(result.reports.htmlReportPath)).toBe(true);
    expect(result.environments.source.slug).toBe('development');
  });
});
