/**
 * Crash Worker Thread: repeatedly creates orders and triggers saveDbAtomicAsync in a tight loop.
 * Expected to be violently killed by parent via SIGKILL.
 */
const path = require('path');
const fs = require('fs');

async function main() {
  const dbPath = process.argv[2];
  if (!dbPath) process.exit(1);

  const db = require('../../electron/db');
  await db.init(dbPath);

  let adminUser = db.queryGet('SELECT id, name FROM users WHERE role = "admin" LIMIT 1');
  if (!adminUser) {
    db.setupInitialAdmin('AdminPass123!@#', 'مدير النظام');
    adminUser = db.queryGet('SELECT id, name FROM users WHERE role = "admin" LIMIT 1');
  }

  let shift = db.currentShift();
  if (!shift) {
    shift = db.openShift(adminUser.id, 'الشيفت الصباحي', 500);
  }

  let prod = db.queryGet('SELECT id, name, price FROM products LIMIT 1');
  if (!prod) {
    prod = db.saveProduct({ name: 'شاي أحمر', price: 15, category_id: 1, stock_qty: 10000 });
  }

  // Ensure baseline is committed before signaling ready
  await db.saveDbAtomicAsync();

  if (process.send) process.send('READY');

  let i = 0;
  while (true) {
    i++;
    try {
      db.createOrder({
        items: [{ id: prod.id, name: prod.name, price: 15, qty: 1 }],
        total: 15,
        subtotal: 15,
        paymentMethod: 'cash',
        orderType: 'takeaway',
        amountPaid: 15,
        shiftId: shift.id,
        user: adminUser
      });
      // Fire async worker save
      await db.saveDbAtomicAsync();
    } catch (_) {}
  }
}

main().catch(() => process.exit(1));
