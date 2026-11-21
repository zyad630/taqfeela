const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

async function main() {
  const genuine101Path = path.join(process.env.APPDATA, 'cafe-pos', 'cafe-pos.db');
  console.log('Inspecting genuine v1.0.1 database at:', genuine101Path);

  const SQL = await initSqlJs();
  const db = new SQL.Database(fs.readFileSync(genuine101Path));

  const tablesRes = db.exec("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;");
  const tables = tablesRes[0]?.values.map(v => v[0]) || [];
  console.log('Tables in genuine 1.0.1 DB (' + tables.length + '):', tables);

  // Check columns of orders
  const ordersCols = db.exec("PRAGMA table_info(orders);")[0]?.values.map(v => v[1]) || [];
  console.log('Columns in orders table:', ordersCols);

  // Check foreign key violations before upgrade
  db.run('PRAGMA foreign_keys = ON;');
  const fkCheck = db.exec('PRAGMA foreign_key_check;');
  console.log('PRAGMA foreign_key_check on raw 1.0.1 DB:', fkCheck.length > 0 ? fkCheck[0].values : '0 violations');

  // Check actual orders, shifts, categories, products
  const counts = {};
  for (const t of ['categories', 'products', 'orders', 'order_items', 'shifts', 'users', 'expenses', 'customer_debts', 'tables']) {
    try {
      const c = db.exec(`SELECT count(*) FROM ${t}`)[0]?.values[0]?.[0];
      counts[t] = c;
    } catch (e) {
      counts[t] = 'NOT_FOUND';
    }
  }
  console.log('Row counts in genuine 1.0.1 DB:', counts);
}

main().catch(console.error);

