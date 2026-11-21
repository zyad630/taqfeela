'use strict';
const { spawnSync } = require('child_process');

process.env.ELECTRON_RUN_AS_NODE = '1';
process.env.TEST_RUNNER_NODE = 'D:/cafe-app-build/release/win-ia32-unpacked/TaqfeelaPOS.exe';

console.log('Running test suite with 32-bit (ia32) Electron 22 binary:', process.env.TEST_RUNNER_NODE);

const child = spawnSync('node', ['scripts/run_isolated_tests.js'], {
  env: process.env,
  stdio: 'inherit'
});

process.exit(child.status || 0);

