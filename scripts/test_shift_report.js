const fs = require('fs');
const initSqlJs = require('sql.js');

async function test() {
  const SQL = await initSqlJs();
  const db = new SQL.Database(fs.readFileSync('D:\\cafe-app-build\\release\\data\\cafe-pos.db'));
  
  const res1 = db.exec("SELECT date('2026-09-11T18:38:08.338Z') as d1, date('2026-09-11T18:38:08.338Z', 'localtime') as d2");
  console.log('Date evaluation:', res1[0].values);

  console.log('With shift_id=14:');
  const res2 = db.exec("SELECT COUNT(*), SUM(total) FROM orders WHERE status != 'cancelled' AND date(created_at) >= date('2026-09-11') AND date(created_at) <= date('2026-09-11') AND shift_id = 14");
  console.log(res2[0].values);

  console.log('Without shift_id (all shifts today):');
  const res3 = db.exec("SELECT COUNT(*), SUM(total) FROM orders WHERE status != 'cancelled' AND date(created_at) >= date('2026-09-11') AND date(created_at) <= date('2026-09-11')");
  console.log(res3[0].values);
}
test();
