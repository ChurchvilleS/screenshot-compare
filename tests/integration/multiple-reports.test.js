const fs = require('fs-extra');
const path = require('path');
const { ComparisonService } = require('../../src/services/comparison');
const { createTempDir, createComparisonPair } = require('../setup');

describe('comparison workflow report generation', () => {
  it('produces uniquely named reports for different URL pairs', async () => {
    const baseDir = createTempDir('multi-report');
    const diffDir = path.join(baseDir, 'diff');

    await createComparisonPair(baseDir, {
      pathSegment: '/home',
      source: { name: 'Alpha', slug: 'alpha', baseUrl: 'https://alpha-source.test' },
      target: { name: 'Beta', slug: 'beta', baseUrl: 'https://beta-target.test' },
      sourceColors: [[200, 50, 50, 255], [50, 50, 50, 255]],
      targetColors: [[50, 50, 200, 255], [50, 50, 50, 255]]
    });

    await createComparisonPair(baseDir, {
      pathSegment: '/offers',
      source: { name: 'Gamma', slug: 'gamma', baseUrl: 'https://gamma-travel.test' },
      target: { name: 'Delta', slug: 'delta', baseUrl: 'https://delta-shop.test' },
      sourceColors: [[80, 180, 80, 255], [30, 30, 30, 255]],
      targetColors: [[180, 80, 180, 255], [30, 30, 30, 255]]
    });

    const service = new ComparisonService({ baseDir, diffDir, ensureSetup: false });

    const firstPairs = await service.loadPairs('alpha', 'beta', { paths: ['/home'] });
    expect(firstPairs).toHaveLength(1);
    const firstResult = await service.comparePair(firstPairs[0]);
    const firstReport = await service.generateReport([firstResult], {
      outputDir: diffDir,
      referenceUrl: 'https://alpha-source.test/home',
      targetUrl: 'https://beta-target.test/home',
      title: 'Alpha vs Beta'
    });

    const secondPairs = await service.loadPairs('gamma', 'delta', { paths: ['/offers'] });
    expect(secondPairs).toHaveLength(1);
    const secondResult = await service.comparePair(secondPairs[0]);
    const secondReport = await service.generateReport([secondResult], {
      outputDir: diffDir,
      referenceUrl: 'https://gamma-travel.test/offers',
      targetUrl: 'https://delta-shop.test/offers',
      title: 'Gamma vs Delta'
    });

    expect(firstReport).not.toBe(secondReport);
    expect(await fs.pathExists(firstReport)).toBe(true);
    expect(await fs.pathExists(secondReport)).toBe(true);

    const reportFiles = (await fs.readdir(diffDir)).filter((file) => file.endsWith('.html'));
    expect(reportFiles).toHaveLength(2);
    const reportSet = new Set(reportFiles);
    expect(reportSet.size).toBe(2);
    expect(reportFiles.some((name) => name.includes('alpha-source-beta-target'))).toBe(true);
    expect(reportFiles.some((name) => name.includes('gamma-travel-delta-shop'))).toBe(true);
  });
});
