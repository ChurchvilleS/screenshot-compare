/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

function validateProjectSetup() {
  console.log('Validating project setup...');

  // Check package.json
  try {
    const packageJsonPath = path.resolve(process.cwd(), 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    console.log('✅ Package name:', packageJson.name);
    const dependencies = packageJson.dependencies || {};
    console.log('✅ Dependencies:', Object.keys(dependencies).join(', '));
  } catch (err) {
    console.error('❌ Error reading package.json:', err.message);
  }

  // Check directories
  const directories = ['src', 'src/utils', 'src/services', 'screenshots', 'tests', 'config'];
  directories.forEach((dir) => {
    const exists = fs.existsSync(dir);
    console.log(`${exists ? '✅' : '❌'} Directory ${dir} exists: ${exists}`);
  });

  // Check config file
  const configExists = fs.existsSync(path.join('config', 'default.json'));
  console.log(`${configExists ? '✅' : '❌'} Config file exists: ${configExists}`);

  // Check entry point
  const indexExists = fs.existsSync(path.join('src', 'index.js'));
  console.log(`${indexExists ? '✅' : '❌'} Entry point exists: ${indexExists}`);

  console.log('Validation complete!');
}

validateProjectSetup();
