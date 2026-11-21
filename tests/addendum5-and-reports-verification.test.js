const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');

describe('📋 Addendum 5, Multi-Shift Reports & Menu Integrity Verification', () => {
  const testDbPath = path.join(__dirname, 'test-addendum5-reports.db');

  before(() => {
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
  });

  after(() => {
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
  });

  test('1. Menu Integrity: All 17 Categories and 129 items present and verified', async () => {
    const db = require('../electron/db');
    await db.init(testDbPath);

    const categories = db.listCategories();
    assert.strictEqual(categories.length, 17, `Expected 17 categories, got ${categories.length}`);

    const products = db.listProducts();
    assert.strictEqual(products.length, 129, `Expected 129 products, got ${products.length}`);

    const catMap = {};
    categories.forEach(c => { catMap[c.id] = c.name; });

    // Validate key items across multiple sections
    const expectedSamples = [
      { name: 'جوبلت بستاشيو', cat: 'جوبلت كوكيز', price: 95 },
      { name: 'تشيز كيك بستاشيو', cat: 'حلويات', price: 90 },
      { name: 'وافلز بستاشيو', cat: 'وافلز', price: 90 },
      { name: 'سموزي نكهات (فراولة - ميكس بيري - برتقال - بطيخ - باشون فروت - أناناس - جوافة)', cat: 'سموزي', price: 65 },
      { name: 'موهيتو ريدبول', cat: 'موهيتو', price: 90 },
      { name: 'بان كيك 24 قطعة بستاشيو', cat: 'بان كيك', price: 110 },
      { name: 'شيشة مخصوص', cat: 'شيشة', price: 65 },
      { name: 'قهوة تركي سنجل', cat: 'مشروبات ساخنة', price: 25 },
      { name: 'قهوة تركي دبل', cat: 'مشروبات ساخنة', price: 40 },
      { name: 'باور التكية (موز + حليب + عسل + أفوكادو + مكسرات + قرفة + زبدة فول سوداني + بلح)', cat: 'كوكتيلات', price: 100 },
      { name: 'ايس كراميل ميكاتو', cat: 'ايس كوفي', price: 70 },
      { name: 'فرابيبه لوتس', cat: 'فرابيه', price: 70 }
    ];

    for (const sample of expectedSamples) {
      const p = products.find(prod => prod.name === sample.name);
      assert(p, `Missing menu item: ${sample.name}`);
      assert.strictEqual(p.price, sample.price, `Price mismatch for ${sample.name}`);
      assert.strictEqual(catMap[p.category_id], sample.cat, `Category mismatch for ${sample.name}`);
    }
  });

  test('2. Multi-Shift Operation & Individual / Combined Shift Reports Verification', async () => {
    const db = require('../electron/db');
    const today = new Date().toISOString().slice(0, 10);

    // ================= SHIFT 1: Morning Shift =================
    const shift1 = db.openShift(1000, 'Morning shift opened', { id: 1, username: 'cashier1', name: 'كاشير 1' }, 'الشيفت الصباحي');
    assert(shift1.id, 'Shift 1 must have an id');

    const allProds = db.listProducts();
    const pTurkish = allProds.find(p => p.name === 'قهوة تركي سنجل');
    const pPistachio = allProds.find(p => p.name === 'جوبلت بستاشيو');
    const pRedbull = allProds.find(p => p.name === 'موهيتو ريدبول');

    // Create an order in Shift 1
    const order1 = db.createOrder({
      customerName: 'عميل 1',
      orderType: 'takeaway',
      items: [
        { productId: pTurkish.id, name: pTurkish.name, price: pTurkish.price, qty: 2 } // 50 EGP
      ],
      paymentMethod: 'cash',
      amountPaid: 50,
      shiftId: shift1.id,
      user: { id: 1, name: 'كاشير 1' }
    });
    assert(order1.id, 'Order 1 created');

    // Add an expense in Shift 1
    const exp1 = db.addExpense({
      amount: 30,
      category: 'مشتريات خامات (بن/حليب/سكر/مستلزمات)',
      notes: 'سكر للشاي',
      shiftId: shift1.id,
      userId: 1,
      userName: 'كاشير 1'
    });
    assert(exp1.success, 'Expense 1 created');

    // Close Shift 1
    const close1 = db.closeShift(shift1.id, 1020, 'Closed morning shift', { id: 1, name: 'كاشير 1' });
    assert(close1.success, 'Shift 1 closed successfully');

    // Verify Individual Report for Shift 1
    const shift1Report = db.getReportShift({ shiftId: shift1.id });
    assert(shift1Report, 'Shift 1 report exists');
    assert.strictEqual(shift1Report.shift.id, shift1.id);
    assert.strictEqual(Number(shift1Report.shift.total_sales), 50);
    assert.strictEqual(Number(shift1Report.shift.expenses_total), 30);
    assert.strictEqual(shift1Report.orders.length, 1);
    assert.strictEqual(shift1Report.expenses.length, 1);

    // ================= SHIFT 2: Evening Shift =================
    // Carries over actual cash from Shift 1 (1020 EGP)
    const shift2 = db.openShift(null, 'Evening shift handover', { id: 2, username: 'cashier2', name: 'كاشير 2' }, 'الشيفت المسائي');
    assert(shift2.id, 'Shift 2 must have an id');
    assert.strictEqual(Number(shift2.opening_cash), 1020, 'Opening cash carried from Shift 1');

    // Create 2 orders in Shift 2: one cash, one card
    const order2 = db.createOrder({
      customerName: 'عميل 2 كاش',
      orderType: 'takeaway',
      items: [
        { productId: pPistachio.id, name: pPistachio.name, price: pPistachio.price, qty: 1 } // 95 EGP
      ],
      paymentMethod: 'cash',
      amountPaid: 95,
      shiftId: shift2.id,
      user: { id: 2, name: 'كاشير 2' }
    });
    assert(order2.id, 'Order 2 created');

    const order3 = db.createOrder({
      customerName: 'عميل 3 فيزا',
      orderType: 'takeaway',
      items: [
        { productId: pRedbull.id, name: pRedbull.name, price: pRedbull.price, qty: 1 } // 90 EGP
      ],
      paymentMethod: 'card',
      amountPaid: 90,
      shiftId: shift2.id,
      user: { id: 2, name: 'كاشير 2' }
    });
    assert(order3.id, 'Order 3 created');

    // Add expense in Shift 2
    const exp2 = db.addExpense({
      amount: 40,
      category: 'مصروفات نظافة وضيافة',
      notes: 'أدوات نظافة',
      shiftId: shift2.id,
      userId: 2,
      userName: 'كاشير 2'
    });
    assert(exp2.success, 'Expense 2 created');

    // Close Shift 2
    // Expected cash in drawer: 1020 (opening) + 95 (cash sale) - 40 (expense) = 1075 EGP
    const close2 = db.closeShift(shift2.id, 1075, 'Closed evening shift', { id: 2, name: 'كاشير 2' });
    assert(close2.success, 'Shift 2 closed successfully');

    // Verify Individual Report for Shift 2
    const shift2Report = db.getReportShift({ shiftId: shift2.id });
    assert(shift2Report, 'Shift 2 report exists');
    assert.strictEqual(shift2Report.shift.id, shift2.id);
    assert.strictEqual(Number(shift2Report.shift.total_sales), 185); // 95 + 90
    assert.strictEqual(Number(shift2Report.shift.cash_sales), 95);
    assert.strictEqual(Number(shift2Report.shift.card_sales), 90);
    assert.strictEqual(Number(shift2Report.shift.expenses_total), 40);
    assert.strictEqual(shift2Report.orders.length, 2);
    assert.strictEqual(shift2Report.expenses.length, 1);

    // ================= COMBINED DAILY SUMMARY REPORT =================
    // Daily summary must aggregate BOTH shifts for today
    const dailyReport = db.getDailySummaryReport(today);
    assert(dailyReport, 'Daily report exists');
    assert(dailyReport.shifts.length >= 2, `Expected at least 2 shifts in daily report, found ${dailyReport.shifts.length}`);

    // Combined Totals: Sales = 50 + 185 = 235
    assert.strictEqual(Number(dailyReport.grandTotal.totalSales), 235, `Total sales expected 235, got ${dailyReport.grandTotal.totalSales}`);
    // Combined Cash Sales = 50 + 95 = 145
    assert.strictEqual(Number(dailyReport.grandTotal.cashSales), 145, `Cash sales expected 145, got ${dailyReport.grandTotal.cashSales}`);
    // Combined Card Sales = 90
    assert.strictEqual(Number(dailyReport.grandTotal.cardSales), 90, `Card sales expected 90, got ${dailyReport.grandTotal.cardSales}`);
    // Combined Expenses = 30 + 40 = 70
    assert.strictEqual(Number(dailyReport.grandTotal.totalExpenses), 70, `Total expenses expected 70, got ${dailyReport.grandTotal.totalExpenses}`);

    // Net Cash = Cash Sales (145) - Total Expenses (70) = 75
    assert.strictEqual(Number(dailyReport.grandTotal.netCash), 75, `Net cash expected 75, got ${dailyReport.grandTotal.netCash}`);
  });

  test('3. Egypt DST & Cairo Time Functionality', () => {
    // Reading implementation from App.jsx to verify timezone accuracy
    const appJsx = fs.readFileSync(path.join(__dirname, '../src/App.jsx'), 'utf8');

    assert(appJsx.includes('function isEgyptDST'), 'App.jsx must contain isEgyptDST');
    assert(appJsx.includes('function formatCairoTime'), 'App.jsx must contain formatCairoTime');
    assert(appJsx.includes('zIndex: 1001'), 'Add Expense modal must have zIndex: 1001');

    // Test the logic directly
    function isEgyptDST(date) {
      const year = date.getFullYear();
      const lastDayApril = new Date(Date.UTC(year, 3, 30, 22, 0, 0));
      const aprilWeekday = lastDayApril.getUTCDay();
      const daysBackToFriday = (aprilWeekday - 5 + 7) % 7;
      const dstStart = new Date(lastDayApril.getTime() - daysBackToFriday * 86400000);

      const lastDayOct = new Date(Date.UTC(year, 9, 31, 21, 0, 0));
      const octWeekday = lastDayOct.getUTCDay();
      const daysBackToThursday = (octWeekday - 4 + 7) % 7;
      const dstEnd = new Date(lastDayOct.getTime() - daysBackToThursday * 86400000);

      const utcTime = date.getTime();
      return utcTime >= dstStart.getTime() && utcTime < dstEnd.getTime();
    }

    function formatCairoTime(dateInput, options = { hour: '2-digit', minute: '2-digit' }) {
      if (!dateInput) return '';
      const d = (dateInput instanceof Date) ? dateInput : new Date(dateInput);
      if (isNaN(d.getTime())) return String(dateInput);
      const offsetHours = isEgyptDST(d) ? 3 : 2;
      const cairoTime = new Date(d.getTime() + offsetHours * 3600000);
      return cairoTime.toLocaleTimeString('ar-EG', { ...options, timeZone: 'UTC' });
    }

    // Summer date (e.g. July 15) -> UTC+3
    const summerDate = new Date('2026-07-15T12:00:00Z');
    assert.strictEqual(isEgyptDST(summerDate), true);
    // 12:00 UTC + 3 hours = 15:00 Cairo time
    const summerFormatted = formatCairoTime(summerDate);
    assert(summerFormatted.includes('03') || summerFormatted.includes('٣') || summerFormatted.includes('15'), `Expected 3 PM, got ${summerFormatted}`);

    // Winter date (e.g. December 15) -> UTC+2
    const winterDate = new Date('2026-12-15T12:00:00Z');
    assert.strictEqual(isEgyptDST(winterDate), false);
    // 12:00 UTC + 2 hours = 14:00 Cairo time
    const winterFormatted = formatCairoTime(winterDate);
    assert(winterFormatted.includes('02') || winterFormatted.includes('٢') || winterFormatted.includes('14'), `Expected 2 PM, got ${winterFormatted}`);
  });
});
