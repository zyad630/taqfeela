'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

async function run() {
  const baseTemp = fs.existsSync('D:/cafe-temp') ? 'D:/cafe-temp' : os.tmpdir();
  const dir = path.join(baseTemp, `cafe-pos-bugfix-${Date.now()}`);
  fs.mkdirSync(dir, { recursive: true });
  const db = require('../electron/db');
  await db.init(path.join(dir, 'cafe-pos.db'));

  try {
    db.setupInitialAdmin('Admin123456!', 'المدير');
    const admin = db.queryGet('SELECT * FROM users WHERE role = ? LIMIT 1', ['admin']);
    const shift = db.openShift(500, 'test', admin, 'صباحي');

    db.saveTable({ number: '1', name: 'طاولة 1', hall: 'indoor' });
    db.saveTable({ number: '2', name: 'طاولة 2', hall: 'indoor' });
    const t1 = db.queryGet('SELECT id FROM tables WHERE number = ?', ['1']);
    const t2 = db.queryGet('SELECT id FROM tables WHERE number = ?', ['2']);
    const prod = db.queryGet('SELECT id, name, price FROM products WHERE is_deleted = 0 LIMIT 1');

    // Put 3 items on Table 1 with printedCheck = true
    db.saveTableCart(t1.id, {
      cart: [{ id: prod.id, name: prod.name, price: prod.price, qty: 3, sent_qty: 3 }],
      printedCheck: true
    });

    // 1. Takeaway order with stale tableId = t1.id MUST NOT wipe Table 1's cart or status!
    const tk = db.createOrder({
      items: [{ id: prod.id, qty: 1 }],
      orderType: 'takeaway',
      tableId: t1.id,
      user: admin,
      shiftId: shift.id
    });
    assert.strictEqual(tk.success, true);
    const t1CartAfterTakeaway = db.getTableCarts()[t1.id];
    assert.ok(t1CartAfterTakeaway && t1CartAfterTakeaway.cart.length === 1 && t1CartAfterTakeaway.cart[0].qty === 3,
      'Takeaway order MUST NOT wipe an occupied table cart!');

    // 2. transferTableItem (1 qty from t1 -> t2) MUST clear printedCheck on source Table 1 in DB!
    const tr = db.transferTableItem({ fromTableId: t1.id, toTableId: t2.id, itemId: prod.id, qty: 1 });
    assert.strictEqual(tr.success, true);
    const t1AfterTransfer = db.getTableCarts()[t1.id];
    assert.strictEqual(t1AfterTransfer.printedCheck, false,
      'Source table printedCheck MUST be reset to false in DB after item transfer!');
    assert.strictEqual(t1AfterTransfer.cart[0].qty, 2);

    const t2AfterTransfer = db.getTableCarts()[t2.id];
    assert.strictEqual(t2AfterTransfer.cart[0].qty, 1);

    console.log('✅ VERIFIED: Takeaway never wipes occupied table cart + transferTableItem clears source printedCheck in DB!');
  } finally {
    if (typeof db.shutdownWriterWorker === 'function') await db.shutdownWriterWorker();
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
  }
}

run().catch((e) => { console.error('❌ FAILED:', e); process.exit(1); });

