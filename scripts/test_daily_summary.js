const fs = require('fs');
const initSqlJs = require('sql.js');

async function test() {
  const SQL = await initSqlJs();
  const db = new SQL.Database(fs.readFileSync('D:\\cafe-app-build\\release\\data\\cafe-pos.db'));
  
  const stmt = db.prepare(`SELECT id, opened_at, closed_at, total_sales FROM shifts WHERE strftime('%Y-%m-%d', opened_at) = '2026-09-11' OR strftime('%Y-%m-%d', closed_at) = '2026-09-11'`);
  console.log('Daily summary shifts:');
  while(stmt.step()) {
    console.log(stmt.getAsObject());
  }
  stmt.free();
}
test();
