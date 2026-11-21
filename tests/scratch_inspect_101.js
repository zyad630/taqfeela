const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

(async () => {
  const SQL = await initSqlJs();
  const dbPath = path.join(process.env.APPDATA, 'cafe-pos', 'cafe-pos.db');
  const buf = fs.readFileSync(dbPath);
  const db = new SQL.Database(buf);
  const userVer = db.exec('PRAGMA user_version')[0].values[0][0];
  console.log('user_version:', userVer);
  const tbls = db.exec("SELECT name FROM sqlite_master WHERE type='table'")[0].values.map(r => r[0]);
  console.log('tables:', tbls);
  const counts = {};
  for (const t of tbls) {
    if (t === 'sqlite_sequence') continue;
    counts[t] = db.exec('SELECT count(*) FROM ' + t)[0].values[0][0];
  }
  console.log('counts:', counts);
  try {
    const settings = db.exec("SELECT key, value FROM settings")[0].values;
    console.log('settings:', settings);
  } catch (e) {
    console.log('settings error:', e.message);
  }
})();
