const initSqlJs = require('sql.js');
const fs = require('fs');
const bcrypt = require('bcryptjs');

const dbPath = 'C:/Users/zyad/AppData/Roaming/cafe-pos/cafe-pos.db';
if (!fs.existsSync(dbPath)) {
  console.log('DB does not exist at', dbPath);
  process.exit(0);
}

initSqlJs().then(SQL => {
  const buf = fs.readFileSync(dbPath);
  const db = new SQL.Database(buf);
  console.log('=== USERS IN ACTIVE DB ===');
  const stmt = db.prepare('SELECT id, username, name, password, role, must_change_password FROM users');
  while (stmt.step()) {
    const u = stmt.getAsObject();
    console.log(u);
    console.log(`Testing admin password for ${u.username}:`, bcrypt.compareSync('admin', u.password));
    console.log(`Testing 1234 password for ${u.username}:`, bcrypt.compareSync('1234', u.password));
    console.log(`Testing 123456 password for ${u.username}:`, bcrypt.compareSync('123456', u.password));
    console.log(`Testing manager123 password for ${u.username}:`, bcrypt.compareSync('manager123', u.password));
  }
});
