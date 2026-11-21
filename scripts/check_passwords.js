const bcrypt = require('bcryptjs');
const initSqlJs = require('sql.js');
const fs = require('fs');

(async () => {
  const SQL = await initSqlJs();
  const dbPaths = [
    'C:/Users/zyad/AppData/Roaming/TaqfeelaPOS/cafe-pos.db',
    'C:/Users/zyad/AppData/Roaming/cafe-pos/cafe-pos.db',
    'cafe-pos.db'
  ];
  for (const p of dbPaths) {
    if (!fs.existsSync(p)) continue;
    const buf = fs.readFileSync(p);
    const db = new SQL.Database(buf);
    const u = db.exec("SELECT username, role, password FROM users");
    console.log('\n--- ' + p + ' ---');
    if (u.length > 0) {
      u[0].values.forEach(row => {
        const pass = row[2];
        const okAdmin = bcrypt.compareSync('admin', pass);
        const ok1234 = bcrypt.compareSync('1234', pass);
        console.log(row[0] + ' (' + row[1] + ') => admin: ' + okAdmin + ' | 1234: ' + ok1234);
      });
    }
  }
})();
