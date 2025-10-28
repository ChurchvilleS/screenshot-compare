const path = require('path');
const fs = require('fs');
const configLoader = require('../../../src/utils/configLoader');

const CONFIG_DIR = path.resolve(__dirname, '../../../config');
const ORIGINAL_ENV = process.env.NODE_ENV;

function withTempConfigFile(name, contents, fn) {
  const filePath = path.join(CONFIG_DIR, name);
  fs.writeFileSync(filePath, JSON.stringify(contents, null, 2));
  try {
    fn();
  } finally {
    fs.unlinkSync(filePath);
  }
}

describe('configLoader', () => {
  afterEach(() => {
    process.env.NODE_ENV = ORIGINAL_ENV;
    configLoader.reloadConfig();
  });

  it('loads default configuration when no environment overrides are present', () => {
    process.env.NODE_ENV = 'test';
    const config = configLoader.getConfig({ reload: true });
    expect(config.app).toBeDefined();
    expect(config.environment).toBe('test');
  });

  it('applies environment overrides when file exists', () => {
    withTempConfigFile('test.json', { app: { name: 'TestApp' } }, () => {
      process.env.NODE_ENV = 'test';
      const config = configLoader.getConfig({ reload: true });
      expect(config.app.name).toBe('TestApp');
    });
  });

  it('throws when required properties are missing', () => {
    const badConfig = {
      app: { name: '' },
      outputDir: null,
      viewport: { width: null },
      environments: []
    };
    withTempConfigFile('test.json', badConfig, () => {
      process.env.NODE_ENV = 'test';
      expect(() => configLoader.getConfig({ reload: true })).toThrow('Missing required configuration properties');
    });
  });
});
