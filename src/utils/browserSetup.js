/**
 * Utilities for managing Playwright browser installations.
 */
const fs = require('fs');
const { spawn } = require('child_process');
const { chromium } = require('playwright');

/**
 * Determine whether Playwright browsers are installed and available.
 * @returns {{ installed: boolean, executable?: string, message?: string }}
 */
function checkBrowsersInstalled() {
  try {
    const executablePath = chromium.executablePath();
    if (!executablePath || !fs.existsSync(executablePath)) {
      return {
        installed: false,
        message: 'Playwright browsers are not installed. Execute "npx playwright install".'
      };
    }
    return { installed: true, executable: executablePath };
  } catch (error) {
    return {
      installed: false,
      message: error?.message || 'Unknown error determining Playwright browser installation.'
    };
  }
}

/**
 * Run the Playwright install command to download browser binaries.
 * @param {{ force?: boolean }} [options]
 * @returns {Promise<void>}
 */
function installBrowsers(options = {}) {
  const args = ['playwright', 'install'];
  if (options.force) {
    args.push('--force');
  }

  return new Promise((resolve, reject) => {
    const child = spawn('npx', args, {
      stdio: 'inherit',
      shell: true
    });

    child.on('error', (error) => reject(error));
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`"npx playwright install" exited with code ${code}`));
      }
    });
  });
}

/**
 * Ensure browsers are installed, optionally forcing reinstallation.
 * @param {{ force?: boolean }} [options]
 * @returns {Promise<{ installed: boolean, executable?: string, message?: string }>}
 */
async function ensureBrowsersInstalled(options = {}) {
  const status = checkBrowsersInstalled();
  if (status.installed && !options.force) {
    return status;
  }

  await installBrowsers({ force: options.force });
  return checkBrowsersInstalled();
}

module.exports = {
  checkBrowsersInstalled,
  ensureBrowsersInstalled,
  installBrowsers
};
