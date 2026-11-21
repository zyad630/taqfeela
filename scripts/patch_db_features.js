const fs = require('fs');
const path = require('path');

const dbFilePath = path.join(__dirname, '..', 'electron', 'db.js');
let code = fs.readFileSync(dbFilePath, 'utf8');

// 1. Add table_carts and shift_adjustments to schema
if (!code.includes('CREATE TABLE IF NOT EXISTS shift_adjustments')) {
  code = code.replace(
    /CREATE TABLE IF NOT EXISTS sections \([\s\S]*?\);/m,
    (match) => `${match}

    CREATE TABLE IF NOT EXISTS table_carts (
      table_id INTEGER PRIMARY KEY,
      cart_data TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS shift_adjustments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shift_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      amount REAL NOT NULL,
      reason TEXT,
      created_by TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY(shift_id) REFERENCES shifts(id)
    );`
  );

  code = code.replace(
    /try\s*{\s*db\.run\("ALTER TABLE shifts ADD COLUMN handover_notes TEXT"\);\s*}\s*catch\s*\(e\)\s*{}/m,
    (match) => `${match}
  try { db.run("ALTER TABLE shifts ADD COLUMN debt_collections REAL DEFAULT 0"); } catch (e) {}
  try { db.run("ALTER TABLE shifts ADD COLUMN refunds_total REAL DEFAULT 0"); } catch (e) {}
  try { db.run("ALTER TABLE shifts ADD COLUMN total_sales REAL DEFAULT 0"); } catch (e) {}
  try {
    db.run(\`CREATE TABLE IF NOT EXISTS table_carts (
      table_id INTEGER PRIMARY KEY,
      cart_data TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )\`);
  } catch (e) {}
  try {
    db.run(\`CREATE TABLE IF NOT EXISTS shift_adjustments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shift_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      amount REAL NOT NULL,
      reason TEXT,
      created_by TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY(shift_id) REFERENCES shifts(id)
    )\`);
  } catch (e) {}`
  );
}

// 2. Add table_carts functions
if (!code.includes('function getTableCarts(')) {
  code = code.replace(
    /function updateTableStatus\(id, status, currentOrderId = null\) {[\s\S]*?return { success: true };\s*}/m,
    `function updateTableStatus(id, status, currentOrderId = null) {
  runSql('UPDATE tables SET status = ?, current_order_id = ? WHERE id = ?', [status, currentOrderId, id], { skipSave: true });
  saveDb(true);
  return { success: true };
}

// Persistent Table Carts in SQLite (Survives power outages and reboots)
function getTableCarts() {
  try {
    const rows = queryAll('SELECT table_id, cart_data FROM table_carts');
    const result = {};
    for (const r of rows) {
      try {
        if (r.cart_data) {
          result[r.table_id] = JSON.parse(r.cart_data);
        }
      } catch (_) {}
    }
    return result;
  } catch (err) {
    console.error('getTableCarts error:', err);
    return {};
  }
}

function saveTableCart(tableId, cartData) {
  if (!tableId) return { success: false };
  try {
    if (!cartData || !cartData.cart || !Array.isArray(cartData.cart) || cartData.cart.length === 0) {
      runSql('DELETE FROM table_carts WHERE table_id = ?', [tableId], { skipSave: true });
      saveDb(true);
      return { success: true };
    }
    const json = JSON.stringify(cartData);
    runSql('INSERT OR REPLACE INTO table_carts (table_id, cart_data, updated_at) VALUES (?, ?, ?)', [
      Number(tableId), json, new Date().toISOString()
    ], { skipSave: true });
    saveDb(true);
    return { success: true };
  } catch (err) {
    console.error('saveTableCart error:', err);
    return { success: false, error: err.message };
  }
}

function saveAllTableCarts(cartsMap) {
  if (!cartsMap || typeof cartsMap !== 'object') return { success: false };
  return withTransaction(() => {
    runSql('DELETE FROM table_carts', [], { skipSave: true });
    for (const [tblId, data] of Object.entries(cartsMap)) {
      if (data && Array.isArray(data.cart) && data.cart.length > 0) {
        runSql('INSERT INTO table_carts (table_id, cart_data, updated_at) VALUES (?, ?, ?)', [
          Number(tblId), JSON.stringify(data), new Date().toISOString()
        ], { skipSave: true });
      }
    }
    return getTableCarts();
  });
}`
  );
}

// 3. Add getPendingShiftBlockers and update closeShift
if (!code.includes('function getPendingShiftBlockers(')) {
  code = code.replace(
    /function closeShift\(shiftId, actualCash = null, notes = '', user = null\) {/m,
    `function getPendingShiftBlockers(shiftId) {
  try {
    const openTablesRow = queryGet(
      "SELECT COUNT(DISTINCT id) as count FROM tables WHERE status != 'available' OR id IN (SELECT table_id FROM table_carts)"
    );
    const openTablesCount = openTablesRow ? (openTablesRow.count || 0) : 0;

    let pendingOrdersCount = 0;
    if (shiftId) {
      const pendingOrdersRow = queryGet(
        "SELECT COUNT(*) as count FROM orders WHERE shift_id = ? AND status NOT IN ('completed', 'cancelled')",
        [shiftId]
      );
      pendingOrdersCount = pendingOrdersRow ? (pendingOrdersRow.count || 0) : 0;
    } else {
      const pendingOrdersRow = queryGet(
        "SELECT COUNT(*) as count FROM orders WHERE status NOT IN ('completed', 'cancelled')"
      );
      pendingOrdersCount = pendingOrdersRow ? (pendingOrdersRow.count || 0) : 0;
    }

    return {
      openTablesCount,
      pendingOrdersCount
    };
  } catch (err) {
    console.error('getPendingShiftBlockers error:', err);
    return { openTablesCount: 0, pendingOrdersCount: 0 };
  }
}

function closeShift(shiftId, actualCash = null, notes = '', user = null, adminOverridePassword = null) {
  const shift = queryGet('SELECT * FROM shifts WHERE id = ?', [shiftId]);
  if (!shift) return { success: false, error: 'الشيفت غير موجود' };
  if (shift.closed_at) {
    return {
      success: true,
      alreadyClosed: true,
      closingCash: shift.actual_cash !== null ? shift.actual_cash : shift.closing_cash,
      expectedCash: shift.closing_cash,
      actualCash: shift.actual_cash,
      cashDifference: shift.cash_difference
    };
  }

  const blockers = getPendingShiftBlockers(shiftId);
  if (blockers.openTablesCount > 0 || blockers.pendingOrdersCount > 0) {
    let overrideOk = false;
    if (adminOverridePassword) {
      const auth = verifyAdminPassword(adminOverridePassword);
      if (auth && auth.success) {
        overrideOk = true;
      }
    }
    if (!overrideOk) {
      return {
        success: false,
        error: 'يوجد طاولات مفتوحة أو فواتير معلقة',
        openTablesCount: blockers.openTablesCount,
        pendingOrdersCount: blockers.pendingOrdersCount,
        requiresAdminOverride: true
      };
    }
  }`
  );
}

// 4. Update currentShift to include adjustments
if (!code.includes('adjustStats')) {
  code = code.replace(
    /const opening = Number\(shift\.opening_cash\) \|\| 0;\s*const expectedCash = Math\.round\(\(opening \+ cashSales \+ debtCashIn - expTotal - cashRefundsOut\) \* 100\) \/ 100;[\s\S]*?expected_cash: expectedCash\s*};/m,
    `// Shift cash adjustments (in/out)
  const adjustStats = queryGet(\`
    SELECT
      COALESCE(SUM(CASE WHEN type = 'in' THEN amount ELSE 0 END), 0) AS total_in,
      COALESCE(SUM(CASE WHEN type = 'out' THEN amount ELSE 0 END), 0) AS total_out
    FROM shift_adjustments
    WHERE shift_id = ?
  \`, [shift.id]);
  const adjustTotal = roundCurrency((Number(adjustStats?.total_in) || 0) - (Number(adjustStats?.total_out) || 0));

  const opening = Number(shift.opening_cash) || 0;
  const expectedCash = Math.round((opening + cashSales + debtCashIn - expTotal - cashRefundsOut + adjustTotal) * 100) / 100;

  return {
    ...shift,
    cash_sales: roundCurrency(cashSales),
    card_sales: roundCurrency(cardSales),
    wallet_sales: roundCurrency(walletSales),
    total_sales: roundCurrency(totalSales),
    total_orders: salesStats?.order_count || 0,
    expenses_total: roundCurrency(expTotal),
    debt_collections: roundCurrency(debtCashIn),
    refunds_total: roundCurrency(totalRefundsAll),
    adjustments_total: adjustTotal,
    adjustments_in: roundCurrency(adjustStats?.total_in || 0),
    adjustments_out: roundCurrency(adjustStats?.total_out || 0),
    expected_cash: expectedCash
  };`
  );
}

// 5. Add addShiftAdjustment & listShiftAdjustments
if (!code.includes('function addShiftAdjustment(')) {
  code = code.replace(
    /function listShifts\(limit = 50, userId = null\) {[\s\S]*?return queryAll\(sql, params\);\s*}/m,
    (match) => `${match}

function addShiftAdjustment({ shiftId, type, amount, reason = '', actor = null } = {}) {
  const sid = Number(shiftId);
  if (!sid) throw new Error('الشيفت غير محدد');
  const shift = queryGet('SELECT * FROM shifts WHERE id = ?', [sid]);
  if (!shift) throw new Error('الشيفت غير موجود');

  if (type !== 'in' && type !== 'out') {
    throw new Error("نوع التسوية غير صالح (يجب أن يكون 'in' أو 'out')");
  }

  const numAmount = finance.money(amount, 'amount');
  if (numAmount <= 0) throw new Error('يجب إدخال مبلغ صحيح أكبر من الصفر');

  const now = new Date().toISOString();
  const actorName = actor?.name || actor?.username || 'الإدارة';
  const cleanReason = String(reason || '').trim();

  return withTransaction(() => {
    const res = runSql(\`
      INSERT INTO shift_adjustments (shift_id, type, amount, reason, created_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    \`, [sid, type, numAmount, cleanReason, actorName, now]);

    // If shift is already closed, update actual_cash and cash_difference directly
    if (shift.closed_at) {
      const delta = type === 'in' ? numAmount : -numAmount;
      const prevActual = Number(shift.actual_cash !== null && shift.actual_cash !== undefined ? shift.actual_cash : shift.closing_cash) || 0;
      const newActual = Math.max(0, roundCurrency(prevActual + delta));
      const prevDiff = Number(shift.cash_difference) || 0;
      const newDiff = roundCurrency(prevDiff + delta);

      runSql(\`
        UPDATE shifts
        SET actual_cash = ?, cash_difference = ?
        WHERE id = ?
      \`, [newActual, newDiff, sid]);
    }

    runSql(\`
      INSERT INTO audit_log (action, entity_type, entity_id, actor_id, actor_name, details, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    \`, [
      'shift_adjustment',
      'shift',
      sid,
      actor?.id || null,
      actorName,
      \`تسوية شيفت (\${type === 'in' ? 'إضافة' : 'خصم/يومية'}): \${numAmount} ج.م - السبب: \${cleanReason || 'بدون سبب'}\`,
      now
    ]);

    return {
      success: true,
      id: res.lastInsertRowid,
      adjustment: queryGet('SELECT * FROM shift_adjustments WHERE id = ?', [res.lastInsertRowid])
    };
  });
}

function listShiftAdjustments(shiftId) {
  const sid = Number(shiftId);
  if (!sid) return [];
  return queryAll('SELECT * FROM shift_adjustments WHERE shift_id = ? ORDER BY id DESC', [sid]);
}`
  );
}

// 6. Update deleteExpense to unconditionally check admin/manager or adminPassword
if (!code.includes('حذف أي مصروف يتطلب صلاحية مدير')) {
  code = code.replace(
    /function deleteExpense\(id, actor = null\) {[\s\S]*?runSql\('DELETE FROM expenses WHERE id = \?', \[id\]\);/m,
    `function deleteExpense(id, actor = null, adminPassword = null) {
  if (!id) return { success: false, error: 'معرف المصروف مطلوب' };
  const exp = queryGet('SELECT * FROM expenses WHERE id = ?', [id]);
  if (!exp) return { success: false, error: 'المصروف غير موجود' };

  if (!actor || (actor.role !== 'admin' && actor.role !== 'manager')) {
    if (!adminPassword) {
      return { success: false, error: 'حذف أي مصروف يتطلب صلاحية مدير أو كلمة مرور المدير' };
    }
    const auth = verifyAdminPassword(adminPassword);
    if (!auth || !auth.success) {
      return { success: false, error: 'كلمة مرور المدير غير صحيحة' };
    }
  }

  runSql('DELETE FROM expenses WHERE id = ?', [id]);`
  );
}

// 7. Update cancelOrder to support adminPasswordVerified
if (!code.includes('adminPasswordVerified')) {
  code = code.replace(
    /function cancelOrder\(id, reason = '', actor = null, refundMethod = 'cash'\) {/m,
    `function cancelOrder(id, reason = '', actor = null, refundMethod = 'cash', adminPasswordVerified = false) {`
  );
}

// 8. Add updateOrder before clearAllOrders
if (!code.includes('function updateOrder(')) {
  code = code.replace(
    /function clearAllOrders\(adminPassword = null\) {/m,
    `function updateOrder(id, payload, actor = null) {
  const order = getOrder(id);
  if (!order) return { success: false, error: 'الفاتورة غير موجودة' };

  return withTransaction(() => {
    const subtotal = Number(order.subtotal) || 0;
    const discount = payload.discount !== undefined ? (Number(payload.discount) || 0) : (Number(order.discount) || 0);
    const tax = payload.tax !== undefined ? (Number(payload.tax) || 0) : (Number(order.tax) || 0);
    const total = Math.max(0, subtotal - discount + tax);

    const paymentMethod = payload.paymentMethod || order.payment_method || 'cash';
    let cashAmount = 0;
    let cardAmount = 0;
    let walletAmount = 0;

    if (paymentMethod === 'cash') {
      cashAmount = total;
    } else if (paymentMethod === 'card') {
      cardAmount = total;
    } else if (paymentMethod === 'wallet') {
      walletAmount = total;
    } else if (paymentMethod === 'split') {
      cashAmount = Number(payload.cashAmount) || 0;
      cardAmount = Number(payload.cardAmount) || 0;
      walletAmount = Number(payload.walletAmount) || 0;
    }

    const customerName = payload.customerName !== undefined ? payload.customerName : (order.customer_name || '');
    const orderType = payload.orderType || order.order_type || 'takeaway';
    const notes = payload.notes !== undefined ? payload.notes : (order.notes || '');

    runSql(\`
      UPDATE orders
      SET customer_name = ?,
          order_type = ?,\r
          discount = ?,\r
          tax = ?,\r
          total = ?,\r
          payment_method = ?,\r
          cash_amount = ?,\r
          card_amount = ?,\r
          wallet_amount = ?,\r
          amount_paid = ?,\r
          notes = ?
      WHERE id = ?
    \`, [
      customerName,
      orderType,
      discount,
      tax,
      total,
      paymentMethod,
      cashAmount,
      cardAmount,
      walletAmount,
      total,
      notes,
      id
    ], { skipSave: true });

    if (order.debt_id) {
      runSql(\`
        UPDATE customer_debts
        SET customer_name = ?,
            total_amount = ?,
            remaining_amount = MAX(0, ? - paid_amount)
        WHERE id = ?
      \`, [customerName, total, total, order.debt_id], { skipSave: true });
    }

    runSql(\`
      INSERT INTO audit_log (action, entity_type, entity_id, actor_id, actor_name, details, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    \`, [
      'update',
      'order',
      id,
      actor?.id || null,
      actor?.name || 'مدير',
      \`تعديل الفاتورة #\${order.invoice_no || id} (إجمالي: \${total} ج.م، طريقة الدفع: \${paymentMethod})\`,
      new Date().toISOString()
    ], { skipSave: true });

    return {
      success: true,
      order: getOrder(id)
    };
  });
}

function clearAllOrders(adminPassword = null) {`
  );
}

// 9. Update getReportShift to include adjustments & add getDailySummaryReport
if (!code.includes('function getDailySummaryReport(')) {
  code = code.replace(
    /return { shift, orders, itemsSummary, expenses, stockConsumed };\s*}/m,
    `  const adjustments = queryAll('SELECT * FROM shift_adjustments WHERE shift_id = ? ORDER BY created_at ASC', [shiftId]);
  const adjustIn = adjustments.filter((a) => a.type === 'in').reduce((s, a) => s + (Number(a.amount) || 0), 0);
  const adjustOut = adjustments.filter((a) => a.type === 'out').reduce((s, a) => s + (Number(a.amount) || 0), 0);
  const totalAdjustments = roundCurrency(adjustIn - adjustOut);
  shift.adjustments_total = totalAdjustments;
  shift.adjustments_in = roundCurrency(adjustIn);
  shift.adjustments_out = roundCurrency(adjustOut);

  return { shift, orders, itemsSummary, expenses, adjustments, stockConsumed };
}

function getDailySummaryReport(dateStr) {
  if (!dateStr) dateStr = new Date().toISOString().slice(0, 10);
  const shiftRows = queryAll(
    "SELECT id FROM shifts WHERE strftime('%Y-%m-%d', opened_at) = ? ORDER BY opened_at ASC",
    [dateStr]
  );

  const shifts = [];
  let grandTotalSales = 0;
  let grandTotalExpenses = 0;
  let grandCashSales = 0;
  let grandWalletSales = 0;
  let grandCardSales = 0;
  let grandNetCash = 0;
  let grandOrdersCount = 0;

  for (const row of shiftRows) {
    const rep = getReportShift({ shiftId: row.id });
    if (!rep || !rep.shift) continue;

    const s = rep.shift;
    const totalSales = Number(s.total_sales || 0);
    const totalExpenses = Number(s.expenses_total || 0);
    const cashSales = Number(s.cash_sales || 0);
    const walletSales = Number(s.wallet_sales || 0);
    const cardSales = Number(s.card_sales || 0);
    const debtCollections = Number(s.debt_collections || 0);
    const netCash = Math.round((cashSales - totalExpenses + debtCollections) * 100) / 100;
    const ordersCount = Array.isArray(rep.orders) ? rep.orders.length : 0;

    grandTotalSales += totalSales;
    grandTotalExpenses += totalExpenses;
    grandCashSales += cashSales;
    grandWalletSales += walletSales;
    grandCardSales += cardSales;
    grandNetCash += netCash;
    grandOrdersCount += ordersCount;

    shifts.push({
      ...rep,
      totalSales,
      totalExpenses,
      cashSales,
      walletSales,
      cardSales,
      netCash,
      ordersCount
    });
  }

  return {
    date: dateStr,
    shifts,
    grandTotal: {
      totalSales: Math.round(grandTotalSales * 100) / 100,
      totalExpenses: Math.round(grandTotalExpenses * 100) / 100,
      cashSales: Math.round(grandCashSales * 100) / 100,
      walletSales: Math.round(grandWalletSales * 100) / 100,
      cardSales: Math.round(grandCardSales * 100) / 100,
      netCash: Math.round(grandNetCash * 100) / 100,
      ordersCount: grandOrdersCount
    }
  };
}`
  );
}

// 10. Update listOrders to support shiftId + userId simultaneously
if (!code.includes("whereClauses.push('o.shift_id = ?');\n    params.push(shiftId);\n  }\n  if (userId) {")) {
  code = code.replace(
    /if \(shiftId\) {\s*whereClauses\.push\('o\.shift_id = \?'\);\s*params\.push\(shiftId\);\s*} else if \(userId\) {/m,
    `if (shiftId) {
    whereClauses.push('o.shift_id = ?');
    params.push(shiftId);
  }
  if (userId) {
    if (shiftId) {
      whereClauses.push('o.user_id = ?');
      params.push(userId);
    } else {`
  );
}

// 11. Add Defense in Depth discount check in createOrder
if (!code.includes('discount is admin-only regardless of caller')) {
  code = code.replace(
    /const shift = currentShift\(\);\s*if \(!shift \|\| \(shiftId && Number\(shiftId\) !== Number\(shift\.id\)\)\) {\s*throw new Error\('لا يوجد شيفت مفتوح حالياً\. يجب فتح شيفت قبل إتمام أي عملية بيع'\);\s*}\s*const setts = getSettings\(\);/m,
    `const shift = currentShift();
  if (!shift || (shiftId && Number(shiftId) !== Number(shift.id))) {
    throw new Error('لا يوجد شيفت مفتوح حالياً. يجب فتح شيفت قبل إتمام أي عملية بيع');
  }

  // Defense in Depth: discount is admin-only regardless of caller
  if (Number(discount) > 0 && (!user || user.role !== 'admin')) {
    return { success: false, error: 'الخصم متاح فقط لصلاحية المدير' };
  }

  const setts = getSettings();`
  );
}

// 12. Update module.exports to export all functions
code = code.replace(
  /module\.exports = {[\s\S]*?};/m,
  `module.exports = {
  init,
  saveDbAtomic,
  saveDb,
  roundCurrency,
  withTransaction,
  listProducts,
  saveProduct,
  deleteProduct,
  listStockMovements,
  listAuditLog,
  listCategories,
  saveCategory,
  deleteCategory,
  listSections,
  saveSection,
  deleteSection,
  resetSectionTables,
  listTables,
  saveTable,
  deleteTable,
  updateTableStatus,
  getTableCarts,
  saveTableCart,
  saveAllTableCarts,
  resetTables,
  currentShift,
  openShift,
  closeShift,
  getPendingShiftBlockers,
  listShifts,
  addShiftAdjustment,
  listShiftAdjustments,
  getUserShiftIds,
  listUsers,
  getUser,
  saveUser,
  deleteUser,
  loginUser,
  changePassword,
  resetAdminPassword,
  getUserAttendanceReports,
  getMonthlyPayroll,
  listEmployeeAdjustments,
  addEmployeeAdjustment,
  deleteEmployeeAdjustment,
  listCustomers,
  getCustomer,
  getCustomerDebts,
  listDebts,
  listDebtsGroupedByCustomer,
  payDebt,
  payCustomerDebtsFIFO,
  deleteDebt,
  verifyAdminPassword,
  addExpense,
  updateExpense,
  deleteExpense,
  listExpenses,
  createOrder,
  getOrder,
  listOrders,
  updateOrder,
  cancelOrder,
  clearAllOrders,
  todaySales,
  getDashboardStats,
  getReportSales,
  getReportInventory,
  getReportShift,
  getDailySummaryReport,
  getSettings,
  saveSettings,
  createBackup,
  restoreBackup,
  exportOrdersCsv,
  exportPayrollCsv,
  exportDailySalesCsv,
  reorderCategories,
  systemReset,
  exportOrdersExcel,
  exportPayrollExcel,
  exportDailySalesExcel,
  getMachineId,
  verifyLicenseKey,
  getLicenseStatus,
  activateLicense
};`
);

fs.writeFileSync(dbFilePath, code, 'utf8');
console.log('Successfully patched electron/db.js! Total lines:', code.split('\n').length);
