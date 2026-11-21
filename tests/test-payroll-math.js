/**
 * Payroll and Attendance Calculation Behavioral Test Suite (B7)
 * tests/test-payroll-math.js
 * 
 * Verifies:
 * 1. Daily rate calculation: round(baseSalary / 30, 2)
 * 2. Absence deductions: absenceDays * dailyRate
 * 3. Penalties deduction: sum(penalties)
 * 4. Bonuses addition: sum(bonuses)
 * 5. Net salary calculation: max(0, base - totalDeductions + bonuses)
 * 6. Attendance report generation: linking shifts to users, filtering empty shifts
 * 7. Employee adjustments CRUD (add, list, delete)
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

function loadIsolatedDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cafe-b7-payroll-'));
  const original = Module._load;
  Module._load = function(request, parent, isMain) {
    if (request === 'electron') return { app: { getPath: () => dir } };
    return original.call(this, request, parent, isMain);
  };
  process.env.NODE_ENV = 'test';
  delete require.cache[require.resolve('../electron/db')];
  const db = require('../electron/db');
  Module._load = original;
  return { db, dir };
}

test('B7: Employee Payroll and Attendance Calculations', async (t) => {
  const { db, dir } = loadIsolatedDb();
  await db.init();
  db.setupInitialAdmin('AdminPass123!');
  const admin = db.loginUser('admin', 'AdminPass123!');

  // Create test employees with specific salaries
  // Employee 1: Base salary 6000 EGP (daily rate = 200.00)
  const emp1Res = db.saveUser({
    username: 'cashier_ahmed',
    name: 'أحمد محمود',
    password: 'Password123!',
    role: 'cashier',
    salary: 6000,
    phone: '01011112222'
  });
  const emp1Id = emp1Res.id;

  // Employee 2: Base salary 3000 EGP (daily rate = 100.00)
  const emp2Res = db.saveUser({
    username: 'barista_ali',
    name: 'علي حسن',
    password: 'Password123!',
    role: 'cashier',
    salary: 3000,
    phone: '01033334444'
  });
  const emp2Id = emp2Res.id;

  const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM

  // -------------------------------------------------------------
  // Test 1: Daily Rate and Base Payroll Calculation
  // -------------------------------------------------------------
  await t.test('1. Baseline payroll without adjustments', () => {
    const payroll = db.getMonthlyPayroll(currentMonth);
    const rec1 = payroll.records.find(p => p.userId === emp1Id);
    const rec2 = payroll.records.find(p => p.userId === emp2Id);

    assert.ok(rec1, 'Employee 1 must appear in payroll');
    assert.strictEqual(rec1.baseSalary, 6000);
    assert.strictEqual(rec1.dailyRate, 200.00);
    assert.strictEqual(rec1.totalDeductions, 0);
    assert.strictEqual(rec1.bonusesTotal, 0);
    assert.strictEqual(rec1.netSalary, 6000);

    assert.ok(rec2, 'Employee 2 must appear in payroll');
    assert.strictEqual(rec2.baseSalary, 3000);
    assert.strictEqual(rec2.dailyRate, 100.00);
    assert.strictEqual(rec2.netSalary, 3000);
  });

  // -------------------------------------------------------------
  // Test 2: Absence Deductions Math
  // -------------------------------------------------------------
  await t.test('2. Absence deductions: days_count * dailyRate', () => {
    // Record 2 days absence for Employee 1 (2 * 200 = 400 EGP deduction)
    db.addEmployeeAdjustment({
      userId: emp1Id,
      type: 'absence',
      daysCount: 2,
      date: `${currentMonth}-05`,
      reason: 'غياب بدون إذن',
      createdBy: 'المدير'
    });

    const payroll = db.getMonthlyPayroll(currentMonth);
    const rec1 = payroll.records.find(p => p.userId === emp1Id);

    assert.strictEqual(rec1.absenceDays, 2);
    assert.strictEqual(rec1.absenceDeduction, 400.00);
    assert.strictEqual(rec1.totalDeductions, 400.00);
    assert.strictEqual(rec1.netSalary, 5600.00);
  });

  // -------------------------------------------------------------
  // Test 3: Penalties and Bonuses Math
  // -------------------------------------------------------------
  await t.test('3. Penalties and bonuses affect net salary accurately', () => {
    // Add 150 EGP penalty for Employee 1
    db.addEmployeeAdjustment({
      userId: emp1Id,
      type: 'penalty',
      amount: 150,
      date: `${currentMonth}-10`,
      reason: 'عجز شيفت غير مبرر',
      createdBy: 'المدير'
    });

    // Add 300 EGP bonus for Employee 1
    db.addEmployeeAdjustment({
      userId: emp1Id,
      type: 'bonus',
      amount: 300,
      date: `${currentMonth}-15`,
      reason: 'مكافأة تميز في المبيعات',
      createdBy: 'المدير'
    });

    const payroll = db.getMonthlyPayroll(currentMonth);
    const rec1 = payroll.records.find(p => p.userId === emp1Id);

    // Deductions: 400 (absence) + 150 (penalty) = 550
    // Bonus: 300
    // Net: 6000 - 550 + 300 = 5750
    assert.strictEqual(rec1.absenceDeduction, 400.00);
    assert.strictEqual(rec1.penaltiesTotal, 150.00);
    assert.strictEqual(rec1.totalDeductions, 550.00);
    assert.strictEqual(rec1.bonusesTotal, 300.00);
    assert.strictEqual(rec1.netSalary, 5750.00);
  });

  // -------------------------------------------------------------
  // Test 4: Net Salary Floor (Cannot be negative)
  // -------------------------------------------------------------
  await t.test('4. Net salary cannot be negative when deductions exceed salary', () => {
    // Add massive penalty to Employee 2 (exceeding 3000)
    db.addEmployeeAdjustment({
      userId: emp2Id,
      type: 'penalty',
      amount: 5000,
      date: `${currentMonth}-08`,
      reason: 'تلفيات جسيمة في المعدات',
      createdBy: 'المدير'
    });

    const payroll = db.getMonthlyPayroll(currentMonth);
    const rec2 = payroll.records.find(p => p.userId === emp2Id);

    assert.strictEqual(rec2.penaltiesTotal, 5000.00);
    assert.strictEqual(rec2.totalDeductions, 5000.00);
    assert.strictEqual(rec2.netSalary, 0, 'Net salary floor MUST be 0, never negative');
  });

  // -------------------------------------------------------------
  // Test 5: Attendance Shift Linkage and Empty Shift Filtering
  // -------------------------------------------------------------
  await t.test('5. Attendance tracking counts real shifts and ignores empty ones', () => {
    // Open and close a REAL shift with sales for Employee 1
    const shift1 = db.openShift(100, 'شيفت عمل حقيقي', { id: emp1Id, name: 'أحمد محمود' });
    const p = db.listProducts().find(x => !x.is_deleted);
    db.createOrder({
      shiftId: shift1.id,
      items: [{ id: p.id, name: p.name, price: p.price, qty: 1 }],
      paymentMethod: 'cash',
      user: { id: emp1Id, name: 'أحمد محمود' }
    });
    db.closeShift(shift1.id, 100 + p.price, 'إغلاق شيفت عمل', { id: emp1Id, name: 'أحمد محمود' });

    // Open and close an EMPTY zero shift (0 opening, 0 closing, 0 sales)
    const emptyShift = db.openShift(0, 'شيفت فارغ بالخطأ', { id: emp1Id, name: 'أحمد محمود' });
    db.closeShift(emptyShift.id, 0, 'إغلاق فوري', { id: emp1Id, name: 'أحمد محمود' });

    const attendance = db.getUserAttendanceReports(currentMonth);
    const emp1Att = attendance.userSummaries.find(a => a.userId === emp1Id);

    assert.ok(emp1Att, 'Employee 1 must appear in attendance report');
    // Only the real non-empty shift should be counted
    assert.strictEqual(emp1Att.totalShifts, 1, 'Empty zero-sales shifts must be excluded from attendance count');
  });

  // -------------------------------------------------------------
  // Test 6: Deletion of Employee Adjustments
  // -------------------------------------------------------------
  await t.test('6. Delete employee adjustment updates payroll immediately', () => {
    const listBefore = db.listEmployeeAdjustments(emp2Id);
    assert.strictEqual(listBefore.length, 1);
    const penId = listBefore[0].id;

    // Delete penalty
    const delRes = db.deleteEmployeeAdjustment(penId);
    assert.strictEqual(delRes.success, true);

    const listAfter = db.listEmployeeAdjustments(emp2Id);
    assert.strictEqual(listAfter.length, 0);

    // Net salary should restore to full base salary 3000
    const payroll = db.getMonthlyPayroll(currentMonth);
    const rec2 = payroll.records.find(p => p.userId === emp2Id);
    assert.strictEqual(rec2.netSalary, 3000.00);
  });

  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
});
