#!/usr/bin/env node
/* eslint-disable no-console */
const { spawnSync } = require('node:child_process');
const { joinUrlAndPath } = require('../src/utils/urlBuilder');

function runJest() {
  const args = ['jest', 'tests/unit/utils/configLoader.test.js', 'tests/unit/utils/urlBuilder.test.js'];
  const result = spawnSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', args, {
    stdio: 'inherit'
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`Jest exited with status ${result.status}`);
  }
}

function verifyUrlBehaviour() {
  const actual = joinUrlAndPath('https://example.com/', '/');
  const expected = 'https://example.com/';
  if (actual !== expected) {
    throw new Error(`URL handling mismatch. Expected ${expected} but received ${actual}.`);
  }
}

(async () => {
  try {
    runJest();
    verifyUrlBehaviour();
    console.log('✅ Expectation validation succeeded.');
  } catch (error) {
    console.error('❌ Expectation validation failed:', error.message);
    process.exitCode = 1;
  }
})();
