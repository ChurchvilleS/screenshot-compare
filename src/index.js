#!/usr/bin/env node
const { runCli } = require('./cli');

async function main() {
  try {
    await runCli(process.argv);
  } catch (error) {
    const message = error?.message || String(error);
    console.error(`Error: ${message}`);
    if (process.env.DEBUG === 'true' && error?.stack) {
      console.error(error.stack);
    }
    process.exitCode = 1;
  }
}

main();
