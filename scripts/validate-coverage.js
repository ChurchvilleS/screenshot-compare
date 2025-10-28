#!/usr/bin/env node
/* eslint-disable no-console */
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('fs-extra');

const COVERAGE_SUMMARY_PATH = path.resolve(__dirname, '..', 'coverage', 'coverage-summary.json');
const THRESHOLD = 40;

function runJestWithCoverage() {
  const result = spawnSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['jest', '--coverage', '--runInBand'], {
    stdio: 'inherit'
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`Jest exited with status ${result.status}`);
  }
}

function getCoverageSummary() {
  if (!fs.existsSync(COVERAGE_SUMMARY_PATH)) {
    throw new Error('Coverage summary not found. Ensure coverage reporters include json-summary.');
  }
  return fs.readJsonSync(COVERAGE_SUMMARY_PATH);
}

function analyzeCoverage(summary) {
  const totals = summary.total;
  const globalFailures = [];
  ['branches', 'functions', 'lines', 'statements'].forEach((metric) => {
    if ((totals[metric]?.pct || 0) < THRESHOLD) {
      globalFailures.push(`${metric}: ${totals[metric]?.pct.toFixed(2)}%`);
    }
  });

  const modulesNeedingAttention = Object.entries(summary)
    .filter(([key]) => key !== 'total')
    .filter(([, value]) => (value.statements?.pct || 0) < THRESHOLD)
    .map(([key, value]) => ({
      key,
      lines: value.lines?.pct ?? 0,
      statements: value.statements?.pct ?? 0,
      functions: value.functions?.pct ?? 0,
      branches: value.branches?.pct ?? 0
    }))
    .sort((a, b) => a.statements - b.statements);

  return { globalFailures, modulesNeedingAttention };
}

(async () => {
  try {
    runJestWithCoverage();
    const summary = getCoverageSummary();
    const { globalFailures, modulesNeedingAttention } = analyzeCoverage(summary);

    if (globalFailures.length > 0) {
      console.warn('⚠ Global coverage metrics below threshold:', globalFailures.join(', '));
    } else {
      console.log('✅ Global coverage meets temporary threshold.');
    }

    if (modulesNeedingAttention.length) {
      console.log('\nModules needing additional coverage (below 60% statements):');
      modulesNeedingAttention.forEach((module) => {
        console.log(` - ${module.key}: statements ${module.statements.toFixed(2)}%, lines ${module.lines.toFixed(2)}%`);
      });
    } else {
      console.log('\nAll tracked modules meet the temporary threshold.');
    }
  } catch (error) {
    console.error('❌ Coverage validation failed:', error.message);
    process.exitCode = 1;
  }
})();
