const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');

describe('🪑 Dynamic Sections & Comprehensive Reports Verification', () => {
  const testDbPath = path.join(__dirname, 'test-sections-reports.db');
  let db;

  before(async () => {
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
    db = require('../electron/db');
    await db.init(testDbPath);
  });

  after(() => {
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
  });

  test('1. Sections are seeded with 5 default sections', () => {
    const sections = db.listSections();
    assert.strictEqual(sections.length, 5, `Expected 5 sections, got ${sections.length}`);
    const names = sections.map(s => s.name);
    assert(names.includes('أرضي'), 'Must contain أرضي');
    assert(names.includes('علوي'), 'Must contain علوي');
    assert(names.includes('بارك'), 'Must contain بارك');
    assert(names.includes('عائلات'), 'Must contain عائلات');
    assert(names.includes('بارك شباب'), 'Must contain بارك شباب');
  });

  test('2. Tables are seeded for each section (8, 6, 6, 4, 6 = 30 tables)', () => {
    const tables = db.listTables();
    assert.strictEqual(tables.length, 30, `Expected 30 tables, got ${tables.length}`);

    const ardi = tables.filter(t => t.hall === 'أرضي');
    assert.strictEqual(ardi.length, 8, 'أرضي should have 8 tables');

    const elwi = tables.filter(t => t.hall === 'علوي');
    assert.strictEqual(elwi.length, 6, 'علوي should have 6 tables');

    const park = tables.filter(t => t.hall === 'بارك');
    assert.strictEqual(park.length, 6, 'بارك should have 6 tables');

    const families = tables.filter(t => t.hall === 'عائلات');
    assert.strictEqual(families.length, 4, 'عائلات should have 4 tables');

    const youthPark = tables.filter(t => t.hall === 'بارك شباب');
    assert.strictEqual(youthPark.length, 6, 'بارك شباب should have 6 tables');
  });

  test('3. Admin can add, update, reset tables, and delete a section', () => {
    // Add new section
    const newSec = db.saveSection({ name: 'روف سياحي', sort_order: 6 });
    assert(newSec.id, 'Section should have an ID');
    assert.strictEqual(newSec.name, 'روف سياحي');

    // Reset tables for new section
    const updatedTables = db.resetSectionTables({
      sectionId: newSec.id,
      sectionName: newSec.name,
      tableCount: 5
    });
    const roofTables = updatedTables.filter(t => t.hall === 'روف سياحي');
    assert.strictEqual(roofTables.length, 5, 'Should have 5 tables in روف سياحي');

    // Delete section
    const delRes = db.deleteSection(newSec.id);
    assert(delRes.success);
    const sectionsAfter = db.listSections();
    assert.strictEqual(sectionsAfter.length, 5, 'Should be back to 5 sections');
  });

  test('4. Comprehensive sales and inventory reports execute successfully', () => {
    const salesReport = db.getReportSales();
    assert(salesReport.summary, 'Sales report must include summary');
    assert(Array.isArray(salesReport.topProducts), 'topProducts must be an array');
    assert(Array.isArray(salesReport.dailyBreakdown), 'dailyBreakdown must be an array');
    assert(Array.isArray(salesReport.bySection), 'bySection must be an array');

    const inventoryReport = db.getReportInventory();
    assert(Array.isArray(inventoryReport.allProducts), 'allProducts must be an array');
    assert(Array.isArray(inventoryReport.movements), 'movements must be an array');
    assert(Array.isArray(inventoryReport.movementSummary), 'movementSummary must be an array');
    assert(Array.isArray(inventoryReport.lowStock), 'lowStock must be an array');
  });
});
