const path = require('path');
const fs = require('fs-extra');
const { createTempDir } = require('../../setup');

const {
  findMostRecentReport,
  DEFAULT_REPORT_PATTERN
} = require('../../../scripts/validate-comparison');

describe('validate-comparison report discovery', () => {
  it('returns the most recent matching report file', async () => {
    const tempDir = createTempDir('report-discovery');
    const olderReport = path.join(tempDir, 'comparison-report_reference-target_10-27-25_14-22pm.html');
    const newerReport = path.join(tempDir, 'comparison-report_reference-target_10-27-25_18-45pm.html');
    const unrelated = path.join(tempDir, 'notes.txt');

    await fs.ensureDir(tempDir);
    await fs.writeFile(olderReport, '<html>old</html>', 'utf8');
    await fs.writeFile(newerReport, '<html>new</html>', 'utf8');
    await fs.writeFile(unrelated, 'ignore me', 'utf8');

    const olderTime = new Date('2025-10-27T14:22:00Z');
    const newerTime = new Date('2025-10-27T18:45:00Z');
    await fs.utimes(olderReport, olderTime, olderTime);
    await fs.utimes(newerReport, newerTime, newerTime);

    const discovered = await findMostRecentReport(tempDir, DEFAULT_REPORT_PATTERN);
    expect(discovered).toBe(path.resolve(newerReport));
  });

  it('supports custom patterns such as CLI reports', async () => {
    const tempDir = createTempDir('cli-report-discovery');
    const cliOld = path.join(tempDir, 'cli-report_example_10-27-25_13-00pm.html');
    const cliNew = path.join(tempDir, 'cli-report_example_10-27-25_14-30pm.html');

    await fs.ensureDir(tempDir);
    await fs.writeFile(cliOld, '<html>old cli</html>', 'utf8');
    await fs.writeFile(cliNew, '<html>new cli</html>', 'utf8');

    const cliOldTime = new Date('2025-10-27T13:00:00Z');
    const cliNewTime = new Date('2025-10-27T14:30:00Z');
    await fs.utimes(cliOld, cliOldTime, cliOldTime);
    await fs.utimes(cliNew, cliNewTime, cliNewTime);

    const discovered = await findMostRecentReport(tempDir, 'cli-report*.html');
    expect(discovered).toBe(path.resolve(cliNew));
  });

  it('falls back to the legacy filename when no dynamic reports exist', async () => {
    const tempDir = createTempDir('legacy-report-fallback');
    const legacyReport = path.join(tempDir, 'comparison-report.html');

    await fs.ensureDir(tempDir);
    await fs.writeFile(legacyReport, '<html>legacy</html>', 'utf8');

    const result = await findMostRecentReport(tempDir, 'comparison-report_*');
    const fallback = result || path.join(tempDir, 'comparison-report.html');

    expect(result).toBeNull();
    expect(fallback).toBe(path.join(tempDir, 'comparison-report.html'));
  });
});
