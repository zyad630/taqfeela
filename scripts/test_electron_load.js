const { app, BrowserWindow } = require('electron');
const path = require('path');
const db = require('../electron/db');

app.whenReady().then(async () => {
  try {
    await db.init();
    console.log('[TEST] DB init success');
  } catch (e) {
    console.error('[TEST] DB init error:', e);
  }

  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../electron/preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.webContents.on('console-message', (e, level, msg, line, sourceId) => {
    console.log('[RENDERER CONSOLE]', level, msg, line, sourceId);
  });

  win.webContents.on('did-fail-load', (e, code, desc, url) => {
    console.log('[RENDERER FAIL LOAD]', code, desc, url);
  });

  win.webContents.on('render-process-gone', (e, details) => {
    console.log('[RENDERER PROCESS GONE]', details);
  });

  try {
    await win.loadFile('dist/index.html');
    console.log('[TEST] Window loadFile success');
  } catch (err) {
    console.error('[TEST] Window loadFile failed:', err);
  }

  setTimeout(() => {
    console.log('[TEST] Done waiting, quitting');
    app.quit();
  }, 3000);
});
