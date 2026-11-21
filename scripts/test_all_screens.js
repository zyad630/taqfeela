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

  const capturedErrors = [];
  win.webContents.on('console-message', (e, level, msg) => {
    if (level >= 2 && !msg.includes('Electron Security Warning')) {
      capturedErrors.push(`[LOG ${level}] ${msg}`);
    }
  });

  await win.loadFile(path.join(__dirname, '../dist/index.html'));

  // 1. Wait for page to initialize and submit login
  await new Promise(r => setTimeout(r, 800));

  await win.webContents.executeJavaScript(`
    (() => {
      function setReactInput(el, val) {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(el, val);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }
      const inputs = document.querySelectorAll('.login-screen input');
      if (inputs.length >= 2) {
        setReactInput(inputs[0], 'admin');
        setReactInput(inputs[1], 'admin');
      }
      document.querySelector('.login-screen button[type="submit"]')?.click();
    })()
  `);

  await new Promise(r => setTimeout(r, 1200));

  // 2. Open shift if shift modal is open
  await win.webContents.executeJavaScript(`
    (() => {
      const openShiftBtn = document.querySelector('.shift-card-modal button.btn-primary');
      if (openShiftBtn) {
        openShiftBtn.click();
      }
    })()
  `);

  await new Promise(r => setTimeout(r, 1000));

  // 3. Switch to tables view
  const tablesAudit = await win.webContents.executeJavaScript(`
    (() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const tablesBtn = buttons.find(b => b.innerText.includes('طاولات') || b.innerText.includes('صالات'));
      if (tablesBtn) tablesBtn.click();

      const view = document.querySelector('.tables-view');
      if (!view) return { success: false, reason: 'tables-view element not found' };

      const h2 = view.querySelector('h2')?.innerText || '';
      const filterBtns = Array.from(view.querySelectorAll('.tab-filter-btn')).map(b => b.innerText);
      const cards = Array.from(view.querySelectorAll('.table-card')).map(c => ({
        name: c.querySelector('.table-title')?.innerText || '',
        num: c.querySelector('.table-num')?.innerText || '',
        pill: c.querySelector('.table-status-pill')?.innerText || ''
      }));

      return {
        success: true,
        header: h2,
        filters: filterBtns,
        tablesCount: cards.length,
        firstFew: cards.slice(0, 5)
      };
    })()
  `);

  console.log('[TEST] Tables view audit:', JSON.stringify(tablesAudit, null, 2));

  // 4. Test notebook modal
  const notebookAudit = await win.webContents.executeJavaScript(`
    (() => {
      const notebookBtn = document.querySelector('.btn-notebook-badge');
      if (notebookBtn) notebookBtn.click();

      const modal = document.querySelector('.notebook-modal');
      return {
        opened: !!modal,
        hasFilterChips: !!modal?.querySelector('.filter-chips'),
        chipsCount: modal?.querySelectorAll('.filter-chip')?.length || 0,
        statsCount: modal?.querySelectorAll('.stat-card')?.length || 0
      };
    })()
  `);

  console.log('[TEST] Notebook modal audit:', JSON.stringify(notebookAudit, null, 2));
  console.log('[TEST] Captured console errors:', capturedErrors);

  app.quit();
});
