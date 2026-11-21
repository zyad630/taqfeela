const { app, BrowserWindow } = require('electron');
const path = require('path');
require('../electron/main');

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../electron/preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  await win.loadFile(path.join(__dirname, '../dist/index.html'));
  await new Promise(r => setTimeout(r, 600));

  // Direct login by setting localStorage and reloading, OR by executing loginUser
  await win.webContents.executeJavaScript(`
    (async () => {
      const user = await window.api.loginUser('admin', 'admin');
      localStorage.setItem('cafepos_current_user', JSON.stringify(user));
      location.reload();
    })()
  `);

  await new Promise(r => setTimeout(r, 1000));

  // Check state after reload
  const state = await win.webContents.executeJavaScript(`
    (() => {
      const shiftModal = document.querySelector('.shift-screen');
      const appContainer = document.querySelector('.app-container');
      const loginScreen = document.querySelector('.login-screen');
      return {
        hasLogin: !!loginScreen,
        hasShiftModal: !!shiftModal,
        hasAppContainer: !!appContainer
      };
    })()
  `);
  console.log('[TEST] Reload state:', state);

  // If shiftModal is present, click open shift
  if (state.hasShiftModal) {
    await win.webContents.executeJavaScript(`
      (() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const openBtn = btns.find(b => b.innerText.includes('فتح الشيفت وبدء البيع'));
        if (openBtn) openBtn.click();
      })()
    `);
    await new Promise(r => setTimeout(r, 1000));
  }

  // Now verify tables screen
  const tablesResult = await win.webContents.executeJavaScript(`
    (async () => {
      // Find tables tab button
      const allBtns = Array.from(document.querySelectorAll('button'));
      const tablesTab = allBtns.find(b => b.innerText.includes('طاولات') || b.innerText.includes('صالات'));
      if (tablesTab) tablesTab.click();
      await new Promise(r => setTimeout(r, 600));

      const view = document.querySelector('.tables-view');
      if (!view) return { error: 'tables-view not found', body: document.body.innerText.slice(0, 200) };

      return {
        h2: view.querySelector('h2')?.innerText,
        p: view.querySelector('p')?.innerText,
        filterButtons: Array.from(view.querySelectorAll('.tab-filter-btn')).map(b => b.innerText),
        tableCardsCount: view.querySelectorAll('.table-card').length,
        firstThreeCards: Array.from(view.querySelectorAll('.table-card')).slice(0, 3).map(c => ({
          title: c.querySelector('.table-title')?.innerText,
          status: c.querySelector('.table-status-pill')?.innerText,
          hall: c.querySelector('.table-details')?.innerText
        }))
      };
    })()
  `);
  console.log('[TEST] Tables view result:', JSON.stringify(tablesResult, null, 2));

  // Test other tabs: POS, Orders, Reports
  const otherTabsResult = await win.webContents.executeJavaScript(`
    (async () => {
      const results = {};
      const allBtns = Array.from(document.querySelectorAll('button'));

      // POS tab
      const posBtn = allBtns.find(b => b.innerText.includes('نقطة البيع') || b.innerText.includes('الرئيسية'));
      if (posBtn) {
        posBtn.click();
        await new Promise(r => setTimeout(r, 400));
        results.pos = {
          hasCategories: document.querySelectorAll('.category-chip').length,
          hasProducts: document.querySelectorAll('.product-card').length,
          cartTitle: document.querySelector('.cart-panel h2')?.innerText
        };
      }

      // Orders tab
      const ordersBtn = allBtns.find(b => b.innerText.includes('الطلبات') || b.innerText.includes('الفواتير'));
      if (ordersBtn) {
        ordersBtn.click();
        await new Promise(r => setTimeout(r, 400));
        results.orders = {
          hasOrdersTable: !!document.querySelector('.orders-table-container, .custom-table'),
          rowsCount: document.querySelectorAll('.orders-table-container tr, .custom-table tr').length
        };
      }

      return results;
    })()
  `);
  console.log('[TEST] Other tabs result:', JSON.stringify(otherTabsResult, null, 2));

  app.quit();
});
