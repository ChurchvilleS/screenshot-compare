const { defineConfig } = require('@playwright/test');

const defaultPort = Number(process.env.UI_PORT || 5173);
const command = `npm run ui:dev -- --host 127.0.0.1 --port ${defaultPort}`;

module.exports = defineConfig({
  testDir: './tests/playwright',
  timeout: 60000,
  expect: {
    timeout: 10000
  },
  forbidOnly: !!process.env.CI,
  use: {
    baseURL: process.env.UI_BASE_URL || `http://127.0.0.1:${defaultPort}`,
    headless: true
  },
  webServer: process.env.UI_SKIP_WEB_SERVER
    ? undefined
    : {
        command,
        port: defaultPort,
        reuseExistingServer: !process.env.CI,
        stdout: 'pipe',
        stderr: 'pipe'
      }
});
