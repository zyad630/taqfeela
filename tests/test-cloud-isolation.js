const assert = require('assert');
const { buildCloudServer, db } = require('../apps/cloud/src/server');

async function runTests() {
  console.log('====================================================');
  console.log('   TEST PHASE 3: CLOUD MULTI-TENANT ISOLATION       ');
  console.log('====================================================\n');

  // Setup server
  const { server } = buildCloudServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  console.log(`[Test Setup] Cloud server running on port: ${port}`);

  // Seed two distinct cafes: Cafe A and Cafe B
  const cafeA = db.seedDefaultCafe('CAFE-A-CODE', 'كافيه الشرقية', 'token_secret_A');
  const cafeB = db.createCafe('كافيه الغربية', 'CAFE-B-CODE', 'token_secret_B');
  console.log(`[Test Setup] Seeded Cafe A (id: ${cafeA.cafeId}) and Cafe B (id: ${cafeB.id})`);

  // Admin A authorized ONLY for Cafe A
  const adminIdA = 101;
  db.linkAdminToCafe(adminIdA, cafeA.cafeId);

  // Admin B authorized ONLY for Cafe B
  const adminIdB = 202;
  db.linkAdminToCafe(adminIdB, cafeB.id);

  console.log('\n--- 1. Relay Push: Reject Wrong Relay Token ---');
  const resBadAuth = await fetch(`http://127.0.0.1:${port}/relay/push`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      cafeCode: 'CAFE-A-CODE',
      relayToken: 'WRONG_INVALID_TOKEN',
      type: 'snapshot',
      seq: 1,
      data: { sales: '100' }
    })
  });
  assert.strictEqual(resBadAuth.status, 401, 'Must reject invalid relay token with 401');
  console.log('✓ Rejected invalid relay token with 401');

  console.log('\n--- 2. Relay Push: Valid Authentication & Ingestion ---');
  const resGoodAuth = await fetch(`http://127.0.0.1:${port}/relay/push`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      cafeCode: 'CAFE-A-CODE',
      relayToken: 'token_secret_A',
      type: 'snapshot',
      seq: 1,
      data: {
        sales: '5,400',
        invoicesCount: '48'
      }
    })
  });
  assert.strictEqual(resGoodAuth.status, 200);
  const goodBody = await resGoodAuth.json();
  assert.strictEqual(goodBody.ack, true);
  console.log('✓ Ingested Cafe A snapshot successfully (seq 1)');

  console.log('\n--- 3. Replay Attack Prevention (Monotonic Seq Enforced) ---');
  // Re-send seq 1 (replayed message with forged sales)
  const resReplay = await fetch(`http://127.0.0.1:${port}/relay/push`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      cafeCode: 'CAFE-A-CODE',
      relayToken: 'token_secret_A',
      type: 'snapshot',
      seq: 1,
      data: { sales: '999,999' }
    })
  });
  const replayBody = await resReplay.json();
  assert.strictEqual(replayBody.ack, false);
  assert.strictEqual(replayBody.reason, 'replayed_seq');

  // Verify snapshot in DB was NOT overwritten with replayed sales
  const snapA = db.getSnapshot(cafeA.cafeId);
  assert.strictEqual(snapA.json.sales, '5,400', 'Replayed message must not overwrite state');
  console.log('✓ Replayed sequence number silently rejected; snapshot preserved');

  console.log('\n--- 4. Strict Multi-Tenant Isolation (Admin A vs Cafe B) ---');
  // Admin A accesses Cafe A Home -> should succeed (200)
  const resHomeA = await fetch(`http://127.0.0.1:${port}/cafes/${cafeA.cafeId}/home`, {
    headers: { 'Authorization': `Bearer admin_token_${adminIdA}` }
  });
  assert.strictEqual(resHomeA.status, 200, 'Admin A must access Cafe A');
  const bodyHomeA = await resHomeA.json();
  assert.strictEqual(bodyHomeA.sales, '5,400');
  console.log('✓ Admin A accessed Cafe A home snapshot successfully');

  // Admin A attempts to access Cafe B Home -> MUST return 403 Forbidden!
  const resHomeB = await fetch(`http://127.0.0.1:${port}/cafes/${cafeB.id}/home`, {
    headers: { 'Authorization': `Bearer admin_token_${adminIdA}` }
  });
  assert.strictEqual(resHomeB.status, 403, 'Cross-tenant access MUST return 403 Forbidden');
  console.log('✓ Admin A blocked from Cafe B with 403 Forbidden (Zero Cross-Café Leakage)');

  // Admin A attempts to access Cafe B Reports -> MUST return 403 Forbidden!
  const resRepB = await fetch(`http://127.0.0.1:${port}/cafes/${cafeB.id}/reports`, {
    headers: { 'Authorization': `Bearer admin_token_${adminIdA}` }
  });
  assert.strictEqual(resRepB.status, 403, 'Cross-tenant reports access MUST return 403 Forbidden');
  console.log('✓ Admin A blocked from Cafe B reports with 403 Forbidden');

  // Admin B accesses Cafe B Home -> should succeed (200)
  const resHomeBAdminB = await fetch(`http://127.0.0.1:${port}/cafes/${cafeB.id}/home`, {
    headers: { 'Authorization': `Bearer admin_token_${adminIdB}` }
  });
  assert.strictEqual(resHomeBAdminB.status, 200, 'Admin B must access Cafe B');
  console.log('✓ Admin B accessed Cafe B successfully');

  await new Promise((resolve) => server.close(resolve));

  console.log('\n====================================================');
  console.log('   ✅ ALL CLOUD MULTI-TENANT ISOLATION TESTS PASSED!');
  console.log('====================================================\n');
}

runTests().catch(err => {
  console.error('\n❌ CLOUD ISOLATION TEST FAILED:', err);
  process.exit(1);
});
