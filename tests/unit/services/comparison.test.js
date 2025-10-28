const fs = require('fs-extra');
const path = require('path');
const { PNG } = require('pngjs');

jest.mock('../../../src/report-path-generator', () => {
  const lazyPath = require('path');
  return {
    generateReportPath: jest.fn(() => lazyPath.join('screenshots', 'diff', 'mock-report.html'))
  };
});

const { generateReportPath } = require('../../../src/report-path-generator');
const mockCaptureAndCompare = jest.fn();
const mockClose = jest.fn();

jest.mock('../../../src/services/screenshot', () => ({
  ScreenshotService: jest.fn(() => ({
    captureAndCompare: mockCaptureAndCompare,
    close: mockClose
  }))
}));

const { ComparisonService, buildDiffFileName } = require('../../../src/services/comparison');
const { createTempDir, writePng } = require('../../setup');

jest.mock('../../../src/utils/browserSetup', () => ({
  ensureBrowsersInstalled: jest.fn().mockResolvedValue()
}));

jest.mock('../../../src/utils/configLoader', () => ({
  getConfig: jest.fn(() => ({ outputDir: 'unused' }))
}));

jest.mock('../../../src/utils/file-manager', () => {
  const actual = jest.requireActual('../../../src/utils/file-manager');
  return {
    ...actual,
    getScreenshotsForComparison: jest.fn(async (baseDir) => {
      const { createComparisonPair } = require('../../setup');
      const pair = await createComparisonPair(baseDir, {
        source: { name: 'Source', slug: 'source', baseUrl: 'https://source.test' },
        target: { name: 'Target', slug: 'target', baseUrl: 'https://target.test' }
      });
      return {
        home: {
          source: [pair.reference],
          target: [pair.target]
        }
      };
    })
  };
});

describe('ComparisonService', () => {
  beforeEach(() => {
    mockCaptureAndCompare.mockReset();
    mockClose.mockReset();
    mockClose.mockResolvedValue();
  });

  it('compares screenshot pairs and generates diff files', async () => {
    const baseDir = createTempDir('comparison');
    const diffDir = path.join(baseDir, 'diff');
    const service = new ComparisonService({ baseDir, diffDir, ensureSetup: false });

    const pairs = await service.loadPairs('source', 'target');
    expect(pairs).toHaveLength(1);

    const result = await service.comparePair(pairs[0]);
    expect(result.pathSlug).toBe('home-desktop-1280x720');
    expect(result.diffRelativePath).toContain('home-desktop-1280x720');
    expect(await fs.pathExists(path.join(baseDir, result.diffRelativePath))).toBe(true);
  });

  it('buildDiffFileName encodes environment slugs', () => {
    const name = buildDiffFileName({ pathSlug: 'sample', reference: { environment: { slug: 'env-1' } }, target: { environment: { slug: 'env-2' } } });
    expect(name).toContain('env-1-vs-env-2');
  });

  it('uses dynamic report paths when generating reports', async () => {
    const baseDir = createTempDir('comparison-report');
    const diffDir = path.join(baseDir, 'diff');
    const service = new ComparisonService({ baseDir, diffDir, ensureSetup: false });
    const pairs = await service.loadPairs('source', 'target');
    const comparison = await service.comparePair(pairs[0]);
    const timestamp = new Date('2025-10-27T14:22:15Z');

    generateReportPath.mockReturnValue(path.join(diffDir, 'dynamic-report.html'));

    const reportPath = await service.generateReport([comparison], {
      outputDir: diffDir,
      referenceUrl: 'https://source.test/home',
      targetUrl: 'https://target.test/home',
      timestamp
    });

    expect(generateReportPath).toHaveBeenCalledTimes(1);
    expect(generateReportPath).toHaveBeenCalledWith(expect.objectContaining({
      directory: path.resolve(diffDir),
      referenceUrl: 'https://source.test/home',
      targetUrl: 'https://target.test/home',
      timestamp
    }));
    expect(reportPath).toBe(path.join(diffDir, 'dynamic-report.html'));
  });

  it('crops mismatched dimensions when normalization strategy is crop', async () => {
    const baseDir = createTempDir('comparison-normalize');
    const diffDir = path.join(baseDir, 'diff');
    const service = new ComparisonService({ baseDir, diffDir, ensureSetup: false, normalizeStrategy: 'crop' });

    const referencePath = path.join(baseDir, 'reference.png');
    const targetPath = path.join(baseDir, 'target.png');
    await writePng(referencePath, { width: 40, height: 28 });
    await writePng(targetPath, { width: 32, height: 24 });

    const pair = {
      pathSlug: 'home-desktop-1280x720',
      reference: {
        absolutePath: referencePath,
        environment: { slug: 'source' },
        device: { token: 'desktop' }
      },
      target: {
        absolutePath: targetPath,
        environment: { slug: 'target' },
        device: { token: 'desktop' }
      }
    };

    const result = await service.comparePair(pair, { normalizeStrategy: 'crop' });
    expect(result.width).toBe(32);
    expect(result.height).toBe(24);
    expect(result.normalization).toEqual(expect.objectContaining({
      applied: true,
      strategy: 'crop',
      width: 32,
      height: 24,
      message: 'Cropped to shared dimensions 32x24'
    }));
  });

  it('throws when normalize strategy is set to none and dimensions differ', async () => {
    const baseDir = createTempDir('comparison-normalize-none');
    const diffDir = path.join(baseDir, 'diff');
    const service = new ComparisonService({ baseDir, diffDir, ensureSetup: false, normalizeStrategy: 'none' });

    const referencePath = path.join(baseDir, 'reference.png');
    const targetPath = path.join(baseDir, 'target.png');
    await writePng(referencePath, { width: 40, height: 28 });
    await writePng(targetPath, { width: 32, height: 24 });

    const pair = {
      pathSlug: 'home-desktop',
      reference: { absolutePath: referencePath },
      target: { absolutePath: targetPath }
    };

    await expect(service.comparePair(pair, { normalizeStrategy: 'none' }))
      .rejects.toThrow('Image dimensions differ for path home-desktop');
  });

  it('throws when normalize strategy is unsupported', async () => {
    const baseDir = createTempDir('comparison-normalize-unsupported');
    const diffDir = path.join(baseDir, 'diff');
    const service = new ComparisonService({ baseDir, diffDir, ensureSetup: false, normalizeStrategy: 'pad' });

    const referencePath = path.join(baseDir, 'reference.png');
    const targetPath = path.join(baseDir, 'target.png');
    await writePng(referencePath, { width: 50, height: 30 });
    await writePng(targetPath, { width: 40, height: 20 });

    const pair = {
      pathSlug: 'details-mobile',
      reference: { absolutePath: referencePath },
      target: { absolutePath: targetPath }
    };

    await expect(service.comparePair(pair, { normalizeStrategy: 'pad' }))
      .rejects.toThrow('cannot be normalized with strategy "pad"');
  });

  it('throws when crop normalization would result in zero dimension', async () => {
    const baseDir = createTempDir('comparison-normalize-zero');
    const diffDir = path.join(baseDir, 'diff');
    const service = new ComparisonService({ baseDir, diffDir, ensureSetup: false, normalizeStrategy: 'crop' });

    const referencePath = path.join(baseDir, 'reference.png');
    const targetPath = path.join(baseDir, 'target.png');
    await fs.writeFile(referencePath, Buffer.from([0x00]));
    await fs.writeFile(targetPath, Buffer.from([0x00]));

    const pair = {
      pathSlug: 'zero-dimension',
      reference: { absolutePath: referencePath },
      target: { absolutePath: targetPath }
    };

    const readSpy = jest.spyOn(PNG.sync, 'read');
    readSpy.mockImplementationOnce(() => ({ width: 0, height: 20, data: Buffer.alloc(0) }));
    readSpy.mockImplementationOnce(() => ({ width: 20, height: 0, data: Buffer.alloc(0) }));

    await expect(service.comparePair(pair)).rejects.toThrow('invalid crop size');

    readSpy.mockRestore();
  });

  it('propagates normalization metadata through compareBatch results', async () => {
    const baseDir = createTempDir('comparison-batch-normalization');
    const diffDir = path.join(baseDir, 'diff');
    const service = new ComparisonService({ baseDir, diffDir, ensureSetup: false, normalizeStrategy: 'crop' });

    const normalization = {
      applied: true,
      strategy: 'crop',
      width: 1200,
      height: 900,
      message: 'Cropped to shared dimensions 1200x900'
    };

    mockCaptureAndCompare.mockResolvedValue({
      comparisonResults: [
        {
          pathSlug: 'home-desktop',
          changeRatio: 0.18,
          normalization,
          reference: {
            environment: { name: 'Baseline', slug: 'baseline' },
            output: { relativePath: 'baseline/home.png' },
            device: { token: 'desktop', name: 'Desktop', viewport: { width: 1280, height: 720 } }
          },
          target: {
            environment: { name: 'Candidate', slug: 'candidate' },
            output: { relativePath: 'candidate/home.png' },
            device: { token: 'desktop', name: 'Desktop', viewport: { width: 1280, height: 720 } }
          },
          diffRelativePath: 'diff/home.png',
          width: 1280,
          height: 720
        }
      ]
    });

    mockClose.mockResolvedValue();

    const result = await service.compareBatch({
      reference: { name: 'Baseline', baseUrl: 'https://baseline.test' },
      target: { name: 'Candidate', baseUrl: 'https://candidate.test' },
      paths: ['/home'],
      report: { generate: false }
    });

    expect(mockCaptureAndCompare).toHaveBeenCalledTimes(1);
    expect(mockClose).toHaveBeenCalledTimes(1);
    expect(result.results[0].normalization).toEqual(normalization);
    expect(result.filtered[0].normalization).toEqual(normalization);
  });
});
