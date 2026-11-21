const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

async function testPrereqsAndSelfTest() {
  console.log('======================================================');
  console.log(' TEST ITEMS 2 & 3: Prerequisites & Self-Test Audit   ');
  console.log('======================================================\n');

  // -----------------------------------------------------------------
  // PART 1: Prerequisites Check Simulation (Red -> Green)
  // -----------------------------------------------------------------
  console.log('--- PART 1: Prerequisites Check & Missing KB Detection ---');
  const prereqs = require('../electron/prereqs');

  // Test 1.A: Simulation of missing Windows 7 SP1 (KB976932)
  process.env.CAFE_SIMULATE_PREREQ_FAIL = 'WIN7_NO_SP1';
  const resWin7 = prereqs.checkSystemPrerequisites();
  assert.strictEqual(resWin7.compatible, false, 'Must detect incompatibility when SP1 is missing');
  assert.strictEqual(resWin7.missing[0].kbNumber, 'KB976932', 'Must specify KB976932');
  assert.ok(resWin7.missing[0].message.includes('Windows 7 Service Pack 1'), 'Arabic message must be clear');
  console.log('   ✓ Missing SP1 correctly caught with KB976932');

  // Test 1.B: Simulation of missing Universal C Runtime (KB2999226)
  process.env.CAFE_SIMULATE_PREREQ_FAIL = 'MISSING_UCRT';
  const resUcrt = prereqs.checkSystemPrerequisites();
  assert.strictEqual(resUcrt.compatible, false);
  assert.strictEqual(resUcrt.missing[0].kbNumber, 'KB2999226');
  assert.ok(resUcrt.missing[0].message.includes('ucrtbase.dll'), 'Must mention ucrtbase.dll');
  console.log('   ✓ Missing UCRT correctly caught with KB2999226 and ucrtbase.dll instructions');

  // Test 1.C: Simulation of missing SHA-2 update (KB4474419)
  process.env.CAFE_SIMULATE_PREREQ_FAIL = 'MISSING_SHA2';
  const resSha2 = prereqs.checkSystemPrerequisites();
  assert.strictEqual(resSha2.compatible, false);
  assert.strictEqual(resSha2.missing[0].kbNumber, 'KB4474419');
  assert.ok(resSha2.missing[0].message.includes('SHA-256'), 'Must mention SHA-256');
  console.log('   ✓ Missing SHA-2 update correctly caught with KB4474419');

  // Clear simulation
  delete process.env.CAFE_SIMULATE_PREREQ_FAIL;
  const currentSys = prereqs.checkSystemPrerequisites();
  console.log(`   ✓ Current Host OS compatibility check: compatible=${currentSys.compatible}, release=${currentSys.release}`);

  // -----------------------------------------------------------------
  // PART 2: Self-Test Routine Execution (--selftest)
  // -----------------------------------------------------------------
  console.log('\n--- PART 2: Self-Test Sandbox Routine (--selftest) ---');
  const selftest = require('../electron/selftest');

  // Ensure any previous SELFTEST_RESULT.txt is removed
  const resultFile = path.join(process.cwd(), 'SELFTEST_RESULT.txt');
  if (fs.existsSync(resultFile)) fs.unlinkSync(resultFile);

  // Record real DB state in AppData to prove --selftest NEVER touches customer data
  const realAppData = process.env.APPDATA ? path.join(process.env.APPDATA, 'TaqfeelaPOS', 'cafe-pos.db') : null;
  let realDbMtimeBefore = null;
  if (realAppData && fs.existsSync(realAppData)) {
    realDbMtimeBefore = fs.statSync(realAppData).mtimeMs;
  }

  // Run self test
  const diag = await selftest.runSelfTest(null);

  assert.strictEqual(diag.success, true, 'Self-test must succeed 100%');
  assert.strictEqual(diag.steps.length, 7, 'Must execute all 7 self-test steps');
  assert.ok(fs.existsSync(resultFile), 'SELFTEST_RESULT.txt must be generated');

  const reportText = fs.readFileSync(resultFile, 'utf8');
  assert.ok(reportText.includes('✅ يعمل بنجاح تام'), 'Report must indicate success');
  assert.ok(reportText.includes(diag.processArch), 'Report must record architecture');
  assert.ok(reportText.includes(diag.osRelease), 'Report must record OS release');

  // Verify real customer DB was NOT touched
  if (realAppData && fs.existsSync(realAppData)) {
    const realDbMtimeAfter = fs.statSync(realAppData).mtimeMs;
    assert.strictEqual(realDbMtimeAfter, realDbMtimeBefore, 'CRITICAL: Real customer DB must NEVER be touched during --selftest');
    console.log('   ✓ Verified real customer database in %APPDATA% was completely untouched.');
  }

  console.log('\n======================================================');
  console.log(' ✅ ALL PREREQUISITES & SELFTEST CHECKS PASSED 100%   ');
  console.log('======================================================');
}

testPrereqsAndSelfTest().catch(err => {
  console.error('❌ FAILED:', err);
  process.exit(1);
});

