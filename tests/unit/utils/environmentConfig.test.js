const { loadEnvironmentConfig, clearEnvironmentConfigCache } = require('../../../src/utils/environmentConfig');

describe('environmentConfig loader', () => {
  const snapshot = { ...process.env };

  beforeEach(() => {
    process.env.DEV_BASE_URL = 'https://dev.example.test';
    process.env.DEV_BASIC_AUTH_USER = 'dev-user';
    process.env.DEV_BASIC_AUTH_PASS = 'dev-pass';
    process.env.STAGING_BASE_URL = 'https://staging.example.test';
    process.env.STAGING_API_TOKEN = 'token';
    process.env.PRODUCTION_BASE_URL = 'https://prod.example.test';
    clearEnvironmentConfigCache();
  });

  afterAll(() => {
    Object.keys(process.env).forEach((key) => {
      delete process.env[key];
    });
    Object.assign(process.env, snapshot);
    clearEnvironmentConfigCache();
  });

  it('loads comparison config and resolves environment URLs', () => {
    const result = loadEnvironmentConfig({ comparisonKey: 'dev-vs-staging' });
    expect(result.environments.source.baseUrl).toBe('https://dev.example.test');
    expect(result.environments.target.baseUrl).toBe('https://staging.example.test');
    expect(result.threshold.maxChangeRatio).toBeCloseTo(0.1);
  });

  it('throws when comparison key is unknown', () => {
    expect(() => loadEnvironmentConfig({ comparisonKey: 'unknown' })).toThrow('Comparison "unknown"');
  });
});
