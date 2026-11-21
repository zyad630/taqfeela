const fs = require('fs');
const initSqlJs = require('sql.js');

async function inspect(dbPath) {
  if (!fs.existsSync(dbPath)) { console.log('DB not found:', dbPath); return; }
  const SQL = await initSqlJs();
  const db = new SQL.Database(fs.readFileSync(dbPath));
  console.log('\n=== DB:', dbPath, '===');

  // Users list
  const users = db.exec('SELECT id, username, name, role FROM users ORDER BY id');
  if (users.length > 0) {
    console.log('Users:');
    users[0].values.forEach(v => console.log(' ', JSON.stringify(v)));
  }

  // Orders with user_id
  const orders = db.exec("SELECT id, invoice_no, substr(created_at,1,10) as day, total, user_id, shift_id FROM orders WHERE status != 'cancelled' ORDER BY id DESC LIMIT 15");
  if (orders.length > 0) {
    console.log('Recent completed orders (id, inv, day, total, user_id, shift_id):');
    orders[0].values.forEach(v => console.log(' ', JSON.stringify(v)));
  }

  // Test getReportSales for today - all users
  const today = new Date().toISOString().slice(0, 10);
  const allRes = db.exec(`SELECT COUNT(*) as cnt, COALESCE(SUM(total),0) as total FROM orders WHERE date(created_at) >= date('${today}') AND date(created_at) <= date('${today}') AND status != 'cancelled'`);
  console.log('Total sales for', today, '(all users):', allRes[0].values[0]);

  // Test for user_id = 5
  const u5Res = db.exec(`SELECT COUNT(*) as cnt, COALESCE(SUM(total),0) as total FROM orders WHERE date(created_at) >= date('${today}') AND date(created_at) <= date('${today}') AND status != 'cancelled' AND (user_id = 5 OR shift_id IN (SELECT id FROM shifts WHERE user_id = 5))`);
  console.log('Sales for today filtered by user_id=5:', u5Res[0].values[0]);
}

(async () => {
  await inspect('D:\\cafe-app-build\\release\\data\\cafe-pos.db');
})().catch(console.error);
