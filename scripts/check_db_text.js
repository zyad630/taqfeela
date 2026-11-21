const initSqlJs = require('sql.js');
const fs = require('fs');

initSqlJs().then(SQL => {
  const db = new SQL.Database(fs.readFileSync('cafe-pos.db'));
  const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table'")[0].values.map(v => v[0]);
  let corrupted = 0;
  for (const t of tables) {
    if (t.startsWith('sqlite_')) continue;
    const res = db.exec(`SELECT * FROM "${t}"`);
    if (!res.length) continue;
    const cols = res[0].columns;
    res[0].values.forEach(row => {
      row.forEach((val, idx) => {
        if (typeof val === 'string') {
          if (val.includes('ط§ظ') || val.includes('طھط³') || val.includes('â') || val.includes('\uFFFD')) {
            corrupted++;
            console.log(`Corrupted in table ${t}, col ${cols[idx]}: ${val}`);
          }
        }
      });
    });
  }
  console.log('Total corrupted entries in cafe-pos.db:', corrupted);
});
