const initSqlJs = require('sql.js');
const fs = require('fs');

async function inspectDb(dbPath, label) {
  console.log(`\n================== DB: ${label} (${dbPath}) ==================`);
  if (!fs.existsSync(dbPath)) {
    console.log('Does not exist.');
    return;
  }
  const SQL = await initSqlJs();
  const filebuffer = fs.readFileSync(dbPath);
  const db = new SQL.Database(filebuffer);

  // List all tables
  const tablesRes = db.exec("SELECT name FROM sqlite_master WHERE type='table'");
  if (!tablesRes.length) {
    console.log('No tables found');
    return;
  }
  const tableNames = tablesRes[0].values.map(v => v[0]);
  console.log('Tables:', tableNames.join(', '));

  for (const t of tableNames) {
    if (t.startsWith('sqlite_')) continue;
    const res = db.exec(`SELECT * FROM "${t}" LIMIT 5`);
    console.log(`\n--- Table: ${t} ---`);
    if (res.length > 0) {
      const columns = res[0].columns;
      console.log('Columns:', columns.join(' | '));
      res[0].values.forEach((row, idx) => {
        console.log(`Row ${idx+1}:`, JSON.stringify(row));
      });
    } else {
      console.log('(Empty)');
    }
  }
}

async function main() {
  await inspectDb('cafe-pos.db', 'Workspace DB');
  await inspectDb('C:/Users/zyad/AppData/Roaming/cafe-pos/cafe-pos.db', 'Roaming DB (Electron AppData)');
}

main().catch(console.error);
