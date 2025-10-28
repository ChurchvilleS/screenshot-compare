#!/usr/bin/env node
/* eslint-disable no-console */
const { spawnSync } = require('node:child_process');

const jestArgs = ['jest', '--runInBand'];
const runner = spawnSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', jestArgs, {
  encoding: 'utf8'
});

const output = `${runner.stdout || ''}${runner.stderr || ''}`;

if (runner.error) {
  console.error('Test execution failed:', runner.error.message);
  process.exitCode = 1;
  process.exit();
}

if (runner.status !== 0) {
  console.error(output);
  console.error(`Jest exited with status ${runner.status}`);
  process.exitCode = runner.status;
  process.exit();
}

if (output.includes('The module factory of `jest.mock()`')) {
  console.error('Mock factory scope warning detected.');
  process.exitCode = 1;
  process.exit();
}

console.log(output.trim());
console.log('✅ Jest mocks executed without scope warnings.');
