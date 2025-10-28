#!/usr/bin/env node
/**
 * validate-live-urls.js
 *
 * Purpose:
 * Runs a live comparison between two production websites (Mozilla and Wikipedia)
 * using the existing ComparisonService. Captures runtime metrics including timing,
 * memory usage, and storage growth to monitor Playwright session performance.
 *
 * Usage:
 *   npm run validate:live
 *
 * Notes:
 * - Ensure Playwright browsers are installed (`npm run setup`) before running.
 * - Results are written to the configured screenshots output directory.
 */

const path = require('path');
const fs = require('fs-extra');
const { performance } = require('perf_hooks');
const os = require('os');
const { ComparisonService } = require('../src/services/comparison');
const configLoader = require('../src/utils/configLoader');

async function getDirectorySize(dirPath) {
  let total = 0;

  const exists = await fs.pathExists(dirPath);
  if (!exists) {
    return 0;
  }

  const entries = await fs.readdir(dirPath);
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry);
    const stats = await fs.stat(fullPath);
    if (stats.isDirectory()) {
      total += await getDirectorySize(fullPath);
    } else {
      total += stats.size;
    }
  }

  return total;
}

function formatBytes(bytes) {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  if (bytes === 0) {
    return '0B';
  }
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / (1024 ** index);
  return `${value.toFixed(index === 0 ? 0 : 2)}${units[index]}`;
}

function formatDuration(ms) {
  if (ms < 1000) {
    return `${ms.toFixed(0)}ms`;
  }
  const seconds = ms / 1000;
  if (seconds < 60) {
    return `${seconds.toFixed(2)}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${minutes}m ${remaining.toFixed(1)}s`;
}

function logMemoryUsage(label, usage) {
  const formatted = Object.entries(usage)
    .map(([key, value]) => `${key}: ${formatBytes(value)}`)
    .join(', ');
  console.log(`${label}: ${formatted}`);
}

async function main() {
  console.log('Starting live URL comparison (Mozilla vs Wikipedia)...');
  const startTime = performance.now();
  const initialMemory = process.memoryUsage();

  const config = configLoader.getConfig();
  const outputDir = path.resolve(config.outputDir || 'screenshots');

  await fs.ensureDir(outputDir);
  const initialDiskUsage = await getDirectorySize(outputDir);

  const comparisonService = new ComparisonService({
    baseDir: outputDir,
    ensureSetup: true,
    normalizeStrategy: config.comparison?.normalizeStrategy || 'crop'
  });

  const reference = { name: 'Mozilla', baseUrl: 'https://www.mozilla.org' };
  const target = { name: 'Wikipedia', baseUrl: 'https://www.wikipedia.org' };
  const paths = ['/', '/foundation', '/privacy'];

  const captureOptions = {
    fullPage: true,
    waitUntil: 'networkidle',
    timeout: 45000
  };

  const comparisonOptions = {
    diffDir: config.comparison?.diffDir,
    threshold: config.comparison?.threshold,
    mode: 'both'
  };

  try {
    const result = await comparisonService.compareBatch({
      reference,
      target,
      paths,
      capture: captureOptions,
      comparison: comparisonOptions,
      report: {
        generate: true,
        title: `${reference.name} vs ${target.name} Live Comparison`
      }
    });

    const durationMs = performance.now() - startTime;
    const finalMemory = process.memoryUsage();
    const finalDiskUsage = await getDirectorySize(outputDir);

    console.log('\nLive comparison complete.');
    console.log(`Total duration: ${formatDuration(durationMs)}`);
    logMemoryUsage('Memory before run', initialMemory);
    logMemoryUsage('Memory after run', finalMemory);

    const memoryDelta = Object.keys(initialMemory).reduce((acc, key) => {
      acc[key] = finalMemory[key] - initialMemory[key];
      return acc;
    }, {});
    logMemoryUsage('Memory delta', memoryDelta);

    console.log(`Disk usage before run: ${formatBytes(initialDiskUsage)}`);
    console.log(`Disk usage after run: ${formatBytes(finalDiskUsage)}`);
    console.log(`Disk growth: ${formatBytes(finalDiskUsage - initialDiskUsage)}`);

    const totalResults = result.results.length;
    console.log(`Captured comparisons: ${totalResults}`);
    if (totalResults > 0) {
      result.results.forEach((entry) => {
        const changePercent = (entry.changeRatio * 100).toFixed(2);
        console.log(`- ${entry.pathSlug}: ${changePercent}% change, normalization: ${entry.normalization?.strategy || 'none'}`);
      });
    }

    if (result.reportPath) {
      console.log(`Report generated at: ${result.reportPath}`);
    }
  } catch (error) {
    console.error('Live validation failed:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exitCode = 1;
  }
}

main();
