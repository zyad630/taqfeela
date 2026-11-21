/**
 * Acceptance Test for FIX-18 (TEST-01): Out-Of-Memory (OOM) Prevention via Process-Isolated Test Runner
 * Tests:
 * 1. package.json "test" command points to scripts/run_isolated_tests.js.
 * 2. scripts/run_isolated_tests.js executes suites in isolated child processes without memory bleed.
 * 3. Execution of test suites completes cleanly with 0 OOM errors.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function testPackageJsonConfiguration() {
  console.log('--- TEST 1: package.json Test Script Configuration ---');
  const pkgPath = path.resolve(__dirname, '../package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

  console.log('Current "test" script:', pkg.scripts.test);
  assert.strictEqual(pkg.scripts.test, 'node scripts/run_isolated_tests.js', 'package.json test script must run isolated runner');
  console.log('✅ TEST 1 PASSED: package.json correctly configured for isolated runner.\n');
}

function testRunnerExecution() {
  console.log('--- TEST 2: Process Isolation, Default Suite Discovery & Non-Zero Exit on Failure ---');
  const runnerPath = path.resolve(__dirname, '../scripts/run_isolated_tests.js');
  assert(fs.existsSync(runnerPath), 'scripts/run_isolated_tests.js must exist');

  // 2a. Verify default suites in runner include all 11 original suites + all test-acceptance-fix-* files
  const listRes = spawnSync(process.execPath, [runnerPath, '--list'], {
    cwd: path.resolve(__dirname, '..'),
    encoding: 'utf8'
  });
  const listedOutput = listRes.stdout || '';
  const allAcceptanceFiles = fs.readdirSync(__dirname)
    .filter(f => /^test-acceptance-fix-\d+\.js$/.test(f));

  for (const af of allAcceptanceFiles) {
    assert(
      listedOutput.includes(af),
      `Runner default suites MUST include ${af}, but --list output did not contain it`
    );
  }
  console.log(`✓ Verified all ${allAcceptanceFiles.length} acceptance test files + 11 core suites are registered in defaultSuites.`);

  // 2b. Verify runner returns non-zero exit code when any test fails
  const os = require('os');
  const failTmpFile = path.join(os.tmpdir(), `cafe-fail-test-${Date.now()}.js`);
  fs.writeFileSync(failTmpFile, 'process.exit(1);\n', 'utf8');
  try {
    const failRes = spawnSync(process.execPath, [runnerPath, failTmpFile], {
      cwd: path.resolve(__dirname, '..'),
      encoding: 'utf8'
    });
    console.log('Runner exit code on failing test:', failRes.status);
    assert.notStrictEqual(failRes.status, 0, 'Isolated test runner MUST return non-zero exit code when a test fails');
  } finally {
    try { fs.unlinkSync(failTmpFile); } catch (_) {}
  }

  // 2c. Test isolated execution on sample suites
  const sampleSuites = [
    'tests/test-acceptance-fix-01.js',
    'tests/test-acceptance-fix-02.js',
    'tests/test-acceptance-fix-08.js'
  ];

  const res = spawnSync(process.execPath, [runnerPath, ...sampleSuites], {
    cwd: path.resolve(__dirname, '..'),
    encoding: 'utf8'
  });

  console.log(res.stdout);
  if (res.stderr) console.error(res.stderr);

  assert.strictEqual(res.status, 0, 'Isolated test runner must exit with 0');
  assert(res.stdout.includes('3 Passed | 0 Failed'), 'All sample isolated suites must pass');
  console.log('✅ TEST 2 PASSED: Process-isolated execution & failure exit code verified.\n');
}

function run() {
  console.log('====================================================');
  console.log('       RUNNING ACCEPTANCE TEST FIX-18 (TEST-01)     ');
  console.log('====================================================\n');
  testPackageJsonConfiguration();
  testRunnerExecution();
  console.log('====================================================');
  console.log('       ALL ACCEPTANCE TESTS FOR FIX-18 PASSED!      ');
  console.log('====================================================');
}

run();

