/* eslint-disable no-console */
const path = require('path');

// Ensure we load from project root when executed via npm scripts.
const configLoader = require(path.resolve(__dirname, '..', 'src', 'utils', 'configLoader'));

function validateConfigLoader() {
  console.log('Validating configuration loader...');

  try {
    // Load the configuration
    const config = configLoader.getConfig();
    console.log('✅ Configuration loaded successfully');

    // Display available configuration sections
    console.log('Configuration sections:', Object.keys(config));

    // Test getting specific values
    if (config.app && config.app.name) {
      console.log('✅ App name:', config.app.name);
    } else {
      console.log('❌ Missing app.name in configuration');
    }

    // Test environment awareness
    console.log('Current environment:', configLoader.getEnvironment());

    // Test validation function if implemented
    if (typeof configLoader.validateConfig === 'function') {
      try {
        configLoader.validateConfig(config);
        console.log('✅ Configuration validation passed');
      } catch (err) {
        console.log('❌ Configuration validation failed:', err.message);
      }
    }
  } catch (err) {
    console.error('❌ Error loading configuration:', err.message);
  }

  console.log('Validation complete!');
}

validateConfigLoader();
