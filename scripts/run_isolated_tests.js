/**
 * Isolated Test Runner (FIX-18 / TEST-01)
 * Runs each test suite in an independent Node.js process to prevent WebAssembly / sql.js V8 Heap OOM exhaustion.
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

let fullLogBuffer = '';
const origStdoutWrite = process.stdout.write.bind(process.stdout);
const origStderrWrite = process.stderr.write.bind(process.stderr);
process.stdout.write = (chunk, ...args) => {
  fullLogBuffer += chunk;
  return origStdoutWrite(chunk, ...args);
};
process.stderr.write = (chunk, ...args) => {
  fullLogBuffer += chunk;
  return origStderrWrite(chunk, ...args);
};

// Ensure isolated child processes use high-capacity drive D: for TEMP if available
const safeTemp = fs.existsSync('D:\\cafe-temp') ? 'D:\\cafe-temp' : (fs.existsSync('D:\\') ? 'D:\\cafe-temp' : null);
if (safeTemp) {
  try { if (!fs.existsSync(safeTemp)) fs.mkdirSync(safeTemp, { recursive: true }); } catch (_) {}
  process.env.TEMP = safeTemp;
  process.env.TMP = safeTemp;
}

const rootDir = path.resolve(__dirname, '..');
const testsDir = path.join(rootDir, 'tests');

const coreSuites = [
  'tests/production-hardening.test.js',
  'tests/commercial-features.test.js',
  'tests/shift-handover.test.js',
  'tests/bar-printer-and-menu.test.js',
  'tests/power-cut-and-admin-recovery.test.js',
  'tests/addendum2-and-overlay.test.js',
  'tests/anti-tamper-security.test.js',
  'tests/table-qr-server.test.js',
  'tests/test-plan-audit-fixes.test.js',
  'tests/table-qr-management.test.js',
  'tests/p0-p1-critical-fixes.test.js'
];

const acceptanceSuites = fs.existsSync(testsDir)
  ? fs.readdirSync(testsDir)
    .filter((f) => /^test-acceptance-fix-\d+\.js$/.test(f))
    .sort()
    .map((f) => `tests/${f}`)
  : [];

const round2Suites = [
  'tests/test-ipc-cashier-escalation.js',
  'tests/test-electron-security-hardening.js',
  'tests/test-passwords-and-pin-security.js',
  'tests/test-item4-integrity-and-single-instance.js',
  'tests/test-item5-orders-limit-and-summary.js',
  'tests/test-item6-save-overhead-and-carts.js',
  'tests/test-item7-crash-resilience-200.js',
  'tests/test-item8-mock-clock-14days-and-dates.js',
  'tests/test-item9-expanded-invariants.js',
  'tests/test-item9-heavy-simulation-and-dst.js',
  'tests/test-item10-explain-query-plan-indexes.js',
  'tests/test-item10-maintenance-and-pin-persistence.js',
  'tests/test-item11-upgrade-genuine-v101.js',
  'tests/test-item12-packaging-offline-uninstaller.js',
  'tests/test-prereqs-and-selftest.js',
  'tests/test-item2-upgrade-datapath-migration.js',
  'tests/test-all-mutations-isdirty.js',
  'tests/test-item5-playwright-roles-lifecycle.js',
  'tests/test-table-concurrency.js',
  'tests/test-payroll-math.js',
  'tests/test-ui-tabs-resilience.js',
  'tests/test-query-scale-safety.js',
  'tests/test-upgrade-v101.js',
  'tests/test-item11-complete-upgrade-matrix.js',
  'tests/test-item11-50mb-upgrade.js',
  'tests/test-machineid-cross-arch.js',
  'tests/test-item1-real-customer-datapath-flow.js',
  'tests/test-item5-missing-upgrade-scenarios.js',
  'tests/test-item6-graceful-installer-shutdown.js',
  'tests/test-item7-migration-package-channels.js',
  'tests/test-mobile-hub-api.js',
  'tests/test-cloud-isolation.js',
  'tests/test-phase3-signed-manifest-and-longevity.js',
  'tests/test-phase4-vendor-gate-and-worldwide.js',
  'tests/test-takeaway-and-transfer-fixes.js',
  'tests/test-deep-internal-audit-fixes.js',
  'tests/test-full-cafe-integration-stress.js',
  'scripts/verify-anonymization.js',
  'scripts/verify-upgrade.js'
].filter(f => fs.existsSync(path.join(rootDir, f)));

const scenarioDir = path.join(testsDir, 'scenarios');
const scenarioSuites = fs.existsSync(scenarioDir)
  ? fs.readdirSync(scenarioDir)
      .filter((f) => f.endsWith('.js'))
      .sort()
      .map((f) => `tests/scenarios/${f}`)
  : [];

const defaultSuites = [...coreSuites, ...acceptanceSuites, ...round2Suites, ...scenarioSuites];

const args = process.argv.slice(2);
if (args.includes('--list')) {
  console.log(defaultSuites.join('\n'));
  process.exit(0);
}

const targetSuites = args.length > 0 ? args : defaultSuites;

console.log('====================================================');
console.log(` Running ${targetSuites.length} Test Suites in Process-Isolated Mode `);
console.log('====================================================\n');

let passedCount = 0;
let failedCount = 0;
let totalSubtests = 0;
let passedSubtests = 0;
let failedSubtests = 0;
const failures = [];

const startTime = Date.now();

function extractTestCounts(output, exitZero) {
  const combined = String(output || '');
  const testsMatch = combined.match(/(?:ℹ|#)\s+tests\s+(\d+)/i);
  const passMatch = combined.match(/(?:ℹ|#)\s+pass\s+(\d+)/i);
  const failMatch = combined.match(/(?:ℹ|#)\s+fail\s+(\d+)/i);
  if (testsMatch) {
    const t = Number(testsMatch[1]) || 1;
    const p = passMatch ? Number(passMatch[1]) : (exitZero ? t : 0);
    const f = failMatch ? Number(failMatch[1]) : (exitZero ? 0 : 1);
    return { tests: t, pass: p, fail: f };
  }
  return { tests: 1, pass: exitZero ? 1 : 0, fail: exitZero ? 0 : 1 };
}

function runSuiteAsync(suite) {
  return new Promise((resolve) => {
    const suiteName = path.basename(suite);
    const t0 = Date.now();
    const isNodeTest = suiteName.endsWith('.test.js');
    const nodeArgs = isNodeTest ? ['--test', suite] : [suite];
    const execBinary = process.env.TEST_RUNNER_NODE || process.execPath;
    const child = spawn(execBinary, nodeArgs, {
      cwd: rootDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });

    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { child.kill('SIGKILL'); } catch (_) {}
      const elapsed = ((Date.now() - t0) / 1000).toFixed(2);
      resolve({ suite, suiteName, status: 1, stdout, stderr: stderr + '\nSuite timeout exceeded (240s)', elapsed });
    }, 240000);

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const elapsed = ((Date.now() - t0) / 1000).toFixed(2);
      resolve({ suite, suiteName, status: code, stdout, stderr, elapsed });
    });
    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const elapsed = ((Date.now() - t0) / 1000).toFixed(2);
      resolve({ suite, suiteName, status: 1, stdout, stderr: stderr + '\n' + err.message, elapsed });
    });
  });
}

async function main() {
  const isPlaywrightSuite = (s) => /test-acceptance-fix-0[4-9]\.js|test-acceptance-fix-18\.js|test-electron-security-hardening|test-ipc-|test-passwords-and-pin|test-item5-playwright|test-50mb/.test(s);
  const results = new Array(targetSuites.length);
  let nextIdx = 0;
  let printIdx = 0;

  function flushPrinted() {
    while (printIdx < targetSuites.length && results[printIdx]) {
      const r = results[printIdx];
      const counts = extractTestCounts((r.stdout || '') + '\n' + (r.stderr || ''), r.status === 0);
      totalSubtests += counts.tests;
      passedSubtests += counts.pass;
      failedSubtests += counts.fail;

      if (r.status === 0) {
        console.log(`[${printIdx + 1}/${targetSuites.length}] Running ${r.suiteName}... ✓ PASS (${counts.pass}/${counts.tests} tests, ${r.elapsed}s)`);
        passedCount++;
      } else {
        console.log(`[${printIdx + 1}/${targetSuites.length}] Running ${r.suiteName}... ❌ FAIL (${r.elapsed}s)`);
        failedCount++;
        failures.push({ suite: r.suite, error: r.stderr || r.stdout });
      }
      printIdx++;
    }
  }

  let pwLock = Promise.resolve();
  function runWithPwLock(fn) {
    const res = pwLock.then(fn, fn);
    pwLock = res.catch(() => {});
    return res;
  }

  const CONCURRENCY = 2;

  async function worker() {
    while (true) {
      const i = nextIdx++;
      if (i >= targetSuites.length) break;
      const suite = targetSuites[i];
      const isPw = isPlaywrightSuite(suite);

      try {
        if (isPw) {
          results[i] = await runWithPwLock(() => runSuiteAsync(suite));
        } else {
          results[i] = await runSuiteAsync(suite);
        }
      } catch (err) {
        results[i] = { suite, suiteName: path.basename(suite), status: 1, stdout: '', stderr: err.message, elapsed: '0.00' };
      }
      flushPrinted();
    }
  }

  const workers = Array.from({ length: Math.min(CONCURRENCY, targetSuites.length) }, () => worker());
  await Promise.all(workers);

  const totalElapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log('\n====================================================');
  console.log(` Summary: ${passedCount} Passed | ${failedCount} Failed (${targetSuites.length} files, ${passedSubtests}/${totalSubtests} tests, ${totalElapsed}s total)`);
  console.log('====================================================');

  const targetOutputFile = process.env.TEST_RUNNER_NODE ? 'test-output-ia32.txt' : 'test-output-x64.txt';
  try {
    fs.writeFileSync(path.join(rootDir, targetOutputFile), fullLogBuffer, 'utf8');
    console.log(`Saved output log to ${targetOutputFile}`);
  } catch (_) {}

  if (failedCount > 0) {
    console.error('\n--- Failure Details ---');
    for (const f of failures) {
      console.error(`\nSuite: ${f.suite}`);
      console.error(f.error ? f.error.slice(-500) : 'Unknown failure');
    }
    process.exit(1);
  } else {
    console.log('\n✅ ALL ISOLATED TEST SUITES COMPLETED WITH ZERO OOM ERRORS.');
    process.exit(0);
  }
}

main();

