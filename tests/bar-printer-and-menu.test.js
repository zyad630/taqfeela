const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const initSqlJs = require('sql.js');

describe('☕ Bar Printer, Item Locking & Real Menu Verification', () => {
  const testDbPath = path.join(__dirname, 'test-bar-menu.db');

  before(() => {
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
  });

  after(() => {
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
  });

  test('1. Database seeds exact 17 categories and 129 products from the menu images', async () => {
    const db = require('../electron/db');
    await db.init(testDbPath);

    const categories = db.listCategories();
    assert.strictEqual(categories.length, 17, `Expected 17 categories, got ${categories.length}`);

    const products = db.listProducts();
    assert.strictEqual(products.length, 129, `Expected 129 products, got ${products.length}`);

    // Verify key categories from the menu images
    const catNames = categories.map(c => c.name);
    assert(catNames.includes('جوبلت كوكيز'), 'Must contain جوبلت كوكيز');
    assert(catNames.includes('حلويات'), 'Must contain حلويات');
    assert(catNames.includes('وافلز'), 'Must contain وافلز');
    assert(catNames.includes('سموزي'), 'Must contain سموزي');
    assert(catNames.includes('موهيتو'), 'Must contain موهيتو');
    assert(catNames.includes('بان كيك'), 'Must contain بان كيك');
    assert(catNames.includes('سوفت درينك'), 'Must contain سوفت درينك');
    assert(catNames.includes('زبادو'), 'Must contain زبادو');
    assert(catNames.includes('شيشة'), 'Must contain شيشة');
    assert(catNames.includes('إضافات'), 'Must contain إضافات');
    assert(catNames.includes('مشروبات ساخنة'), 'Must contain مشروبات ساخنة');
    assert(catNames.includes('هوت شوكلت'), 'Must contain هوت شوكلت');
    assert(catNames.includes('ميلك تشيك'), 'Must contain ميلك تشيك');
    assert(catNames.includes('عصائر فريش'), 'Must contain عصائر فريش');
    assert(catNames.includes('كوكتيلات'), 'Must contain كوكتيلات');
    assert(catNames.includes('فرابيه'), 'Must contain فرابيه');
    assert(catNames.includes('ايس كوفي'), 'Must contain ايس كوفي');

    // Verify sample product prices match the images exactly
    const gobletPistachio = products.find(p => p.name === 'جوبلت بستاشيو');
    assert.strictEqual(gobletPistachio.price, 95, 'جوبلت بستاشيو must be 95 EGP');

    const mojitoRedbull = products.find(p => p.name === 'موهيتو ريدبول');
    assert.strictEqual(mojitoRedbull.price, 90, 'موهيتو ريدبول must be 90 EGP');

    const turkishSingle = products.find(p => p.name === 'قهوة تركي سنجل');
    assert.strictEqual(turkishSingle.price, 25, 'قهوة تركي سنجل must be 25 EGP');

    const turkishDouble = products.find(p => p.name === 'قهوة تركي دبل');
    assert.strictEqual(turkishDouble.price, 40, 'قهوة تركي دبل must be 40 EGP');

    const sheshaClassic = products.find(p => p.name === 'شيشة كلاسيك');
    assert.strictEqual(sheshaClassic.price, 25, 'شيشة كلاسيك must be 25 EGP');

    const powerTakia = products.find(p => p.name.includes('باور التكية'));
    assert.strictEqual(powerTakia.price, 100, 'باور التكية must be 100 EGP');
  });

  test('2. Settings table supports bar_printer_name alongside printer_name', async () => {
    const db = require('../electron/db');
    const initialSettings = db.getSettings();
    assert('bar_printer_name' in initialSettings, 'bar_printer_name should exist in settings');

    // Save custom printers
    db.saveSettings({
      ...initialSettings,
      printer_name: 'POS-80-Cashier',
      bar_printer_name: 'POS-80-BarKitchen'
    });

    const updatedSettings = db.getSettings();
    assert.strictEqual(updatedSettings.printer_name, 'POS-80-Cashier');
    assert.strictEqual(updatedSettings.bar_printer_name, 'POS-80-BarKitchen');
  });

  test('3. Bar preparation logic: sent_qty calculation and differential printing', () => {
    // Simulate cart operations
    let cart = [
      { id: 1, name: 'قهوة تركي سنجل', price: 25, qty: 2, sent_qty: 0 },
      { id: 2, name: 'وافلز بستاشيو', price: 90, qty: 1, sent_qty: 0 }
    ];

    // First send to bar
    const firstItemsToSend = cart.map(item => ({
      ...item,
      printQty: item.qty - (Number(item.sent_qty) || 0)
    })).filter(i => i.printQty > 0);

    assert.strictEqual(firstItemsToSend.length, 2);
    assert.strictEqual(firstItemsToSend[0].printQty, 2);
    assert.strictEqual(firstItemsToSend[1].printQty, 1);

    // Update sent_qty
    cart = cart.map(item => ({ ...item, sent_qty: item.qty }));
    assert.strictEqual(cart[0].sent_qty, 2);
    assert.strictEqual(cart[1].sent_qty, 1);

    // Decrement protection rule: Cannot decrease below sent_qty
    const tryDecrement = (item) => {
      const sent = Number(item.sent_qty) || 0;
      if (item.qty <= sent) {
        return false; // Blocked!
      }
      item.qty -= 1;
      return true;
    };

    assert.strictEqual(tryDecrement(cart[0]), false, 'Decreasing item 0 below sent_qty must be blocked');

    // Delete protection rule: Cannot delete if sent_qty > 0
    const tryDelete = (item) => {
      return (Number(item.sent_qty) || 0) === 0;
    };
    assert.strictEqual(tryDelete(cart[1]), false, 'Deleting sent item must be blocked');

    // Increase item 0 quantity by 1
    cart[0].qty += 1; // Now qty is 3, sent_qty is 2
    assert.strictEqual(cart[0].qty, 3);
    assert.strictEqual(cart[0].sent_qty, 2);

    // Add a brand new item
    cart.push({ id: 3, name: 'موهيتو ريدبول', price: 90, qty: 1, sent_qty: 0 });

    // Second send to bar: only unsent items and differential quantities must be printed
    const secondItemsToSend = cart.map(item => ({
      ...item,
      printQty: item.qty - (Number(item.sent_qty) || 0)
    })).filter(i => i.printQty > 0);

    assert.strictEqual(secondItemsToSend.length, 2, 'Should only send the 2 items with new quantities');
    
    // Coffee: should only print the 1 extra cup, NOT the 2 already made!
    const coffeeToSend = secondItemsToSend.find(i => i.id === 1);
    assert.strictEqual(coffeeToSend.printQty, 1, 'Coffee should only print 1 additional cup to the bar');

    // Mojito: 1 cup
    const mojitoToSend = secondItemsToSend.find(i => i.id === 3);
    assert.strictEqual(mojitoToSend.printQty, 1, 'New item should print full qty 1');

    // Waffle: was 1, sent 1, diff is 0 -> NOT included in bar slip!
    const waffleToSend = secondItemsToSend.find(i => i.id === 2);
    assert.strictEqual(waffleToSend, undefined, 'Waffle already prepared, should NOT be resent to bar');
  });

  test('4. Order checkout succeeds and deducts correct inventory from new products', async () => {
    const db = require('../electron/db');
    const users = db.listUsers();
    const admin = users.find(u => u.role === 'admin');

    // Open a test shift
    const shift = db.openShift(500, 'شيفت تجربة المنيو والبار', admin, 'الشيفت الصباحي');
    assert(shift && shift.id > 0);

    const prods = db.listProducts();
    const coffee = prods.find(p => p.name === 'قهوة تركي سنجل');
    const initialStock = coffee.stock_qty;

    // Create order
    const orderPayload = {
      shiftId: shift.id,
      orderType: 'dine_in',
      customerName: 'عميل تجربة',
      items: [
        { id: coffee.id, name: coffee.name, price: coffee.price, qty: 2 }
      ],
      subtotal: coffee.price * 2,
      discount: 0,
      total: coffee.price * 2,
      paymentMethod: 'cash',
      amountPaid: coffee.price * 2,
      changeDue: 0,
      cashAmount: coffee.price * 2,
      cardAmount: 0,
      walletAmount: 0,
      user: admin
    };

    const createdOrder = db.createOrder(orderPayload);
    assert(createdOrder && createdOrder.orderId > 0);

    // Verify stock deducted
    const updatedCoffee = db.listProducts().find(p => p.name === 'قهوة تركي سنجل');
    assert.strictEqual(updatedCoffee.stock_qty, initialStock - 2, 'Stock should be deducted by 2');

    // Close shift
    const closed = db.closeShift(shift.id, 500 + (coffee.price * 2), 'إغلاق شيفت التجربة', admin);
    assert.strictEqual(closed.success, true);
  });
});
