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

  win.webContents.on('console-message', (e, level, msg) => {
    if (level >= 2 && !msg.includes('Electron Security Warning')) {
      console.log(`[RENDERER ${level}]`, msg);
    }
  });

  await win.loadFile(path.join(__dirname, '../dist/index.html'));
  await new Promise(r => setTimeout(r, 800));

  // 1. Submit login
  await win.webContents.executeJavaScript(`
    (() => {
      function setInput(el, val) {
        const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        s.call(el, val);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }
      const inputs = document.querySelectorAll('.login-screen input');
      if (inputs.length >= 2) {
        setInput(inputs[0], 'admin');
        setInput(inputs[1], 'admin');
      }
      document.querySelector('.login-screen button[type="submit"]')?.click();
    })()
  `);
  await new Promise(r => setTimeout(r, 1200));

  // 2. Click open shift
  const openShiftRes = await win.webContents.executeJavaScript(`
    (() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const openBtn = btns.find(b => b.innerText.includes('فتح الشيفت'));
      if (openBtn) {
        openBtn.click();
        return { clicked: true };
      }
      return { clicked: false, available: btns.map(b => b.innerText) };
    })()
  `);
  console.log('[TEST] Open Shift Click:', openShiftRes);
  await new Promise(r => setTimeout(r, 1500));

  // 3. Check what is rendered in main app
  const mainStatus = await win.webContents.executeJavaScript(`
    (() => {
      const container = document.querySelector('.app-container');
      const allButtons = Array.from(document.querySelectorAll('button')).map(b => b.innerText.trim());
      return {
        hasAppContainer: !!container,
        sampleButtons: allButtons.slice(0, 15),
        bodySnippet: document.body.innerText.slice(0, 300).replace(/\\n/g, ' ')
      };
    })()
  `);
  console.log('[TEST] Main status after shift open:', JSON.stringify(mainStatus, null, 2));

  // 4. Click Tables tab
  const tablesClick = await win.webContents.executeJavaScript(`
    (() => {
      const allButtons = Array.from(document.querySelectorAll('button'));
      const tablesBtn = allButtons.find(b => b.innerText.includes('طاولات') || b.innerText.includes('صالات'));
      if (tablesBtn) {
        tablesBtn.click();
        return { clicked: true, text: tablesBtn.innerText };
      }
      return { clicked: false, buttons: allButtons };
    })()
  `);
  console.log('[TEST] Tables tab click:', tablesClick);
  await new Promise(r => setTimeout(r, 1000));

  // 5. Inspect Tables view
  const tablesDetails = await win.webContents.executeJavaScript(`
    (() => {
      const tablesView = document.querySelector('.tables-view');
      if (!tablesView) return { hasTablesView: false, body: document.body.innerText.slice(0, 200) };

      return {
        hasTablesView: true,
        header: tablesView.querySelector('h2')?.innerText,
        subtitle: tablesView.querySelector('p')?.innerText,
        filterButtons: Array.from(tablesView.querySelectorAll('.tab-filter-btn')).map(b => b.innerText),
        tablesCount: tablesView.querySelectorAll('.table-card').length,
        firstTable: (() => {
          const card = tablesView.querySelector('.table-card');
          if (!card) return null;
          return {
            title: card.querySelector('.table-title')?.innerText,
            status: card.querySelector('.table-status-pill')?.innerText,
            details: card.querySelector('.table-details')?.innerText
          };
        })()
      };
    })()
  `);
  console.log('[TEST] Tables details:', JSON.stringify(tablesDetails, null, 2));

  app.quit();
});
