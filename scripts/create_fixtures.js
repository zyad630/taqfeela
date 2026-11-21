const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

async function createFixtures() {
  const fixturesDir = path.join(__dirname, '..', 'tests', 'fixtures');
  if (!fs.existsSync(fixturesDir)) {
    fs.mkdirSync(fixturesDir, { recursive: true });
  }

  const SQL = await initSqlJs();

  // 1. Fixture: v1.0.1 Anonymized genuine database
  const genuineSource = path.join(process.env.APPDATA, 'cafe-pos', 'cafe-pos.db');
  if (fs.existsSync(genuineSource)) {
    const fileBuf = fs.readFileSync(genuineSource);
    const db101 = new SQL.Database(fileBuf);
    try {
      db101.run("UPDATE users SET phone = '01000000000' WHERE phone IS NOT NULL AND phone != ''");
      db101.run("UPDATE customer_debts SET customer_phone = '01000000000' WHERE customer_phone IS NOT NULL AND customer_phone != ''");
      db101.run("UPDATE orders SET customer_phone = '01000000000' WHERE customer_phone IS NOT NULL AND customer_phone != ''");
    } catch (_) {}
    const v101Path = path.join(fixturesDir, 'v1.0.1-anonymized.db');
    fs.writeFileSync(v101Path, Buffer.from(db101.export()));
    console.log(`✅ Successfully created fixture: ${v101Path} (${fs.statSync(v101Path).size} bytes)`);
    db101.close();
  }

  // 2. Fixture: v1.0.0 Legacy database (schema before 1.0.1, user_version = 0)
  const legacyDb = new SQL.Database();
  legacyDb.run('PRAGMA user_version = 0;');
  legacyDb.run(`
    CREATE TABLE categories (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE products (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, price REAL NOT NULL, category_id INTEGER);
    CREATE TABLE tables (id INTEGER PRIMARY KEY AUTOINCREMENT, number TEXT NOT NULL, name TEXT NOT NULL, capacity INTEGER DEFAULT 4, status TEXT DEFAULT 'available', current_order_id INTEGER, hall TEXT DEFAULT 'indoor');
    CREATE TABLE shifts (id INTEGER PRIMARY KEY AUTOINCREMENT, opened_at TEXT NOT NULL, closed_at TEXT, opening_cash REAL DEFAULT 0, closing_cash REAL);
    CREATE TABLE expenses (id INTEGER PRIMARY KEY AUTOINCREMENT, shift_id INTEGER, amount REAL NOT NULL, category TEXT DEFAULT 'مشتريات خامات', notes TEXT, created_at TEXT NOT NULL);
    CREATE TABLE orders (id INTEGER PRIMARY KEY AUTOINCREMENT, invoice_no TEXT, shift_id INTEGER, table_id INTEGER, created_at TEXT NOT NULL, subtotal REAL NOT NULL, total REAL NOT NULL, status TEXT DEFAULT 'completed');
    CREATE TABLE order_items (id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER NOT NULL, product_id INTEGER NOT NULL, qty INTEGER NOT NULL, unit_price REAL NOT NULL);
    CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);
    CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL, name TEXT NOT NULL, password TEXT NOT NULL, role TEXT DEFAULT 'cashier', created_at TEXT NOT NULL);
    CREATE TABLE customer_debts (id INTEGER PRIMARY KEY AUTOINCREMENT, customer_name TEXT NOT NULL, total_amount REAL NOT NULL, paid_amount REAL DEFAULT 0, remaining_amount REAL NOT NULL, status TEXT DEFAULT 'unpaid', created_at TEXT NOT NULL);
    CREATE TABLE debt_payments (id INTEGER PRIMARY KEY AUTOINCREMENT, debt_id INTEGER NOT NULL, amount REAL NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE invoice_sequence (id INTEGER PRIMARY KEY, next_number INTEGER NOT NULL);
  `);
  
  legacyDb.run(`
    INSERT INTO categories (name) VALUES ('مشروبات ساخنة'), ('مشروبات باردة');
    INSERT INTO products (name, price, category_id) VALUES ('قهوة تركي', 25, 1), ('شاي', 15, 1), ('عصير برتقال', 35, 2);
    INSERT INTO tables (number, name, hall) VALUES ('1', 'طاولة 1', 'أرضي'), ('2', 'طاولة 2', 'أرضي');
    INSERT INTO shifts (opened_at, opening_cash) VALUES ('2026-01-01T08:00:00.000Z', 500);
    INSERT INTO orders (invoice_no, shift_id, table_id, created_at, subtotal, total) VALUES ('1', 1, 1, '2026-01-01T09:00:00.000Z', 50, 50);
    INSERT INTO order_items (order_id, product_id, qty, unit_price) VALUES (1, 1, 2, 25);
    INSERT INTO expenses (shift_id, amount, notes, created_at) VALUES (1, 100, 'شراء بن', '2026-01-01T10:00:00.000Z');
    INSERT INTO users (username, name, password, role, created_at) VALUES ('admin', 'المدير', '$2a$10$Xo7GPx.fakehashforadminuserpassword123', 'admin', '2026-01-01T08:00:00.000Z');
    INSERT INTO invoice_sequence (id, next_number) VALUES (1, 2);
    INSERT INTO settings (key, value) VALUES ('cafe_name', 'مقهى تجريبي 1.0.0'), ('printer_name', 'POS-80');
  `);

  const v100Path = path.join(fixturesDir, 'v1.0.0-legacy.db');
  fs.writeFileSync(v100Path, Buffer.from(legacyDb.export()));
  console.log(`✅ Successfully created fixture: ${v100Path} (${fs.statSync(v100Path).size} bytes)`);
  legacyDb.close();

  // 3. Fixture: v1.0.2 Baseline database
  const dbModule = require('../electron/db');
  const tempV102Path = path.join(fixturesDir, 'temp-v102.db');
  if (fs.existsSync(tempV102Path)) fs.unlinkSync(tempV102Path);
  await dbModule.init(tempV102Path);
  const v102Path = path.join(fixturesDir, 'v1.0.2-baseline.db');
  if (fs.existsSync(v102Path)) fs.unlinkSync(v102Path);
  fs.copyFileSync(tempV102Path, v102Path);
  try { fs.unlinkSync(tempV102Path); } catch (_) {}
  console.log(`✅ Successfully created fixture: ${v102Path} (${fs.statSync(v102Path).size} bytes)`);
}

createFixtures().catch(err => {
  console.error('Fatal fixture creation error:', err);
  process.exit(1);
});
