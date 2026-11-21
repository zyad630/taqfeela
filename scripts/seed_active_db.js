const initSqlJs = require('sql.js');
const fs = require('fs');
const bcrypt = require('bcryptjs');

const dbPath = 'C:/Users/zyad/AppData/Roaming/cafe-pos/cafe-pos.db';
if (fs.existsSync(dbPath)) {
  initSqlJs().then(SQL => {
    const buf = fs.readFileSync(dbPath);
    const db = new SQL.Database(buf);
    
    const count = db.exec('SELECT COUNT(*) AS c FROM users')[0]?.values[0][0] || 0;
    console.log('Current users count:', count);
    
    if (count === 0) {
      const adminHash = bcrypt.hashSync('admin', 10);
      const cashierHash = bcrypt.hashSync('1234', 10);

      db.run(`
        INSERT INTO users (username, name, password, role, phone, salary, shift_name, shift_start, shift_end, created_at, must_change_password)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, ['admin', 'مدير النظام', adminHash, 'admin', '01000000000', 6000, 'جميع الأوقات', '00:00', '23:59', new Date().toISOString(), 0]);

      db.run(`
        INSERT INTO users (username, name, password, role, phone, salary, shift_name, shift_start, shift_end, created_at, must_change_password)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, ['cashier1', 'كاشير الفترة الصباحية', cashierHash, 'cashier', '01011111111', 3500, 'الشيفت الصباحي (الأول)', '06:00', '14:00', new Date().toISOString(), 0]);

      db.run(`
        INSERT INTO users (username, name, password, role, phone, salary, shift_name, shift_start, shift_end, created_at, must_change_password)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, ['cashier2', 'كاشير الفترة المسائية', cashierHash, 'cashier', '01022222222', 3500, 'الشيفت المسائي (الثاني)', '14:00', '22:00', new Date().toISOString(), 0]);

      db.run(`
        INSERT INTO users (username, name, password, role, phone, salary, shift_name, shift_start, shift_end, created_at, must_change_password)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, ['cashier3', 'كاشير الفترة الليلية', cashierHash, 'cashier', '01033333333', 3500, 'الشيفت الليلي (الثالث)', '22:00', '06:00', new Date().toISOString(), 0]);

      const data = db.export();
      fs.writeFileSync(dbPath, Buffer.from(data));
      console.log('Seeded users into active db successfully!');
    } else {
      console.log('Users already present in active db');
    }
  });
}
