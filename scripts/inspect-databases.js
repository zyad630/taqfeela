const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

async function inspectDb(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const stat = fs.statSync(filePath);
  const SQL = await initSqlJs();
  const db = new SQL.Database(fs.readFileSync(filePath));
  let version = null;
  try { version = db.exec("SELECT value FROM settings WHERE key = 'app_version'")[0]?.values[0]?.[0]; } catch (_) {}
  let tables = [];
  try { tables = db.exec("SELECT name FROM sqlite_master WHERE type='table'")[0]?.values.map(v => v[0]); } catch (_) {}
  let ordersCount = 0;
  try { ordersCount = db.exec('SELECT count(*) FROM orders')[0]?.values[0]?.[0] || 0; } catch (_) {}
  let shiftsCount = 0;
  try { shiftsCount = db.exec('SELECT count(*) FROM shifts')[0]?.values[0]?.[0] || 0; } catch (_) {}
  return { path: filePath, size: stat.size, mtime: stat.mtime, version, ordersCount, shiftsCount, tableCount: tables.length };
}

(async () => {
  const candidatePaths = [
    path.join(process.env.APPDATA, 'TaqfeelaPOS', 'cafe-pos.db'),
    path.join(process.env.APPDATA, 'cafe-pos', 'cafe-pos.db'),
    path.resolve('backup_pre_hardening_20261015/cafe-pos.db'),
    path.resolve('29-9/data/cafe-pos.db'),
    path.resolve('test_data/cafe-pos.db'),
    path.resolve('cafe-pos.db')
  ];

  for (const p of candidatePaths) {
    const res = await inspectDb(p);
    if (res) console.log(JSON.stringify(res, null, 2));
    else console.log('Not found:', p);
  }
})();

