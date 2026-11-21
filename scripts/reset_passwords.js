const bcrypt = require('../node_modules/bcryptjs');
const initSqlJs = require('../node_modules/sql.js');
const fs = require('fs');
const path = require('path');

(async () => {
  const SQL = await initSqlJs();

  const adminHash = bcrypt.hashSync('admin', 10);
  const cashierHash = bcrypt.hashSync('1234', 10);

  // Verify hashes work
  if (!bcrypt.compareSync('admin', adminHash)) {
    console.error('ERROR: bcrypt admin hash failed!');
    process.exit(1);
  }
  if (!bcrypt.compareSync('1234', cashierHash)) {
    console.error('ERROR: bcrypt cashier hash failed!');
    process.exit(1);
  }
  console.log('[OK] Hashes verified');

  const dbPaths = [
    'C:/Users/zyad/AppData/Roaming/TaqfeelaPOS/cafe-pos.db',
    'C:/Users/zyad/AppData/Roaming/cafe-pos/cafe-pos.db',
    path.join(__dirname, '../cafe-pos.db')
  ];

  for (const dbPath of dbPaths) {
    if (!fs.existsSync(dbPath)) {
      console.log(`[SKIP] Not found: ${dbPath}`);
      continue;
    }

    console.log(`\n[PROCESSING] ${dbPath}`);

    const fileBuffer = fs.readFileSync(dbPath);
    const db = new SQL.Database(fileBuffer);

    // 1. Close any open shifts (close_at them so DB is clean)
    try {
      const openShifts = db.exec("SELECT id FROM shifts WHERE closed_at IS NULL");
      if (openShifts.length > 0 && openShifts[0].values.length > 0) {
        openShifts[0].values.forEach(row => {
          const shiftId = row[0];
          console.log(`  Closing test shift id=${shiftId}`);
          db.run("UPDATE shifts SET closed_at = ?, actual_cash = 0, cash_difference = 0 WHERE id = ?",
            [new Date().toISOString(), shiftId]);
        });
      } else {
        console.log('  No open shifts to close');
      }
    } catch(e) {
      console.log('  No shifts table or error:', e.message);
    }

    // 2. Reset all user passwords
    try {
      const usersRes = db.exec("SELECT id, username, role FROM users");
      if (usersRes.length > 0) {
        usersRes[0].values.forEach(row => {
          const id = row[0];
          const username = row[1];
          const role = row[2];
          const newHash = role === 'admin' ? adminHash : cashierHash;
          db.run("UPDATE users SET password = ? WHERE id = ?", [newHash, id]);
          console.log(`  Reset password: ${username} (${role}) -> ${role === 'admin' ? 'admin' : '1234'}`);
        });
      }
    } catch(e) {
      console.error('  Error resetting passwords:', e.message);
    }

    // 3. Save the database
    const data = db.export();
    fs.writeFileSync(dbPath, Buffer.from(data));
    console.log(`[SAVED] ${dbPath}`);

    // 4. Verify
    const verBuf = fs.readFileSync(dbPath);
    const verDb = new SQL.Database(verBuf);
    try {
      const adminUser = verDb.exec("SELECT password FROM users WHERE username = 'admin'");
      if (adminUser.length > 0) {
        const storedHash = adminUser[0].values[0][0];
        const works = bcrypt.compareSync('admin', storedHash);
        console.log(`[VERIFY] admin login: ${works ? 'OK' : 'FAILED!'}`);
      }
    } catch(e) {
      console.log('[VERIFY] No admin user found');
    }
  }

  console.log('\n=== DONE! Passwords reset: admin->admin, cashiers->1234 ===');
})();
