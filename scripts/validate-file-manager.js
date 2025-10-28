/* eslint-disable no-console */
const path = require('path');
const fs = require('fs-extra');
const fileManager = require(path.resolve(__dirname, '..', 'src', 'utils', 'file-manager'));

async function createFakeCapture(baseDir, options) {
  const artifact = await fileManager.prepareCapture({
    baseDir,
    environment: options.environment,
    pathSegment: options.pathSegment,
    url: options.url,
    viewport: options.viewport,
    device: options.device,
    label: options.label,
    sessionId: options.sessionId,
    timestamp: options.timestamp
  });

  await fs.ensureDir(path.dirname(artifact.filePath));
  await fs.writeFile(artifact.filePath, `fake image data for ${artifact.metadata.output.fileName}`);
  const stats = await fs.stat(artifact.filePath);
  const metadata = await fileManager.finalizeCapture(artifact, {
    fileSize: stats.size,
    capturedAt: options.timestamp.toISOString()
  });

  return metadata;
}

async function validateFileManager() {
  console.log('Validating file manager...');
  const baseDir = path.resolve(__dirname, '..', 'screenshots', 'file-manager-validation');
  await fs.remove(baseDir).catch(() => {});
  await fs.ensureDir(baseDir);

  const viewport = { width: 1280, height: 720 };
  const now = new Date();
  const older = new Date(now.getTime() - 60 * 60 * 1000);

  const captures = [];

  captures.push(
    await createFakeCapture(baseDir, {
      environment: { name: 'Staging', baseUrl: 'https://staging.example.com' },
      pathSegment: '/home',
      url: 'https://staging.example.com/home',
      viewport,
      device: 'desktop',
      label: 'smoke',
      sessionId: 'validation-session',
      timestamp: now
    })
  );

  captures.push(
    await createFakeCapture(baseDir, {
      environment: { name: 'Staging', baseUrl: 'https://staging.example.com' },
      pathSegment: '/pricing',
      url: 'https://staging.example.com/pricing',
      viewport,
      device: 'desktop',
      label: 'pricing',
      sessionId: 'validation-session',
      timestamp: older
    })
  );

  captures.push(
    await createFakeCapture(baseDir, {
      environment: { name: 'Production', baseUrl: 'https://example.com' },
      pathSegment: '/home',
      url: 'https://example.com/home',
      viewport,
      device: 'desktop',
      label: 'prod-home',
      sessionId: 'validation-session',
      timestamp: now
    })
  );

  console.log(`✅ Created ${captures.length} capture artifacts`);

  const records = await fileManager.listMetadata(baseDir);
  console.log(`✅ listMetadata returned ${records.length} record(s)`);

  const namingChecks = records.every((record) => {
    const fileName = record.output?.fileName || '';
    return (
      fileName.includes(record.environment.slug) &&
      fileName.includes(record.path.slug) &&
      fileName.includes(record.device.token) &&
      /\d{8}T\d{6}/.test(fileName)
    );
  });

  console.log(`${namingChecks ? '✅' : '❌'} File naming convention validation`);

  const grouped = await fileManager.getScreenshotsForComparison(baseDir);
  console.log(`✅ getScreenshotsForComparison discovered ${Object.keys(grouped).length} path group(s)`);

  const pruneResult = await fileManager.pruneOldScreenshots(baseDir, {
    maxPerEnvironment: 1,
    archiveDirName: '_archive_test'
  });

  console.log(`✅ pruneOldScreenshots archived ${pruneResult.archived.length} record(s)`);

  const archiveDir = path.join(baseDir, '_archive_test');
  const archiveExists = await fs.pathExists(archiveDir);
  console.log(`${archiveExists ? '✅' : '❌'} Archive directory created: ${archiveDir}`);

  console.log('File manager validation complete!');
}

validateFileManager().catch((error) => {
  console.error('File manager validation failed:', error);
  process.exitCode = 1;
});
