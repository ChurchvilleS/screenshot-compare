#!/usr/bin/env node
/* eslint-disable no-console */
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('fs-extra');

const JEST_BIN = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const COVERAGE_SUMMARY_PATH = path.resolve(__dirname, '..', 'coverage', 'coverage-summary.json');
const MIN = 80;

function runJest() {
  const result = spawnSync(JEST_BIN, ['jest', '--coverage', '--runInBand'], {
    stdio: 'inherit'
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`Jest exited with status ${result.status}`);
  }
}

function loadCoverageSummary() {
  if (!fs.existsSync(COVERAGE_SUMMARY_PATH)) {
    throw new Error('Coverage summary not found. Ensure coverage reporters include json-summary.');
  }
  const summary = fs.readJsonSync(COVERAGE_SUMMARY_PATH);
  return summary.total;
}

function assertThresholds(total) {
  const fields = ['branches', 'functions', 'lines', 'statements'];
  const failures = fields.filter((field) => (total[field]?.pct || 0) < MIN);
  if (failures.length > 0) {
    throw new Error(`Coverage below ${MIN}% for: ${failures.join(', ')}`);
  }
}

function printSummary(total) {
  console.log('Test coverage summary:');
  console.log(`  Lines: ${total.lines.pct.toFixed(2)}%`);
  console.log(`  Statements: ${total.statements.pct.toFixed(2)}%`);
  console.log(`  Branches: ${total.branches.pct.toFixed(2)}%`);
  console.log(`  Functions: ${total.functions.pct.toFixed(2)}%`);
}

(async () => {
  try {
    runJest();
    const total = loadCoverageSummary();
    assertThresholds(total);
    printSummary(total);
    console.log('✅ Coverage requirements satisfied.');
  } catch (error) {
    console.error('❌ Test coverage validation failed:', error.message);
    process.exitCode = 1;
  }
})();
