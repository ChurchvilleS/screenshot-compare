/* eslint-disable no-console */
const path = require('path');
const { spawnSync } = require('child_process');
const { checkBrowsersInstalled } = require(path.resolve(__dirname, '..', 'src', 'utils', 'browserSetup'));

const CLI_ENTRY = path.resolve(__dirname, '..', 'src', 'index.js');

function runCli(args, options = {}) {
  return spawnSync(process.execPath, [CLI_ENTRY, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options
  });
}

function logResult(label, result, expectedStatus = 0) {
  const statusMatches = result.status === expectedStatus;
  const output = result.stdout || result.stderr || '';
  console.log(`${statusMatches ? '✅' : '❌'} ${label} (exit ${result.status})`);
  if (!statusMatches) {
    console.log('   Output:', output.trim());
  }
}

function printOutput(label, result) {
  const output = result.stdout || result.stderr;
  if (output) {
    console.log(`--- ${label} output ---`);
    console.log(output.trim());
  }
}

function validateCli() {
  console.log('Validating CLI interface...');
  const browserStatus = checkBrowsersInstalled();
  if (browserStatus.installed) {
    console.log('✅ Playwright browser executable detected at:', browserStatus.executable);
  } else {
    console.log('⚠ Playwright browsers missing:', browserStatus.message || 'Unknown reason.');
    console.log('   Capture scenarios will be skipped. Run "npx playwright install" to enable them.');
  }

  const setupCheck = runCli(['setup', '--check']);
  logResult('Setup --check command', setupCheck);
  printOutput('setup --check', setupCheck);

  const missingTarget = runCli(['capture', 'https://example.com']);
  logResult('Capture with missing target URL', missingTarget, 1);

  const invalidSource = runCli(['capture', 'not-a-url', 'https://example.com']);
  logResult('Capture with invalid source URL', invalidSource, 1);
  printOutput('invalid source URL', invalidSource);

  const invalidTarget = runCli(['capture', 'https://example.com', 'not-a-url']);
  logResult('Capture with invalid target URL', invalidTarget, 1);

  if (browserStatus.installed && process.env.ENABLE_CAPTURE_VALIDATION === 'true') {
    const capture = runCli([
      'capture',
      'https://example.com',
      'https://www.wikipedia.org',
      '--paths',
      '/',
      '/wiki'
    ]);
    logResult('Capture command execution', capture, 0);
    printOutput('capture', capture);
  } else if (browserStatus.installed) {
    console.log('ℹ Skipping capture smoke test (set ENABLE_CAPTURE_VALIDATION=true to run).');
  }

  console.log('CLI validation complete!');
}

validateCli();
