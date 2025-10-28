/* eslint-disable no-console */
const assert = require('node:assert/strict');
const { loadEnvironmentConfig, getAvailableComparisons, clearEnvironmentConfigCache } = require('../src/utils/environmentConfig');

const REQUIRED_VARS = {
  DEV_BASE_URL: 'https://dev.example.test',
  DEV_BASIC_AUTH_USER: 'dev-user',
  DEV_BASIC_AUTH_PASS: 'dev-pass',
  STAGING_BASE_URL: 'https://staging.example.test',
  STAGING_API_TOKEN: 'staging-token',
  PRODUCTION_BASE_URL: 'https://prod.example.test'
};

function setEnv(values) {
  Object.entries(values).forEach(([key, value]) => {
    process.env[key] = value;
  });
}

function restoreEnv(snapshot) {
  Object.entries(snapshot).forEach(([key, value]) => {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  });
}

function snapshotEnv(keys) {
  return keys.reduce((acc, key) => {
    acc[key] = process.env[key];
    return acc;
  }, {});
}

function validateAuthHandling(envConfig) {
  const sourceEnv = envConfig.environments.source;
  assert.ok(sourceEnv.auth, 'Expected auth credentials to be available on the source environment.');
  assert.equal(sourceEnv.auth.username, REQUIRED_VARS.DEV_BASIC_AUTH_USER, 'Auth username should resolve from environment variables.');
  assert.equal(sourceEnv.auth.password, REQUIRED_VARS.DEV_BASIC_AUTH_PASS, 'Auth password should resolve from environment variables.');

  const enumerableKeys = Object.keys(sourceEnv);
  assert.ok(!enumerableKeys.includes('auth'), 'Auth credentials should not be enumerable to avoid accidental logging.');

  const serialized = JSON.stringify(envConfig);
  assert.ok(!serialized.includes(REQUIRED_VARS.DEV_BASIC_AUTH_PASS), 'Serialized configuration should not leak sensitive credentials.');
}

function validateFallbacks(envConfig) {
  assert.ok(Array.isArray(envConfig.paths) && envConfig.paths.length > 0, 'Comparison paths should resolve using environment or default values.');
  assert.ok(envConfig.capture.fullPage, 'Capture fallback should default to fullPage=true.');
  assert.equal(envConfig.capture.device, 'desktop', 'Capture device should fall back to the configured default.');
  assert.ok(envConfig.threshold.maxChangeRatio > 0, 'Threshold fallback should provide a positive change ratio.');
}

function validateMetadata(envConfig) {
  const metadata = envConfig.metadata || {};
  assert.ok(metadata.comparisonKey, 'Metadata should contain the comparison key.');
  assert.ok(metadata.sanitizedEnvironments?.source, 'Metadata should include sanitized environment information.');
  assert.ok(Array.isArray(metadata.requiredSecrets), 'Metadata must track required secrets.');
}

function expectMissingVariableToError(variable) {
  const snapshot = snapshotEnv([variable]);
  delete process.env[variable];
  clearEnvironmentConfigCache();

  let threw = false;
  try {
    loadEnvironmentConfig({ comparisonKey: 'staging-vs-production' });
  } catch (error) {
    threw = true;
    assert.ok(error.message.includes(variable), `Error message should reference missing variable ${variable}.`);
  }

  restoreEnv(snapshot);
  clearEnvironmentConfigCache();
  assert.ok(threw, `Expected loading configuration to fail when ${variable} is missing.`);
}

function runValidationSuite() {
  const snapshot = snapshotEnv(Object.keys(REQUIRED_VARS));
  setEnv(REQUIRED_VARS);
  clearEnvironmentConfigCache();

  const comparisons = getAvailableComparisons();
  assert.ok(comparisons.length > 0, 'Expected at least one comparison to be defined.');
  assert.ok(comparisons.includes('dev-vs-staging'), 'dev-vs-staging comparison should be available.');

  const devVsStaging = loadEnvironmentConfig({ comparisonKey: 'dev-vs-staging' });
  assert.equal(devVsStaging.environments.source.baseUrl, REQUIRED_VARS.DEV_BASE_URL, 'Source base URL should resolve from environment variables.');
  assert.equal(devVsStaging.environments.target.baseUrl, REQUIRED_VARS.STAGING_BASE_URL, 'Target base URL should resolve from environment variables.');
  assert.equal(devVsStaging.threshold.maxChangeRatio, 0.1, 'Comparison-specific thresholds should override defaults.');
  assert.deepEqual(devVsStaging.paths, devVsStaging.environments.source.paths, 'Path token should reuse source environment paths.');

  validateAuthHandling(devVsStaging);
  validateFallbacks(devVsStaging);
  validateMetadata(devVsStaging);

  const stagingVsProduction = loadEnvironmentConfig({ comparisonKey: 'staging-vs-production' });
  assert.equal(stagingVsProduction.threshold.maxChangeRatio, 0.02, 'Strict thresholds should be applied for staging vs production.');
  assert.ok(stagingVsProduction.paths.includes('/checkout'), 'Explicit comparison path definitions should be respected.');

  expectMissingVariableToError('STAGING_BASE_URL');
  expectMissingVariableToError('PRODUCTION_BASE_URL');

  restoreEnv(snapshot);
  clearEnvironmentConfigCache();
}

try {
  console.log('Validating environment configuration...');
  runValidationSuite();
  console.log('Environment configuration validation complete!');
} catch (error) {
  console.error('Environment configuration validation failed:', error.message);
  process.exitCode = 1;
}
