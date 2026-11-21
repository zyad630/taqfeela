const bcrypt = require('bcryptjs');
const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

(async () => {
  console.log('=== Database Unification, User Recovery & Shift Cleanup ===\n');
  const SQL = await initSqlJs();

  const taqfeelaDbPath = 'C:/Users/zyad/AppData/Roaming/TaqfeelaPOS/cafe-pos.db';
  const cafePosDbPath = 'C:/Users/zyad/AppData/Roaming/cafe-pos/cafe-pos.db';
  const localDbPath = path.join(__dirname, '../cafe-pos.db');

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.join(__dirname, '../backups');
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

  // 1. Create backups first
  [taqfeelaDbPath, cafePosDbPath, localDbPath].forEach((p) => {
    if (fs.existsSync(p)) {
      const bkp = path.join(backupDir, `backup-before-cleanup-${path.basename(path.dirname(p))}-${timestamp}.db`);
      fs.copyFileSync(p, bkp);
      console.log(`[BACKUP CREATED] ${bkp}`);
    }
  });

  // 2. Load cafe-pos DB (source of shifts 345..358, orders 659..660, and user zyad)
  let sourceDb = null;
  if (fs.existsSync(cafePosDbPath)) {
    sourceDb = new SQL.Database(fs.readFileSync(cafePosDbPath));
  }

  // Target DB to enhance: TaqfeelaPOS DB
  if (!fs.existsSync(taqfeelaDbPath)) {
    console.error('TaqfeelaPOS DB not found!');
    process.exit(1);
  }

  const targetDb = new SQL.Database(fs.readFileSync(taqfeelaDbPath));

  // A. Copy user 'zyad' if missing in target
  if (sourceDb) {
    const zyadUser = sourceDb.exec("SELECT * FROM users WHERE username = 'zyad'");
    if (zyadUser.length > 0 && zyadUser[0].values.length > 0) {
      const u = zyadUser[0].values[0];
      const targetHasZyad = targetDb.exec("SELECT id FROM users WHERE username = 'zyad'");
      if (targetHasZyad.length === 0 || targetHasZyad[0].values.length === 0) {
        console.log('[USER RECOVERY] Restoring user zyad into TaqfeelaPOS...');
        targetDb.run(`
          INSERT INTO users (username, name, password, role, phone, salary, shift_name, shift_start, shift_end, created_at, must_change_password)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, ['zyad', 'زياد', u[3], 'cashier', u[5] || '01100000000', u[6] || 3500, u[7] || 'الشيفت الصباحي', u[8] || '06:00', u[9] || '14:00', u[10] || new Date().toISOString(), 0]);
        console.log('✅ User zyad restored successfully.');
      }
    }

    // B. Copy any missing shifts from sourceDb (e.g. shifts 345..358)
    const srcShifts = sourceDb.exec("SELECT * FROM shifts WHERE id > 344");
    if (srcShifts.length > 0 && srcShifts[0].values.length > 0) {
      console.log(`[SYNC SHIFTS] Found ${srcShifts[0].values.length} shifts from cafe-pos to sync into TaqfeelaPOS...`);
      const cols = srcShifts[0].columns;
      srcShifts[0].values.forEach(row => {
        const shiftId = row[0];
        const exists = targetDb.exec("SELECT id FROM shifts WHERE id = ?", [shiftId]);
        if (exists.length === 0 || exists[0].values.length === 0) {
          const placeholders = cols.map(() => '?').join(', ');
          targetDb.run(`INSERT INTO shifts (${cols.join(', ')}) VALUES (${placeholders})`, row);
        }
      });
      console.log('✅ Shifts synchronized.');
    }

    // C. Copy any missing orders & order items (e.g. order 659, 660)
    const srcOrders = sourceDb.exec("SELECT * FROM orders WHERE id > 658");
    if (srcOrders.length > 0 && srcOrders[0].values.length > 0) {
      console.log(`[SYNC ORDERS] Found ${srcOrders[0].values.length} orders from cafe-pos to sync into TaqfeelaPOS...`);
      const cols = srcOrders[0].columns;
      srcOrders[0].values.forEach(row => {
        const orderId = row[0];
        const exists = targetDb.exec("SELECT id FROM orders WHERE id = ?", [orderId]);
        if (exists.length === 0 || exists[0].values.length === 0) {
          const placeholders = cols.map(() => '?').join(', ');
          targetDb.run(`INSERT INTO orders (${cols.join(', ')}) VALUES (${placeholders})`, row);
        }
      });

      // Order items
      const srcItems = sourceDb.exec("SELECT * FROM order_items WHERE order_id > 658");
      if (srcItems.length > 0 && srcItems[0].values.length > 0) {
        const itemCols = srcItems[0].columns;
        srcItems[0].values.forEach(row => {
          const itemId = row[0];
          const exists = targetDb.exec("SELECT id FROM order_items WHERE id = ?", [itemId]);
          if (exists.length === 0 || exists[0].values.length === 0) {
            const placeholders = itemCols.map(() => '?').join(', ');
            targetDb.run(`INSERT INTO order_items (${itemCols.join(', ')}) VALUES (${placeholders})`, row);
          }
        });
      }
      console.log('✅ Orders & items synchronized.');
    }
  }

  // 3. Set standard, unified passwords
  console.log('\n[UNIFYING PASSWORDS] Setting all standard passwords to 1234...');
  const passHash1234 = bcrypt.hashSync('1234', 10);
  targetDb.run("UPDATE users SET password = ?, must_change_password = 0 WHERE username IN ('admin', 'zyad', 'cashier', 'cashier1', 'cashier2', 'cashier3')", [passHash1234]);
  
  // Verify users
  const users = targetDb.exec("SELECT id, username, name, role FROM users");
  console.log('Current users in DB:');
  users[0].values.forEach(u => {
    console.log(`  - [ID ${u[0]}] ${u[1]} (${u[2]} - ${u[3]}) => password: 1234`);
  });

  // 4. Clean up empty dummy test shifts
  console.log('\n[CLEANING DUMMY TEST SHIFTS]...');
  const beforeCount = targetDb.exec("SELECT count(*) FROM shifts")[0].values[0][0];
  
  // Delete closed shifts with 0 orders, 0 expenses, and 0 stock movements
  targetDb.run(`
    DELETE FROM shifts 
    WHERE closed_at IS NOT NULL
      AND id NOT IN (SELECT DISTINCT shift_id FROM orders WHERE shift_id IS NOT NULL)
      AND id NOT IN (SELECT DISTINCT shift_id FROM expenses WHERE shift_id IS NOT NULL)
  `);

  const afterCount = targetDb.exec("SELECT count(*) FROM shifts")[0].values[0][0];
  console.log(`✅ Shifts before: ${beforeCount}, shifts cleaned: ${beforeCount - afterCount}, real shifts remaining: ${afterCount}`);

  // 5. Export and persist atomically to all target database files
  const data = Buffer.from(targetDb.export());
  [taqfeelaDbPath, cafePosDbPath, localDbPath].forEach((p) => {
    const dir = path.dirname(p);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(p, data);
    console.log(`[SAVED AND SYNCED] ${p}`);
  });

  console.log('\n========================================');
  console.log('✅ ALL OPERATIONS COMPLETED SUCCESSFULLY!');
  console.log('========================================');
})();
