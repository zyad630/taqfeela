const bcrypt = require('bcryptjs');
const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

(async () => {
  const SQL = await initSqlJs();

  const adminHash = bcrypt.hashSync('1234', 10);
  const cashierHash = bcrypt.hashSync('123456', 10);

  const dbPaths = [
    'C:/Users/zyad/AppData/Roaming/TaqfeelaPOS/cafe-pos.db',
    'C:/Users/zyad/AppData/Roaming/cafe-pos/cafe-pos.db',
    path.join(__dirname, '../cafe-pos.db')
  ];

  for (const dbPath of dbPaths) {
    if (!fs.existsSync(dbPath)) continue;
    console.log('[CLEANING DB]:', dbPath);

    const buf = fs.readFileSync(dbPath);
    const db = new SQL.Database(buf);

    try {
      // 1. Delete all test cashiers
      db.run("DELETE FROM users WHERE username LIKE 'cashier_pay_%' OR name LIKE '%فحص الرواتب%'");
      
      // 2. Keep only clean default users
      // Check existing users
      const res = db.exec("SELECT id, username FROM users");
      console.log('Existing users before reset:', res.length > 0 ? res[0].values : []);

      // Clean and recreate clean users table
      db.run("DELETE FROM users");

      // Insert clean users
      const now = new Date().toISOString();
      db.run(`
        INSERT INTO users (id, username, name, password, role, phone, salary, shift_name, shift_start, shift_end, created_at, must_change_password)
        VALUES 
        (1, 'admin', 'مدير النظام', ?, 'admin', '01000000000', 6000, 'جميع الأوقات', '00:00', '23:59', ?, 0),
        (2, 'cashier1', 'كاشير الفترة الصباحية', ?, 'cashier', '01100000000', 3500, 'الشيفت الصباحي', '06:00', '14:00', ?, 0),
        (3, 'cashier2', 'كاشير الفترة المسائية', ?, 'cashier', '01200000000', 3500, 'الشيفت المسائي', '14:00', '22:00', ?, 0),
        (4, 'cashier3', 'كاشير الفترة الليلية', ?, 'cashier', '01500000000', 3500, 'الشيفت الليلي', '22:00', '06:00', ?, 0)
      `, [adminHash, now, cashierHash, now, cashierHash, now, cashierHash, now]);

      console.log('Clean users inserted: admin (pass 1234), 3 cashiers (pass 123456)');

      // Save
      const exported = db.export();
      fs.writeFileSync(dbPath, Buffer.from(exported));
      console.log('[SAVED]:', dbPath);
    } catch (e) {
      console.error('Error on DB:', e.message);
    }
  }

  console.log('\n=== DONE: Only 4 clean users exist now. ===');
})();
