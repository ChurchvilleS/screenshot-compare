const fs = require('fs-extra');
const path = require('path');
const { ScreenshotService } = require('../../../src/services/screenshot');
const { createTempDir } = require('../../setup');

jest.mock('../../../src/utils/configLoader', () => ({
  getConfig: jest.fn(() => ({
    outputDir: 'ignored',
    viewport: { width: 800, height: 600 },
    device: { name: 'desktop' }
  }))
}));

jest.mock('playwright', () => {
  const fsExtra = require('fs-extra');
  const pathLib = require('path');
  return {
    chromium: {
      launch: jest.fn(async () => ({
        newPage: jest.fn(async () => ({
          goto: jest.fn(async () => {}),
          screenshot: jest.fn(async ({ path: outputPath }) => {
            await fsExtra.ensureDir(pathLib.dirname(outputPath));
            await fsExtra.writeFile(outputPath, 'fake image');
          }),
          close: jest.fn(async () => {})
        })),
        close: jest.fn(async () => {})
      }))
    }
  };
});

describe('ScreenshotService', () => {
  it('captures screenshots and writes metadata', async () => {
    const baseDir = createTempDir('screenshot');
    const service = new ScreenshotService({ outputDir: baseDir, sessionId: 'test-session' });

    const metadata = await service.capture('https://example.test', '/pricing', {
      label: 'pricing',
      fullPage: true
    });

    expect(metadata.output.fileName).toContain('pricing');
    expect(await fs.pathExists(path.join(baseDir, metadata.output.relativePath))).toBe(true);

    await service.close();
  });

  it('throws when base URL is missing', async () => {
    const service = new ScreenshotService();
    await expect(service.capture('', '/')).rejects.toThrow('A baseUrl must be provided for screenshot capture.');
  });
});
