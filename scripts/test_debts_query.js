const initSqlJs = require('sql.js');

(async () => {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  db.run('CREATE TABLE customer_debts (id INTEGER PRIMARY KEY, customer_id INT, customer_name TEXT, customer_phone TEXT, total_amount REAL, paid_amount REAL, remaining_amount REAL, status TEXT);');
  
  db.run("INSERT INTO customer_debts VALUES (1, 1, 'أحمد', '', 100, 0, 100, 'unpaid');");
  db.run("INSERT INTO customer_debts VALUES (2, 2, 'محمد', '', 200, 0, 200, 'unpaid');");
  db.run("INSERT INTO customer_debts VALUES (3, 3, 'علي', '', 300, 0, 300, 'unpaid');");

  // Case 1: normal with cleanName
  let stmt = db.prepare('SELECT * FROM customer_debts WHERE (customer_name = ? OR (customer_phone = ? AND customer_phone != "")) AND status != "paid"');
  stmt.bind(['أحمد', '']);
  let res = [];
  while(stmt.step()) res.push(stmt.getAsObject());
  console.log('Test 1 (Ahmed):', res.length, 'records');

  // Case 2: What if cleanName is 'عميل نوتة'?
  db.run("INSERT INTO customer_debts VALUES (4, NULL, 'عميل نوتة', '', 50, 0, 50, 'unpaid');");
  db.run("INSERT INTO customer_debts VALUES (5, NULL, 'عميل نوتة', '', 70, 0, 70, 'unpaid');");
  stmt = db.prepare('SELECT * FROM customer_debts WHERE (customer_name = ? OR (customer_phone = ? AND customer_phone != "")) AND status != "paid"');
  stmt.bind(['عميل نوتة', '']);
  res = [];
  while(stmt.step()) res.push(stmt.getAsObject());
  console.log('Test 2 (Default customer):', res.length, 'records');

  // Case 3: What if customerPhone is null?
  stmt = db.prepare('SELECT * FROM customer_debts WHERE (customer_name = ? OR (customer_phone = ? AND customer_phone != "")) AND status != "paid"');
  stmt.bind(['أحمد', null]);
  res = [];
  while(stmt.step()) res.push(stmt.getAsObject());
  console.log('Test 3 (phone is null):', res.length, 'records');

  // Case 4: What if cleanName is undefined or null or empty?
  // If cleanName is '' or someone passed customer_id
})();
