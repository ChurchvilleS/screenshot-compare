/* eslint-disable no-console */
const fs = require('fs-extra');
const path = require('path');
const { ScreenshotService } = require('../src/services/screenshot');
const { checkBrowsersInstalled } = require('../src/utils/browserSetup');

async function validateScreenshotService() {
  console.log('Validating screenshot service...');

  const browserStatus = checkBrowsersInstalled();
  if (!browserStatus.installed) {
    console.log('⚠ Playwright browsers are not installed. Run "npx playwright install" before executing capture scenarios.');
    return;
  }

  if (process.env.ENABLE_CAPTURE_VALIDATION !== 'true') {
    console.log('ℹ Skipping live capture validation (set ENABLE_CAPTURE_VALIDATION=true to exercise browser flows).');
    return;
  }

  const outputDir = path.resolve(__dirname, '..', 'screenshots', 'validation');
  const service = new ScreenshotService({ outputDir, retries: 1, retryDelay: 200 });

  const totalChecks = 3;
  let passed = 0;
  let failures = 0;

  try {
    const viewportResults = await service.captureWithViewports('https://example.com', '/', {
      label: 'validation-multi',
      environment: { name: 'example', baseUrl: 'https://example.com' },
      viewports: [
        { width: 1280, height: 720, label: 'desktop' },
        { width: 414, height: 896, label: 'mobile' }
      ],
      retries: 1,
      retryDelay: 200
    });

    const viewportFilesExist = viewportResults.length === 2 && viewportResults.every((metadata) => fs.existsSync(metadata.absolutePath));
    if (viewportFilesExist) {
      passed += 1;
      console.log(`✅ Multi-viewport capture produced ${viewportResults.length} screenshot(s).`);
      viewportResults.forEach((metadata) => {
        const deviceToken = metadata?.device?.token || 'unknown-device';
        console.log(`   - ${deviceToken}: ${metadata.output?.relativePath}`);
      });
    } else {
      console.log('❌ Multi-viewport capture did not produce the expected artifacts.');
      failures += 1;
    }

    const comparison = await service.captureAndCompare({
      reference: { name: 'example', baseUrl: 'https://example.com' },
      target: { name: 'wikipedia', baseUrl: 'https://www.wikipedia.org' },
      pathSegment: '/',
      viewports: [
        { width: 1024, height: 768, label: 'desktop' }
      ],
      captureOptions: {
        label: 'validation-compare',
        fullPage: false,
        retries: 0
      },
      comparison: {
        generateReport: false,
        threshold: 0.1
      }
    });

    if (comparison.comparisonResults.length > 0) {
      passed += 1;
      console.log(`✅ Comparison completed for ${comparison.comparisonResults.length} pair(s).`);
    } else {
      console.log('❌ Comparison did not produce any results.');
      failures += 1;
    }

    try {
      await service.capture('http://127.0.0.1:65535', '/', {
        label: 'expected-failure',
        timeout: 1000,
        retries: 0
      });
      console.log('❌ Expected capture failure did not occur.');
      failures += 1;
    } catch (error) {
      passed += 1;
      console.log(`✅ Error handling verified (unreachable host): ${error.message}`);
    }

    const completed = passed;
    console.log(`\nPassed ${completed} of ${totalChecks} live validations.`);
    if (failures > 0) {
      process.exitCode = 1;
    }
  } catch (error) {
    console.error('❌ Screenshot service validation failed:', error.message);
    process.exitCode = 1;
  } finally {
    await service.close().catch(() => {});
  }

  console.log('Screenshot service validation complete.');
}

validateScreenshotService().catch((error) => {
  console.error('Validation script encountered an unexpected error:', error);
  process.exitCode = 1;
});
