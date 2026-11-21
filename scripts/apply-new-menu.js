const path = require('path');
const fs = require('fs');
const initSqlJs = require('sql.js');
const menuData = require('./menuData');

async function applyMenuToDb(dbFilePath) {
  if (!fs.existsSync(dbFilePath)) {
    console.log(`[SKIP] Database file does not exist: ${dbFilePath}`);
    return;
  }

  console.log(`\n========================================`);
  console.log(`Applying new menu to: ${dbFilePath}`);
  console.log(`========================================`);

  // 1. Create a safe backup before modifying
  const backupPath = `${dbFilePath}.backup-before-menu-update-${Date.now()}`;
  fs.copyFileSync(dbFilePath, backupPath);
  console.log(`Backup saved to: ${backupPath}`);

  // 2. Load DB
  const SQL = await initSqlJs();
  const fileBuffer = fs.readFileSync(dbFilePath);
  const db = new SQL.Database(fileBuffer);

  // 3. Clear old categories and products
  // We disable foreign key checks during replacement to preserve order history
  db.run('PRAGMA foreign_keys = OFF;');
  db.run('BEGIN TRANSACTION;');

  try {
    // Delete existing products and categories
    db.run('DELETE FROM products;');
    db.run('DELETE FROM categories;');
    db.run('DELETE FROM sqlite_sequence WHERE name IN ("products", "categories");');

    // Insert new categories
    const catMap = {};
    for (const cat of menuData.categories) {
      db.run('INSERT INTO categories (id, name, icon, sort_order) VALUES (?, ?, ?, ?);', [
        cat.id,
        cat.name,
        cat.icon || '☕',
        cat.sort_order || cat.id
      ]);
      catMap[cat.id] = cat.id;
    }

    // Insert new products
    let insertedProducts = 0;
    for (const prod of menuData.products) {
      db.run(`
        INSERT INTO products (name, price, cost, category_id, stock_qty, low_stock_threshold, is_deleted)
        VALUES (?, ?, ?, ?, ?, ?, 0);
      `, [
        prod.name,
        prod.price,
        prod.cost || Math.round(prod.price * 0.35),
        prod.category_id,
        prod.stock_qty || 100,
        prod.low_stock_threshold || 10
      ]);
      insertedProducts++;
    }

    // Ensure settings table has bar_printer_name
    db.run('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?);', ['bar_printer_name', '']);
    db.run('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?);', ['printer_name', '']);

    db.run('COMMIT;');
    db.run('PRAGMA foreign_keys = ON;');

    // 4. Save atomic
    const updatedBuffer = Buffer.from(db.export());
    const tmpPath = `${dbFilePath}.tmp-${Date.now()}`;
    fs.writeFileSync(tmpPath, updatedBuffer);
    fs.renameSync(tmpPath, dbFilePath);

    console.log(`SUCCESS: Inserted ${menuData.categories.length} categories and ${insertedProducts} products into ${dbFilePath}!`);
  } catch (err) {
    db.run('ROLLBACK;');
    console.error(`ERROR updating ${dbFilePath}:`, err);
    throw err;
  }
}

async function main() {
  const appData = process.env.APPDATA || '';
  const targets = [
    path.join(__dirname, '../cafe-pos.db'),
    path.join(appData, 'TaqfeelaPOS/cafe-pos.db'),
    path.join(appData, 'cafe-pos/cafe-pos.db')
  ];

  for (const target of targets) {
    if (fs.existsSync(target)) {
      await applyMenuToDb(target);
    }
  }

  console.log('\n✅ All database files successfully updated with the new menu!');
}

main().catch((err) => {
  console.error('Fatal error in menu update script:', err);
  process.exit(1);
});
