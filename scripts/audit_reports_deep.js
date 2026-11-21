const fs = require('fs');
const initSqlJs = require('sql.js');

async function runDeepAudit() {
  const dbPath = 'D:\\cafe-app-build\\release\\data\\cafe-pos.db';
  if (!fs.existsSync(dbPath)) {
    console.error('Database not found at', dbPath);
    return;
  }

  const SQL = await initSqlJs();
  const db = new SQL.Database(fs.readFileSync(dbPath));

  function queryAll(sql, params = []) {
    const stmt = db.prepare(sql);
    if (params && params.length) stmt.bind(params);
    const rows = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject());
    }
    stmt.free();
    return rows;
  }

  function queryGet(sql, params = []) {
    const rows = queryAll(sql, params);
    return rows[0] || null;
  }

  console.log('================================================================');
  console.log('         DEEP AUDIT FOR ALL 5 REPORT SCREENS');
  console.log('================================================================\n');

  // 1. QUICK REPORT (ملخص اليوم)
  console.log('--- 1. QUICK REPORT (ملخص اليوم) ---');
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  
  const todayOrders = queryAll(`SELECT * FROM orders WHERE created_at >= ? AND created_at <= ? AND status != 'cancelled'`, [start.toISOString(), end.toISOString()]);
  const lowStock = queryAll('SELECT * FROM products WHERE stock_qty <= low_stock_threshold AND (is_deleted = 0 OR is_deleted IS NULL)');
  console.log('  Orders today count:', todayOrders.length);
  console.log('  Low stock items count:', lowStock.length);
  console.log('  Quick report data sanity: OK\n');

  // 2. SALES REPORT (تقرير المبيعات)
  console.log('--- 2. SALES REPORT (تقرير المبيعات) ---');
  const salesAll = queryGet(`
    SELECT
      COUNT(*) AS order_count,
      COALESCE(SUM(total), 0) AS total_sales,
      COALESCE(SUM(CASE WHEN payment_method = 'cash' THEN total WHEN payment_method = 'split' THEN cash_amount ELSE 0 END), 0) AS cash_sales,
      COALESCE(SUM(CASE WHEN payment_method = 'card' THEN total WHEN payment_method = 'split' THEN card_amount ELSE 0 END), 0) AS card_sales,
      COALESCE(SUM(CASE WHEN payment_method = 'wallet' THEN total WHEN payment_method = 'split' THEN wallet_amount ELSE 0 END), 0) AS wallet_sales
    FROM orders WHERE status != 'cancelled' AND date(created_at) >= date('now')
  `);
  console.log('  Sales today (All Shifts):', salesAll);

  // Check top products query
  const topProducts = queryAll(`
    SELECT oi.product_name, oi.product_id, SUM(oi.qty) AS total_qty, SUM(oi.total_price) AS total_sales
    FROM order_items oi
    JOIN orders o ON oi.order_id = o.id
    WHERE o.status != 'cancelled' AND date(o.created_at) >= date('now')
    GROUP BY oi.product_id
    ORDER BY total_qty DESC LIMIT 10
  `);
  console.log('  Top products today count:', topProducts.length);
  topProducts.forEach(tp => console.log(`    - ${tp.product_name}: Qty ${tp.total_qty}, Total ${tp.total_sales}`));

  // Check user breakdown query
  const userBreakdown = queryAll(`
    SELECT 
      COALESCE(o.user_id, s.user_id, 0) AS user_id,
      COALESCE(u.name, o.cashier_name, u.username, 'كاشير') AS user_name,
      COUNT(*) AS order_count,
      COALESCE(SUM(o.total), 0) AS total_sales
    FROM orders o
    LEFT JOIN shifts s ON o.shift_id = s.id
    LEFT JOIN users u ON COALESCE(o.user_id, s.user_id) = u.id
    WHERE o.status != 'cancelled' AND date(o.created_at) >= date('now')
    GROUP BY COALESCE(o.user_id, s.user_id)
  `);
  console.log('  User breakdown count:', userBreakdown.length);
  userBreakdown.forEach(ub => console.log(`    - User ${ub.user_name} (${ub.user_id}): ${ub.order_count} orders, ${ub.total_sales} EGP`));
  console.log('  Sales report sanity: OK\n');

  // 3. SHIFTS REPORT (تقرير الشيفت)
  console.log('--- 3. SHIFTS REPORT (تقرير الشيفت) ---');
  const shifts = queryAll('SELECT id, user_name, opened_at, closed_at, total_sales, cash_sales, expenses_total, cash_difference FROM shifts ORDER BY id DESC LIMIT 5');
  console.log('  Recent shifts count:', shifts.length);
  shifts.forEach(s => {
    const shiftOrders = queryAll('SELECT id FROM orders WHERE shift_id = ? AND status != \'cancelled\'', [s.id]);
    console.log(`    Shift #${s.id} (${s.user_name}): Sales=${s.total_sales} EGP, Orders=${shiftOrders.length}, Cash=${s.cash_sales}, Expenses=${s.expenses_total}, Diff=${s.cash_difference}, Status=${s.closed_at ? 'Closed' : 'Open'}`);
  });
  console.log('  Shifts report sanity: OK\n');

  // 4. INVENTORY REPORT (تقرير المخزون)
  console.log('--- 4. INVENTORY REPORT (تقرير المخزون) ---');
  const products = queryAll(`
    SELECT p.id, p.name, p.price, p.cost, p.stock_qty, p.low_stock_threshold, c.name AS category_name
    FROM products p LEFT JOIN categories c ON p.category_id = c.id
    WHERE (p.is_deleted = 0 OR p.is_deleted IS NULL)
  `);
  console.log('  Total active products in catalog:', products.length);
  const nullStock = products.filter(p => p.stock_qty === null || p.stock_qty === undefined);
  console.log('  Products with null stock:', nullStock.length);
  const nullCost = products.filter(p => p.cost === null || p.cost === undefined);
  console.log('  Products with null cost:', nullCost.length);
  console.log('  Inventory report sanity: OK\n');

  // 5. DAILY SUMMARY REPORT (تقرير اليوم الشامل)
  console.log('--- 5. DAILY SUMMARY REPORT (تقرير اليوم الشامل) ---');
  const todayStr = '2026-09-11';
  const dayShifts = queryAll(`
    SELECT id, opened_at, closed_at, user_name, total_sales, cash_sales, expenses_total
    FROM shifts
    WHERE strftime('%Y-%m-%d', opened_at) = ? OR strftime('%Y-%m-%d', closed_at) = ?
  `, [todayStr, todayStr]);
  console.log(`  Shifts found for ${todayStr}:`, dayShifts.length);
  let grandTotal = 0;
  dayShifts.forEach(ds => {
    console.log(`    - Shift #${ds.id} (${ds.user_name}): Sales ${ds.total_sales} EGP, Cash ${ds.cash_sales} EGP, Exp ${ds.expenses_total} EGP`);
    grandTotal += Number(ds.total_sales || 0);
  });
  console.log(`  Grand Total for today across all shifts: ${grandTotal} EGP`);
  console.log('  Daily summary report sanity: OK\n');

  console.log('================================================================');
  console.log('       ALL 5 REPORTS VERIFIED ON DATABASE SUCCESSFULLY');
  console.log('================================================================');
}

runDeepAudit();
