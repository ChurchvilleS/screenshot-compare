const fs = require('fs-extra');
const path = require('path');
const { ScreenshotService } = require('../../src/services/screenshot');
const { ComparisonService } = require('../../src/services/comparison');
const { createTempDir } = require('../setup');

jest.mock('../../src/utils/configLoader', () => ({
  getConfig: jest.fn(() => ({
    outputDir: 'unused',
    viewport: { width: 400, height: 300 },
    device: { name: 'desktop' }
  }))
}));

jest.mock('playwright', () => {
  const { writePng } = require('../setup');
  return {
    chromium: {
      launch: jest.fn(async () => {
        let lastUrl = null;
        return {
          newPage: jest.fn(async () => ({
            goto: jest.fn(async (url) => {
              lastUrl = url;
            }),
            screenshot: jest.fn(async ({ path: outputPath }) => {
              const colors = lastUrl && lastUrl.includes('source')
                ? [[255, 0, 0, 255], [0, 0, 0, 255]]
                : [[0, 0, 255, 255], [0, 0, 0, 255]];
              await writePng(outputPath, { width: 40, height: 40, colors });
            }),
            close: jest.fn(async () => {})
          })),
          close: jest.fn(async () => {})
        };
      })
    }
  };
});

describe('capture and compare workflow', () => {
  it('captures screenshots for two environments and produces a diff report', async () => {
    const baseDir = createTempDir('workflow');
    const diffDir = path.join(baseDir, 'diff');

    const screenshotService = new ScreenshotService({ outputDir: baseDir, sessionId: 'workflow' });

    await screenshotService.capture('https://source.test', '/home', {
      environment: { name: 'Source', slug: 'source', baseUrl: 'https://source.test' },
      label: 'source-home'
    });

    await screenshotService.capture('https://target.test', '/home', {
      environment: { name: 'Target', slug: 'target', baseUrl: 'https://target.test' },
      label: 'target-home'
    });

    await screenshotService.close();

    const comparisonService = new ComparisonService({ baseDir, diffDir, ensureSetup: false });
    const pairs = await comparisonService.loadPairs('source', 'target', { paths: ['/home'] });
    expect(pairs).toHaveLength(1);

    const result = await comparisonService.comparePair(pairs[0]);
    expect(result.changeRatio).toBeGreaterThan(0);

    const reportPath = await comparisonService.generateReport([result], {
      outputDir: diffDir,
      reportName: 'workflow-report.html',
      title: 'Source vs Target'
    });

    expect(await fs.pathExists(reportPath)).toBe(true);
  });
});
