const path = require('path');
const fs = require('fs-extra');
const fileManager = require('../../../src/utils/file-manager');
const { createTempDir } = require('../../setup');

describe('file-manager utilities', () => {
  it('prepares and finalizes capture metadata', async () => {
    const baseDir = createTempDir('file-manager');
    const artifact = await fileManager.prepareCapture({
      baseDir,
      environment: { name: 'TestEnv', baseUrl: 'https://example.test' },
      pathSegment: '/pricing'
    });

    expect(await fs.pathExists(artifact.metadataPath)).toBe(false);

    await fs.writeFile(artifact.filePath, 'fake image');
    const metadata = await fileManager.finalizeCapture(artifact, { fileSize: 10, notes: 'OK' });

    expect(metadata.output.fileName).toMatch(/pricing/);
    expect(metadata.fileSize).toBe(10);
    expect(metadata.notes).toBe('OK');
  });

  it('lists metadata grouped by environment', async () => {
    const baseDir = createTempDir('file-manager');
    const env = { name: 'Env1', baseUrl: 'https://example.test' };

    const artifact = await fileManager.prepareCapture({ baseDir, environment: env, pathSegment: '/home' });
    await fs.writeFile(artifact.filePath, 'fake');
    await fileManager.finalizeCapture(artifact);

    const metadataList = await fileManager.listMetadata(baseDir);
    expect(metadataList).toHaveLength(1);
    expect(metadataList[0].environment.name).toBe('Env1');

    const grouped = fileManager.groupByEnvironment(metadataList);
    expect(grouped.env1).toHaveLength(1);
  });
});
