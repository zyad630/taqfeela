/**
 * comprehensive-suite-2-inventory-and-menu.test.js
 * تغطية شاملة لـ: الأصناف، التصنيفات، الأقسام، المخزون، الحركات المخزنية، حالات الحذف الناعم والتعديل
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

function loadDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cafe-comp-suite2-'));
  const original = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === 'electron') return { app: { getPath: () => dir } };
    if (request === './finance' && parent?.filename.endsWith('db.js'))
      return original.call(this, path.join(__dirname, '..', 'electron', 'finance'), parent, isMain);
    if (request === './menuData' && parent?.filename.endsWith('db.js'))
      return original.call(this, path.join(__dirname, '..', 'electron', 'menuData'), parent, isMain);
    return original.call(this, request, parent, isMain);
  };
  process.env.NODE_ENV = 'test';
  delete require.cache[require.resolve('../electron/db')];
  const db = require('../electron/db');
  Module._load = original;
  return { db, dir };
}

describe('COMPREHENSIVE SUITE 2: Inventory, Categories, Sections, & Stock Lifecycle', () => {

  // ================= 1. إدارة التصنيفات (Categories) =================
  test('1.1: Category CRUD, ordering, and validation', async () => {
    const { db } = loadDb();
    await db.init();

    // جلب التصنيفات الافتراضية
    const initialCategories = db.listCategories();
    assert.ok(initialCategories.length > 0, 'Categories must be seeded');

    // إضافة تصنيف جديد
    const newCat = db.saveCategory({ name: 'مشروبات غازية', icon: '🥤', sort_order: 99 });
    assert.ok(newCat?.id, 'Category must be assigned an ID');
    assert.strictEqual(newCat.name, 'مشروبات غازية');

    // تعديل التصنيف
    const updatedCat = db.saveCategory({ id: newCat.id, name: 'مشروبات طاقة وغازية', icon: '⚡' });
    assert.strictEqual(updatedCat.name, 'مشروبات طاقة وغازية');

    // إعادة ترتيب التصنيفات
    const reorderRes = db.reorderCategories([newCat.id, initialCategories[0].id]);
    assert.ok(Array.isArray(reorderRes) && reorderRes.length > 0, 'Reorder categories returns updated list');

    // حذف التصنيف
    const delRes = db.deleteCategory(newCat.id);
    assert.strictEqual(delRes.success, true);
    assert.strictEqual(db.listCategories().some(c => c.id === newCat.id), false);
  });

  // ================= 2. إدارة الأقسام والطاولات (Sections & Tables) =================
  test('2.1: Section and Table lifecycle', async () => {
    const { db } = loadDb();
    await db.init();

    // إنشاء قسم جديد
    const section = db.saveSection({ name: 'التراس الخارجي', sort_order: 1 });
    assert.ok(section?.id);

    // إنشاء طاولات في هذا القسم (الربط يتم عبر اسم الصالة hall)
    const t1 = db.saveTable({ number: 'T-01', name: 'طاولة تراس 1', hall: section.name, capacity: 4 });
    const t2 = db.saveTable({ number: 'T-02', name: 'طاولة تراس 2', hall: section.name, capacity: 6 });
    assert.ok(t1?.id && t2?.id);

    // التحقق من قائمة الطاولات
    const tables = db.listTables();
    assert.ok(tables.some(t => t.id === t1.id && t.hall === section.name));

    // تحديث حالة الطاولة
    db.updateTableStatus(t1.id, 'occupied');
    assert.strictEqual(db.listTables().find(t => t.id === t1.id).status, 'occupied');

    // إعادة حالة الطاولة إلى available
    db.updateTableStatus(t1.id, 'available', null, true);
    assert.strictEqual(db.listTables().find(t => t.id === t1.id).status, 'available');

    // حذف طاولة
    const delT = db.deleteTable(t2.id);
    assert.strictEqual(delT.success, true);

    // حذف القسم
    const delSec = db.deleteSection(section.id);
    assert.strictEqual(delSec.success, true);
  });

  // ================= 3. إدارة المنتجات والمخزون والحركات =================
  test('3.1: Product creation, price precision, and initial stock movement', async () => {
    const { db } = loadDb();
    await db.init();

    const cat = db.listCategories()[0];
    const product = db.saveProduct({
      name: 'قهوة بندق كلاسيك',
      price: 45.50,
      cost: 18.25,
      category_id: cat.id,
      stock_qty: 50,
      low_stock_threshold: 10,
      barcode: '6220000000123'
    });

    assert.ok(product?.id);
    assert.strictEqual(product.name, 'قهوة بندق كلاسيك');
    assert.strictEqual(product.price, 45.5);
    assert.strictEqual(product.cost, 18.25);
    assert.strictEqual(product.stock_qty, 50);

    // التحقق من إنشاء حركة مخزن افتتاحية (initial movement) تلقائياً
    const movements = db.listStockMovements(product.id);
    assert.ok(movements.length > 0);
    assert.strictEqual(movements[0].movement_type, 'initial');
    assert.strictEqual(movements[0].quantity, 50);
  });

  test('3.2: Manual stock adjustment records audit movement', async () => {
    const { db } = loadDb();
    await db.init();

    const cat = db.listCategories()[0];
    const prod = db.saveProduct({
      name: 'شاي أخضر ياسمين',
      price: 25,
      cost: 8,
      category_id: cat.id,
      stock_qty: 20
    });

    // تعديل يدوي في كمية المخزون من 20 إلى 35
    db.saveProduct({ ...prod, stock_qty: 35 });

    const updated = db.listProducts().find(p => p.id === prod.id);
    assert.strictEqual(updated.stock_qty, 35);

    const movements = db.listStockMovements(prod.id);
    const adjMovement = movements.find(m => m.movement_type === 'adjustment');
    assert.ok(adjMovement, 'Adjustment movement must be created');
    assert.strictEqual(adjMovement.quantity, 15, 'Difference of +15 must be recorded');
  });

  test('3.3: Soft delete preserves historical integrity and records audit', async () => {
    const { db } = loadDb();
    await db.init();

    const cat = db.listCategories()[0];
    const prod = db.saveProduct({
      name: 'عصير برتقال فريش',
      price: 35,
      category_id: cat.id,
      stock_qty: 10
    });

    // حذف الصنف
    const delRes = db.deleteProduct(prod.id, { id: 1, name: 'مدير النظام' });
    assert.strictEqual(delRes.success, true);

    // الصنف لم يعد يظهر في قائمة الأصناف النشطة
    assert.strictEqual(db.listProducts().some(p => p.id === prod.id), false);

    // الصنف لا يزال موجوداً في الداتابيز وموسوم بـ is_deleted = 1
    const raw = db.queryGet('SELECT * FROM products WHERE id = ?', [prod.id]);
    assert.ok(raw);
    assert.strictEqual(raw.is_deleted, 1);

    // سجل الأوديت (Audit Log) يوثق الحذف الناعم
    const audit = db.listAuditLog(10);
    assert.ok(audit.some(a => a.action === 'soft_delete' && a.entity_id === prod.id));
  });

  // ================= 4. حالات الحافة والأخطاء (Edge Cases & Errors) =================
  test('4.1: Edge cases in product and stock inputs', async () => {
    const { db } = loadDb();
    await db.init();

    // اسم منتج فارغ
    assert.throws(() => {
      db.saveProduct({ name: '', price: 20 });
    }, /اسم|مطلوب|صحيح/i);

    // كمية كسرية غير صحيحة أو نصية غير رقمية تتحول لرقم آمن
    const p = db.saveProduct({
      name: 'مياه غازية نكهة تفاح',
      price: 15,
      stock_qty: 'not-a-number'
    });
    assert.strictEqual(p.stock_qty, 0, 'Invalid stock string must safely default to 0');
  });
});
