const fs = require('fs');
const initSqlJs = require('sql.js');

async function inspect(dbPath) {
  if (!fs.existsSync(dbPath)) { console.log('DB not found:', dbPath); return; }
  const SQL = await initSqlJs();
  const db = new SQL.Database(fs.readFileSync(dbPath));
  console.log('\n=== DB:', dbPath, '===');
  
  // SQLite date
  const nowRes = db.exec("SELECT datetime('now'), datetime('now', 'localtime')");
  if (nowRes.length > 0) console.log('SQLite now UTC vs localtime:', nowRes[0].values[0]);
  
  // Recent orders
  const orders = db.exec("SELECT id, invoice_no, created_at, total, status, shift_id FROM orders ORDER BY id DESC LIMIT 10");
  if (orders.length > 0) {
    console.log('Recent orders:');
    orders[0].values.forEach(v => console.log(' ', JSON.stringify(v)));
  } else {
    console.log('No orders found!');
  }

  // Orders by date
  const byDate = db.exec("SELECT substr(created_at,1,10) as day, COUNT(*) as cnt, SUM(total) as total FROM orders WHERE status != 'cancelled' GROUP BY day ORDER BY day DESC LIMIT 7");
  if (byDate.length > 0) {
    console.log('Orders grouped by date:');
    byDate[0].values.forEach(v => console.log(' ', JSON.stringify(v)));
  }

  // Open shift
  const shifts = db.exec("SELECT id, opened_at, closed_at, user_id, user_name FROM shifts ORDER BY id DESC LIMIT 3");
  if (shifts.length > 0) {
    console.log('Recent shifts:');
    shifts[0].values.forEach(v => console.log(' ', JSON.stringify(v)));
  }
}

(async () => {
  await inspect('D:\\cafe-app-build\\release\\data\\cafe-pos.db');
  await inspect('C:\\Users\\zyad\\AppData\\Roaming\\TaqfeelaPOS\\cafe-pos.db');
  await inspect('cafe-pos.db');
})().catch(console.error);
