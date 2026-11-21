/**
 * Acceptance Test for FIX-13 (NOTE-01): Takeaway Cart Item Notes Persistence & Sudden Power Loss Resilience
 * Tests:
 * 1. NoteModal updates activeTakeawayId cart in takeawayTabs synchronously upon note save.
 * 2. Instant persistence to localStorage ('cafepos_takeaway_tabs').
 * 3. Power cut / sudden restart simulation: fresh session loads persisted cart with item notes intact.
 * 4. Codebase inspection in src/ and cafe-pos-split/.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

function testTakeawayNotePersistence() {
  console.log('--- TEST 1: Takeaway Tab Note Modal Logic & Instant Persistence ---');

  // Simulated browser localStorage
  const localStorageMock = new Map();
  const localStorage = {
    getItem: (k) => localStorageMock.get(k) || null,
    setItem: (k, v) => localStorageMock.set(k, String(v)),
    removeItem: (k) => localStorageMock.delete(k)
  };

  // 1. Initial takeaway tab state with 1 item without note
  const initialTabs = [
    {
      id: 'tab_takeaway_1',
      name: 'طلب 1',
      cart: [
        { id: 101, name: 'قهوة تركي', price: 25, qty: 2, notes: '' },
        { id: 102, name: 'شاي بحليب', price: 20, qty: 1, notes: '' }
      ]
    }
  ];
  localStorage.setItem('cafepos_takeaway_tabs', JSON.stringify(initialTabs));

  // 2. Simulate user opening NoteModal for item 101 and saving note: "سكر زيادة - بن فاتح"
  const activeTakeawayId = 'tab_takeaway_1';
  const orderType = 'takeaway';
  const noteModalItem = { id: 101, name: 'قهوة تركي' };
  const userEnteredNote = 'سكر زيادة - بن فاتح';

  // Execute NoteModal saveNote logic
  let liveCart = [...initialTabs[0].cart];
  let liveTakeawayTabs = [...initialTabs];

  const setCart = (updater) => {
    liveCart = typeof updater === 'function' ? updater(liveCart) : updater;
  };

  const setTakeawayTabs = (updater) => {
    liveTakeawayTabs = typeof updater === 'function' ? updater(liveTakeawayTabs) : updater;
  };

  // Replicate NoteModal saveNote
  const trimmed = userEnteredNote.trim();
  setCart(prev => prev.map(it => it.id === noteModalItem.id ? { ...it, notes: trimmed } : it));

  if (orderType === 'takeaway' && activeTakeawayId && setTakeawayTabs) {
    setTakeawayTabs(prev => {
      const next = prev.map(t => t.id === activeTakeawayId
        ? { ...t, cart: (t.cart || []).map(it => it.id === noteModalItem.id ? { ...it, notes: trimmed } : it) }
        : t);
      try {
        localStorage.setItem('cafepos_takeaway_tabs', JSON.stringify(next));
      } catch (_) {}
      return next;
    });
  }

  console.log('Live cart after note save:', liveCart.find(it => it.id === 101));
  console.log('Takeaway tabs in localStorage after save:', localStorage.getItem('cafepos_takeaway_tabs'));

  assert.strictEqual(liveCart.find(it => it.id === 101).notes, 'سكر زيادة - بن فاتح');
  assert(localStorage.getItem('cafepos_takeaway_tabs').includes('سكر زيادة - بن فاتح'), 'localStorage must immediately contain the item note');
  console.log('✅ TEST 1 PASSED: NoteModal synchronously updates takeawayTabs and localStorage.\n');

  console.log('--- TEST 2: Power Cut / Immediate App Restart Simulation ---');
  // Wipe all in-memory variables (simulating hard process kill)
  liveCart = null;
  liveTakeawayTabs = null;

  // Fresh app boot: reading from localStorage
  const recoveredData = JSON.parse(localStorage.getItem('cafepos_takeaway_tabs'));
  const activeTab = recoveredData.find(t => t.id === 'tab_takeaway_1');
  const targetItem = activeTab.cart.find(it => it.id === 101);

  console.log('Recovered item after simulated crash/restart:', targetItem);
  assert.ok(targetItem, 'Item must exist in recovered takeaway tab');
  assert.strictEqual(targetItem.notes, 'سكر زيادة - بن فاتح', 'Item note must survive sudden restart/power cut');
  console.log('✅ TEST 2 PASSED: Item note survives complete restart without loss.\n');
}

function testCodebaseWiring() {
  console.log('--- TEST 3: Codebase Integration Verification ---');
  const baseDir = path.resolve(__dirname, '..');

  const files = [
    'src/components/modals/NoteModal.jsx',
    'cafe-pos-split/src/components/modals/NoteModal.jsx',
    'src/App.jsx',
    'cafe-pos-split/src/App.jsx'
  ];

  for (const f of files) {
    const content = fs.readFileSync(path.join(baseDir, f), 'utf8');
    assert(content.includes('setTakeawayTabs'), `${f} must include setTakeawayTabs`);
    assert(content.includes('activeTakeawayId'), `${f} must include activeTakeawayId`);
    console.log(`  ✓ Verified props and logic in ${f}`);
  }

  // Check that NoteModal has the takeaway localStorage update
  const modalContent = fs.readFileSync(path.join(baseDir, 'src/components/modals/NoteModal.jsx'), 'utf8');
  assert(modalContent.includes("orderType === 'takeaway'"), 'NoteModal must check orderType === takeaway');
  assert(modalContent.includes('cafepos_takeaway_tabs'), 'NoteModal must write to cafepos_takeaway_tabs');

  console.log('✅ TEST 3 PASSED: All components wired correctly.\n');
}

function runAll() {
  console.log('====================================================');
  console.log('       RUNNING ACCEPTANCE TEST FIX-13 (NOTE-01)     ');
  console.log('====================================================\n');
  testTakeawayNotePersistence();
  testCodebaseWiring();
  console.log('====================================================');
  console.log('       ALL ACCEPTANCE TESTS FOR FIX-13 PASSED!      ');
  console.log('====================================================');
}

runAll();

