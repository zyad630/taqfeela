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

  win.webContents.on('console-message', (e, level, msg, line, src) => {
    if (level >= 2) { // warnings and errors only
      console.log(`[RENDERER ${level}]`, msg);
    }
  });

  // Intercept uncaught errors in renderer
  win.webContents.on('render-process-gone', (e, details) => {
    console.error('[RENDER CRASH]', details);
  });

  await win.loadFile(path.join(__dirname, '../dist/index.html'));

  // Inject error tracking before login
  await win.webContents.executeJavaScript(`
    window.__errors = [];
    const origConsoleError = console.error;
    console.error = function(...args) {
      const serialized = args.map(a => {
        if (a instanceof Error) return a.stack || a.message;
        if (typeof a === 'object') {
          try { return JSON.stringify(a); } catch(e) { return String(a); }
        }
        return String(a);
      }).join(' ');
      window.__errors.push(serialized);
      origConsoleError.apply(console, args);
    };
    window.onerror = function(msg, src, line, col, err) {
      window.__errors.push('GLOBAL: ' + msg + ' at ' + src + ':' + line + ':' + col + (err ? (' | ' + err.stack) : ''));
      return false;
    };
    window.addEventListener('unhandledrejection', e => {
      window.__errors.push('UNHANDLED: ' + (e.reason?.stack || e.reason));
    });
  `);

  setTimeout(async () => {
    // Fill and submit login
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
      })()
    `);

    await win.webContents.executeJavaScript(`
      document.querySelector('.login-screen button[type="submit"]')?.click();
    `);

    // Wait for render to crash or succeed
    setTimeout(async () => {
      const errors = await win.webContents.executeJavaScript(`window.__errors || []`);
      console.log('[TEST] Captured errors:', errors);
      
      // Get the full stack trace from the dist bundle
      const errorDetail = await win.webContents.executeJavaScript(`
        (() => {
          const rootEl = document.getElementById('root');
          return {
            innerHTML: rootEl ? rootEl.innerHTML.slice(0, 100) : 'no root',
            errors: window.__errors || []
          };
        })()
      `);
      console.log('[TEST] Error detail:', JSON.stringify(errorDetail, null, 2));

      app.quit();
    }, 2500);
  }, 800);
});
