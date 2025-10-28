/* eslint-disable no-console */
const path = require('path');
const fs = require('fs-extra');
const { ComparisonService } = require('../src/services/comparison');
const { checkBrowsersInstalled } = require('../src/utils/browserSetup');

async function validateComparisonWorkflow() {
  console.log('Validating comparison workflow...');

  const browsers = checkBrowsersInstalled();
  if (!browsers.installed) {
    console.log('⚠ Playwright browsers are not installed. Run "npx playwright install" to enable comparison validation.');
    return;
  }

  if (process.env.ENABLE_COMPARISON_WORKFLOW !== 'true') {
    console.log('ℹ Skipping live comparison workflow validation (set ENABLE_COMPARISON_WORKFLOW=true to run).');
    return;
  }

  const outputRoot = path.resolve(__dirname, '..', 'screenshots', 'validation', 'comparison-workflow');
  const diffDir = path.join(outputRoot, 'diff');
  const reportDir = path.join(outputRoot, 'reports');
  await fs.ensureDir(outputRoot);

  const comparisonService = new ComparisonService({
    baseDir: outputRoot,
    diffDir,
    threshold: 0.2,
    significantThreshold: 0.05
  });

  try {
    const { results, reportPath } = await comparisonService.compareBatch({
      reference: { name: 'Example', slug: 'example', baseUrl: 'https://example.com' },
      target: { name: 'Wikipedia', slug: 'wikipedia', baseUrl: 'https://www.wikipedia.org' },
      paths: ['/', '/wiki'],
      viewports: [
        { width: 1280, height: 720, label: 'desktop' },
        { width: 414, height: 896, label: 'mobile' }
      ],
      capture: {
        label: 'workflow-validation',
        outputDir: outputRoot,
        fullPage: false,
        timeout: 25000,
        retries: 0
      },
      comparison: {
        threshold: 0.2,
        diffDir,
        mode: 'both',
        significantThreshold: 0.05,
        reportOutput: reportDir
      },
      report: {
        outputDir: reportDir,
        reportName: 'validation-report.html',
        title: 'Comparison Workflow Validation'
      }
    });

    console.log(`✅ Captured ${results.length} comparison result(s).`);

    if (!reportPath || !(await fs.pathExists(reportPath))) {
      console.log('❌ Expected HTML report was not generated.');
      process.exitCode = 1;
    } else {
      console.log(`✅ HTML report generated at: ${reportPath}`);
    }

    const significantCount = results.filter((result) => result.significant).length;
    if (significantCount > 0) {
      console.log(`✅ Threshold configuration flagged ${significantCount} significant change(s).`);
    } else {
      console.log('⚠ No significant changes detected; threshold verification inconclusive.');
    }

    const uniquePaths = new Set(results.map((result) => result.pathSlug));
    if (uniquePaths.size >= 2) {
      console.log('✅ Batch comparison processed multiple paths.');
    } else {
      console.log('❌ Batch comparison did not cover the expected number of paths.');
      process.exitCode = 1;
    }
  } catch (error) {
    console.error('❌ Comparison workflow validation failed:', error.message);
    process.exitCode = 1;
    return;
  }

  console.log('Comparison workflow validation complete.');
}

validateComparisonWorkflow().catch((error) => {
  console.error('Validation script encountered an unexpected error:', error);
  process.exitCode = 1;
});
