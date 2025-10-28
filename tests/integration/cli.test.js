let screenshotMocks;
let comparisonMocks;

jest.mock('../../src/services/screenshot', () => {
  const mockCapture = jest.fn(async () => ({
    output: { fileName: 'capture.png', relativePath: 'capture.png' }
  }));
  const mockClose = jest.fn(async () => {});
  const mockConstructor = jest.fn(() => ({
    outputDir: 'mock-output',
    capture: mockCapture,
    close: mockClose
  }));

  screenshotMocks = {
    mockCapture,
    mockClose,
    mockConstructor
  };

  return {
    ScreenshotService: mockConstructor
  };
});

jest.mock('../../src/services/comparison', () => {
  const mockEnsureDependencies = jest.fn(async () => {});
  const mockLoadPairs = jest.fn(async () => ([{
    pathSlug: 'home',
    reference: { output: { relativePath: 'source.png' } },
    target: { output: { relativePath: 'target.png' } }
  }]));
  const mockComparePair = jest.fn(async (pair) => ({
    pathSlug: pair.pathSlug,
    changeRatio: 0.05,
    diffRelativePath: 'diff/home.png',
    reference: pair.reference,
    target: pair.target,
    mode: 'both'
  }));
  const mockFilterComparisons = jest.fn((results) => results);
  const mockGenerateReport = jest.fn(async () => 'diff/report.html');
  const mockCompareBatch = jest.fn(async () => ({
    results: [{ pathSlug: 'home', changeRatio: 0.05, diffAbsolutePath: 'diff/home.png', significant: false }],
    filtered: [],
    reportPath: 'diff/report-dynamic.html'
  }));
  const mockConstructor = jest.fn(() => ({
    ensureDependencies: mockEnsureDependencies,
    loadPairs: mockLoadPairs,
    comparePair: mockComparePair,
    filterComparisons: mockFilterComparisons,
    generateReport: mockGenerateReport,
    compareBatch: mockCompareBatch
  }));

  comparisonMocks = {
    mockEnsureDependencies,
    mockLoadPairs,
    mockComparePair,
    mockFilterComparisons,
    mockGenerateReport,
    mockCompareBatch,
    mockConstructor
  };

  return {
    ComparisonService: mockConstructor
  };
});

jest.mock('../../src/utils/browserSetup', () => ({
  checkBrowsersInstalled: jest.fn(() => ({ installed: true })),
  ensureBrowsersInstalled: jest.fn(async () => ({ installed: true }))
}));

jest.mock('../../src/utils/environmentConfig', () => {
  const baseConfig = {
    outputDir: 'mock-output',
    diffDir: 'mock-diff',
    paths: ['/home'],
    threshold: { maxChangeRatio: 0.1, maxFailed: 0 },
    capture: { fullPage: true, device: 'desktop', viewport: { width: 1280, height: 720 } },
    comparison: { mode: 'both', threshold: 0.1, limit: 10 },
    reports: { htmlPattern: 'comparison-report*.html', jsonName: 'mock-summary.json' },
    environments: {
      source: { name: 'Source', label: 'Source', slug: 'source', baseUrl: 'https://source.test' },
      target: { name: 'Target', label: 'Target', slug: 'target', baseUrl: 'https://target.test' }
    },
    metadata: {}
  };

  const loadConfig = () => ({
    ...baseConfig,
    capture: { ...baseConfig.capture },
    comparison: { ...baseConfig.comparison },
    reports: { ...baseConfig.reports },
    environments: {
      source: { ...baseConfig.environments.source },
      target: { ...baseConfig.environments.target }
    }
  });

  return {
    loadEnvironmentConfig: jest.fn(() => loadConfig()),
    loadEnvironmentPair: jest.fn(() => loadConfig()),
    clearEnvironmentConfigCache: jest.fn()
  };
});

const { runCli } = require('../../src/cli');

describe('CLI integration', () => {
  const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

  afterAll(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('runs capture command and invokes screenshot service', async () => {
    await runCli(['node', 'cli', 'capture', 'https://source.test', 'https://target.test', '--skip-setup']);

    expect(screenshotMocks.mockCapture).toHaveBeenCalled();
    expect(screenshotMocks.mockClose).toHaveBeenCalled();
  });

  it('runs compare command and generates report', async () => {
    await runCli([
      'node',
      'cli',
      'compare',
      'source',
      'target',
      '--skip-setup',
      '--no-report'
    ]);

    expect(comparisonMocks.mockEnsureDependencies).not.toHaveBeenCalled();
    expect(comparisonMocks.mockCompareBatch).toHaveBeenCalled();
    expect(comparisonMocks.mockGenerateReport).not.toHaveBeenCalled();
  });
});
