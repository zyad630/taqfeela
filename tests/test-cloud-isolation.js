const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { buildCloudServer, CloudDatabase } = require('../apps/cloud/src/server');

async function runTests() {
  console.log('====================================================');
  console.log('   TEST PHASE 3: CLOUD SECURITY & ISOLATION SUITE   ');
  console.log('====================================================\n');

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'taqfeela-cloud-test-'));
  const dbPath = path.join(tmpDir, 'cloud-store.json');
  const testJwtSecret = 'test_super_secret_jwt_key_at_least_32_chars_long';

  const db1 = new CloudDatabase(dbPath);
  const { server } = buildCloudServer({
    db: db1,
    jwtSecret: testJwtSecret,
    corsOrigins: ['https://admin.taqfeela.com']
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  console.log(`[Test Setup] Cloud server running on port: ${port}`);

  // Create two distinct cafes and two real bcrypt-authenticated admins
  const cafeA = db1.createCafe('كافيه الشرقية', 'CAFE-A-CODE', 'token_secret_A_random_98765');
  const cafeB = db1.createCafe('كافيه الغربية', 'CAFE-B-CODE', 'token_secret_B_random_54321');
  const adminA = db1.createAdminUser('adminA@example.com', 'StrongPassA!2026');
  const adminB = db1.createAdminUser('adminB@example.com', 'StrongPassB!2026');
  db1.linkAdminToCafe(adminA.id, cafeA.id);
  db1.linkAdminToCafe(adminB.id, cafeB.id);

  console.log('\n--- 1. Auth: Reject Invalid Credentials & Forged Tokens ---');
  const badLogin = await fetch(`http://127.0.0.1:${port}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'adminA@example.com', password: 'wrong_password' })
  });
  assert.strictEqual(badLogin.status, 401, 'Wrong password must return 401');

  // Forged legacy admin_token_101 must be rejected
  const forgedAccess = await fetch(`http://127.0.0.1:${port}/cafes/${cafeA.id}/home`, {
    headers: { 'Authorization': 'Bearer admin_token_101' }
  });
  assert.strictEqual(forgedAccess.status, 401, 'Forged admin_token_101 must be rejected with 401');
  console.log('✓ Rejected wrong password and forged admin_token_101 with 401');

  console.log('\n--- 2. Auth: Real bcrypt Login & Signed JWT ---');
  const loginA = await fetch(`http://127.0.0.1:${port}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'adminA@example.com', password: 'StrongPassA!2026' })
  });
  assert.strictEqual(loginA.status, 200);
  const { token: tokenA } = await loginA.json();
  assert.ok(tokenA && tokenA.split('.').length === 3, 'Must issue signed JWT');

  const loginB = await fetch(`http://127.0.0.1:${port}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'adminB@example.com', password: 'StrongPassB!2026' })
  });
  assert.strictEqual(loginB.status, 200);
  const { token: tokenB } = await loginB.json();
  console.log('✓ Real bcrypt login issued signed JWTs');

  console.log('\n--- 3. Relay Push: Reject Missing/Wrong Token & Non-Integer Seq ---');
  const resMissingToken = await fetch(`http://127.0.0.1:${port}/relay/push`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cafeCode: 'CAFE-A-CODE', type: 'snapshot', seq: 1, data: { sales: '100' } })
  });
  assert.strictEqual(resMissingToken.status, 401, 'Missing relayToken must return 401 JSON (not 500 stack trace)');
  const missingBody = await resMissingToken.json();
  assert.ok(missingBody.error);

  const resStringSeq = await fetch(`http://127.0.0.1:${port}/relay/push`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cafeCode: 'CAFE-A-CODE', relayToken: 'token_secret_A_random_98765', type: 'snapshot', seq: '5', data: { sales: '100' } })
  });
  assert.strictEqual(resStringSeq.status, 400, 'String seq must be rejected with 400');

  const resMissingSeq = await fetch(`http://127.0.0.1:${port}/relay/push`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cafeCode: 'CAFE-A-CODE', relayToken: 'token_secret_A_random_98765', type: 'snapshot', data: { sales: '100' } })
  });
  assert.strictEqual(resMissingSeq.status, 400, 'Missing seq must be rejected with 400');
  console.log('✓ Rejected missing relayToken (401), string seq (400), and missing seq (400)');

  console.log('\n--- 4. Malformed JSON & Strict CORS ---');
  const resBadJson = await fetch(`http://127.0.0.1:${port}/relay/push`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Origin': 'https://evil.example.com' },
    body: '{bad json'
  });
  assert.strictEqual(resBadJson.status, 400, 'Malformed JSON must return 400');
  const badJsonText = await resBadJson.text();
  assert.ok(!badJsonText.includes('SyntaxError') && !badJsonText.includes('node_modules'), 'Must not leak stack trace');
  assert.strictEqual(resBadJson.headers.get('access-control-allow-origin'), null, 'Disallowed origin must not receive ACAO header');
  console.log('✓ Malformed JSON returns clean 400 without stack trace; CORS rejects unknown origins');

  console.log('\n--- 5. Relay Push, Replay Protection & Persistence Across Restart ---');
  const resGoodAuth = await fetch(`http://127.0.0.1:${port}/relay/push`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      cafeCode: 'CAFE-A-CODE',
      relayToken: 'token_secret_A_random_98765',
      type: 'snapshot',
      seq: 10,
      data: { sales: '5,400', invoicesCount: '48' }
    })
  });
  assert.strictEqual(resGoodAuth.status, 200);
  assert.strictEqual((await resGoodAuth.json()).ack, true);

  // Stop server and restart with a fresh CloudDatabase instance reading the same file!
  await new Promise((resolve) => server.close(resolve));
  const db2 = new CloudDatabase(dbPath);
  const { server: server2 } = buildCloudServer({ db: db2, jwtSecret: testJwtSecret });
  await new Promise((resolve) => server2.listen(0, '127.0.0.1', resolve));
  const port2 = server2.address().port;

  // Replay seq 10 AFTER restart -> must still be blocked!
  const resReplayAfterRestart = await fetch(`http://127.0.0.1:${port2}/relay/push`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      cafeCode: 'CAFE-A-CODE',
      relayToken: 'token_secret_A_random_98765',
      type: 'snapshot',
      seq: 10,
      data: { sales: '999,999' }
    })
  });
  const replayBody = await resReplayAfterRestart.json();
  assert.strictEqual(replayBody.ack, false);
  assert.strictEqual(replayBody.reason, 'replayed_seq');

  // Verify persisted snapshot & strict multi-tenant isolation AFTER restart
  const resHomeA = await fetch(`http://127.0.0.1:${port2}/cafes/${cafeA.id}/home`, {
    headers: { 'Authorization': `Bearer ${tokenA}` }
  });
  assert.strictEqual(resHomeA.status, 200);
  assert.strictEqual((await resHomeA.json()).sales, '5,400', 'Persisted snapshot must survive restart');

  const resHomeB = await fetch(`http://127.0.0.1:${port2}/cafes/${cafeB.id}/home`, {
    headers: { 'Authorization': `Bearer ${tokenA}` }
  });
  assert.strictEqual(resHomeB.status, 403, 'Cross-tenant access must return 403');

  const resHomeBAdminB = await fetch(`http://127.0.0.1:${port2}/cafes/${cafeB.id}/home`, {
    headers: { 'Authorization': `Bearer ${tokenB}` }
  });
  assert.strictEqual(resHomeBAdminB.status, 200);
  console.log('✓ Data, anti-replay seq, and multi-tenant isolation persisted across restart');

  console.log('\n--- 6. Login Rate Limiting (429) ---');
  let got429 = false;
  for (let i = 0; i < 8; i++) {
    const r = await fetch(`http://127.0.0.1:${port2}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'adminA@example.com', password: 'wrong' })
    });
    if (r.status === 429) {
      got429 = true;
      break;
    }
  }
  assert.strictEqual(got429, true, '/auth/login must enforce rate limiting (429)');
  console.log('✓ /auth/login rate limiting enforced (429)');

  await new Promise((resolve) => server2.close(resolve));
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}

  console.log('\n====================================================');
  console.log('   ✅ ALL CLOUD SECURITY & ISOLATION TESTS PASSED!  ');
  console.log('====================================================\n');
}

runTests().catch(err => {
  console.error('\n❌ CLOUD ISOLATION TEST FAILED:', err);
  process.exit(1);
});
