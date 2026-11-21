const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

(async () => {
  const SQL = await initSqlJs();

  const dbPaths = [
    'C:/Users/zyad/AppData/Roaming/TaqfeelaPOS/cafe-pos.db',
    'C:/Users/zyad/AppData/Roaming/cafe-pos/cafe-pos.db',
    path.join(__dirname, '../cafe-pos.db')
  ];

  for (const dbPath of dbPaths) {
    if (!fs.existsSync(dbPath)) continue;
    console.log('[CLEANING TEST ORDERS]:', dbPath);

    const buf = fs.readFileSync(dbPath);
    const db = new SQL.Database(buf);

    try {
      // Delete test orders containing security test strings or test item names
      db.run(`
        DELETE FROM order_items 
        WHERE order_id IN (
          SELECT id FROM orders 
          WHERE customer_name LIKE '%DROP TABLE%' 
             OR customer_name LIKE '%<script>%'
             OR notes LIKE '%DROP TABLE%'
             OR id IN (SELECT order_id FROM order_items WHERE product_name LIKE '%صنف تتبع%' OR product_name LIKE '%شاي أمان%' OR product_name LIKE '%كعكة نادرة%')
        )
      `);

      db.run(`
        DELETE FROM orders 
        WHERE customer_name LIKE '%DROP TABLE%' 
           OR customer_name LIKE '%<script>%'
           OR notes LIKE '%DROP TABLE%'
           OR notes LIKE '%صنف تتبع%'
      `);

      // Delete any test debt payments or stock movements related to test items
      db.run("DELETE FROM stock_movements WHERE notes LIKE '%DROP TABLE%' OR notes LIKE '%صنف تتبع%'");

      console.log('Test orders cleaned.');

      const exported = db.export();
      fs.writeFileSync(dbPath, Buffer.from(exported));
      console.log('[SAVED]:', dbPath);
    } catch (e) {
      console.error('Error on DB:', e.message);
    }
  }

  console.log('\n=== DONE: Cleaned all test orders ===');
})();
