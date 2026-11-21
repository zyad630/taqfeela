const initSqlJs = require('sql.js');
const fs = require('fs');

initSqlJs().then(SQL => {
  const buf = fs.readFileSync('cafe-pos.db');
  const db = new SQL.Database(buf);

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

  function getReportSales({ dateFrom, dateTo, shiftId = null } = {}) {
    const conditions = ["status != 'cancelled'"];
    const oConditions = ["o.status != 'cancelled'"];
    const params = [];
    if (dateFrom) { 
      const dFrom = dateFrom.slice(0, 10);
      conditions.push("substr(created_at, 1, 10) >= ?"); 
      oConditions.push("substr(o.created_at, 1, 10) >= ?");
      params.push(dFrom); 
    }
    if (dateTo) { 
      const dTo = dateTo.slice(0, 10);
      conditions.push("substr(created_at, 1, 10) <= ?"); 
      oConditions.push("substr(o.created_at, 1, 10) <= ?");
      params.push(dTo); 
    }
    if (shiftId) { 
      conditions.push("shift_id = ?"); 
      oConditions.push("o.shift_id = ?"); 
      params.push(shiftId); 
    }
    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const oWhere = oConditions.length ? 'WHERE ' + oConditions.join(' AND ') : '';

    const summary = queryGet(`
      SELECT
        COUNT(*) AS order_count,
        COALESCE(SUM(total), 0) AS total_sales,
        COALESCE(SUM(discount), 0) AS total_discounts,
        COALESCE(SUM(tax), 0) AS total_tax,
        COALESCE(SUM(CASE WHEN payment_method = 'cash' THEN total WHEN payment_method = 'split' THEN cash_amount ELSE 0 END), 0) AS cash_sales,
        COALESCE(SUM(CASE WHEN payment_method = 'card' THEN total WHEN payment_method = 'split' THEN card_amount ELSE 0 END), 0) AS card_sales,
        COALESCE(SUM(CASE WHEN payment_method = 'wallet' THEN total WHEN payment_method = 'split' THEN wallet_amount ELSE 0 END), 0) AS wallet_sales,
        COALESCE(SUM(CASE WHEN order_type = 'dine_in' THEN total ELSE 0 END), 0) AS dine_in_sales,
        COALESCE(SUM(CASE WHEN order_type = 'takeaway' THEN total ELSE 0 END), 0) AS takeaway_sales
      FROM orders ${where}
    `, params);

    const topProducts = queryAll(`
      SELECT oi.product_name, oi.product_id,
        SUM(oi.qty) AS total_qty,
        SUM(oi.total_price) AS total_sales
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      ${oWhere}
      GROUP BY oi.product_id
      ORDER BY total_qty DESC
      LIMIT 20
    `, params);

    const dailyBreakdown = queryAll(`
      SELECT substr(created_at, 1, 10) AS day,
        COUNT(*) AS order_count,
        COALESCE(SUM(total), 0) AS total
      FROM orders ${where}
      GROUP BY day ORDER BY day ASC
    `, params);

    const bySection = queryAll(`
      SELECT COALESCE(t.hall, 'صالة') AS section_name, COALESCE(t.name, 'طاولة') AS table_name,
        COUNT(*) AS order_count,
        COALESCE(SUM(o.total), 0) AS total
      FROM orders o
      LEFT JOIN tables t ON o.table_id = t.id
      ${oWhere ? oWhere + " AND o.order_type = 'dine_in'" : "WHERE o.order_type = 'dine_in'"}
      GROUP BY o.table_id ORDER BY total DESC
    `, params);

    return { summary, topProducts, dailyBreakdown, bySection };
  }

  const res = getReportSales({ dateFrom: '2026-09-06 00:00:00', dateTo: '2026-09-06 23:59:59' });
  console.log('SUCCESS RES:', JSON.stringify(res, null, 2));
});
