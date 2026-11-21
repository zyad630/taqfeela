const fs = require('fs');
const initSqlJs = require('sql.js');

async function test() {
  const SQL = await initSqlJs();
  const dbPaths = [
    'D:\\cafe-app-build\\release\\data\\cafe-pos.db',
    process.env.APPDATA + '\\cafe-pos\\cafe-pos.db',
    process.env.LOCALAPPDATA + '\\cafe-pos\\cafe-pos.db',
    'c:\\Users\\zyad\\Downloads\\cafe-app\\cafe-pos.db'
  ];

  for (const dbPath of dbPaths) {
    if (!fs.existsSync(dbPath)) continue;
    console.log('=== Checking DB:', dbPath);
    const db = new SQL.Database(fs.readFileSync(dbPath));
    
    const stmt = db.prepare(`
      SELECT
        COUNT(*) AS order_count,
        COALESCE(SUM(total), 0) AS total_sales
      FROM orders 
      WHERE status != 'cancelled' 
        AND date(created_at) >= date(?)
        AND date(created_at) <= date(?)
    `);
    stmt.bind(['2026-09-11', '2026-09-11']);
    if (stmt.step()) {
      console.log('Sales today (2026-09-11):', stmt.getAsObject());
    }
    stmt.free();

    const stmt2 = db.prepare('SELECT id, created_at, date(created_at) as d, total, status, user_id, shift_id FROM orders ORDER BY id DESC LIMIT 5');
    console.log('Recent 5 orders:');
    while (stmt2.step()) {
      console.log(stmt2.getAsObject());
    }
    stmt2.free();
  }
}
test();
