const { app, BrowserWindow } = require('electron');
const path = require('path');
const db = require('../electron/db');

app.whenReady().then(async () => {
  await db.init();
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../electron/preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.loadFile(path.join(__dirname, '../dist/index.html'));

  win.webContents.on('did-finish-load', async () => {
    console.log('[TEST] Page finished loading');

    setTimeout(async () => {
      const state = await win.webContents.executeJavaScript(`
        (() => {
          return {
            hasFullscreenCenter: !!document.querySelector('.fullscreen-center'),
            hasLoginScreen: !!document.querySelector('.login-screen'),
            hasShiftScreen: !!document.querySelector('.shift-screen'),
            hasAppContainer: !!document.querySelector('.app-container'),
            title: document.title,
            bodyText: document.body.innerText.slice(0, 300)
          };
        })()
      `);

      console.log('[TEST] Render state:', JSON.stringify(state, null, 2));

      // Test login as admin
      const loginResult = await win.webContents.executeJavaScript(`
        (async () => {
          const res = await window.api.loginUser('admin', 'admin');
          return res;
        })()
      `);
      console.log('[TEST] Login result:', loginResult);

      setTimeout(() => {
        app.quit();
      }, 1000);
    }, 1500);
  });
});
