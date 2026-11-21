const fs = require('fs');
const initSqlJs = require('sql.js');

async function check(dbPath) {
  if (!fs.existsSync(dbPath)) return;
  const SQL = await initSqlJs();
  const filebuffer = fs.readFileSync(dbPath);
  const db = new SQL.Database(filebuffer);
  console.log('=== Checking:', dbPath, '===');
  try {
    const res = db.exec("SELECT id, number, name, status, current_order_id FROM tables WHERE number = 6 OR id = 6 OR status = 'occupied'");
    if (res.length > 0) {
      console.log('Occupied or 6 tables:', JSON.stringify(res[0].values));
    } else {
      console.log('No occupied or 6 tables');
    }
    const carts = db.exec('SELECT * FROM table_carts');
    if (carts.length > 0) {
      console.log('table_carts:', JSON.stringify(carts[0].values));
    } else {
      console.log('No table_carts');
    }
  } catch(e) {
    console.log('Error:', e.message);
  }
}

(async () => {
  await check('C:\\Users\\zyad\\AppData\\Roaming\\TaqfeelaPOS\\cafe-pos.db');
  await check('C:\\Users\\zyad\\AppData\\Roaming\\cafe-pos\\cafe-pos.db');
  await check('cafe-pos.db');
  await check('D:\\cafe-app-build\\release\\data\\cafe-pos.db');
  await check('release\\data\\cafe-pos.db');
})();
