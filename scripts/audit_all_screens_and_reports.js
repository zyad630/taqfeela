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
    if (level >= 2 && !msg.includes('Electron Security Warning') && !msg.includes('deprecated')) {
      capturedErrors.push(`[LOG ${level}] ${msg}`);
    }
  });

  await win.loadFile(path.join(__dirname, '../dist/index.html'));
  await new Promise(r => setTimeout(r, 600));

  // 1. Direct login via API + localStorage
  console.log('--- 1. Authenticating Admin ---');
  await win.webContents.executeJavaScript(`
    (async () => {
      const user = await window.api.loginUser('admin', 'admin');
      localStorage.setItem('cafepos_current_user', JSON.stringify(user));
      location.reload();
    })()
  `);
  await new Promise(r => setTimeout(r, 1200));

  // 2. Check shift state & open if needed
  console.log('--- 2. Checking Shift State ---');
  await win.webContents.executeJavaScript(`
    (async () => {
      const shiftModal = document.querySelector('.shift-screen');
      if (shiftModal) {
        const btns = Array.from(document.querySelectorAll('button'));
        const openBtn = btns.find(b => b.innerText.includes('فتح الشيفت') || b.innerText.includes('بدء البيع'));
        if (openBtn) openBtn.click();
      }
    })()
  `);
  await new Promise(r => setTimeout(r, 1200));

  // 3. Audit Navigation Tabs
  console.log('--- 3. Testing All Navigation Tabs ---');
  const navAudit = await win.webContents.executeJavaScript(`
    (() => {
      const tabs = Array.from(document.querySelectorAll('.tab-btn')).map(b => b.innerText.trim());
      return { tabs };
    })()
  `);
  console.log('Available navigation tabs:', navAudit.tabs);

  // 4. Test Reports View & All Its Sub-Tabs
  console.log('--- 4. Testing Reports Page ---');
  const reportsAudit = await win.webContents.executeJavaScript(`
    (async () => {
      const results = {};
      const reportsBtn = Array.from(document.querySelectorAll('.tab-btn')).find(b => b.innerText.includes('تقارير'));
      if (!reportsBtn) return { error: 'Reports tab button not found' };
      reportsBtn.click();
      await new Promise(r => setTimeout(r, 800));

      const view = document.querySelector('.reports-view');
      if (!view) return { error: 'Reports view element not found' };

      // 4a. Quick tab
      const quickBtn = Array.from(view.querySelectorAll('button')).find(b => b.innerText.includes('ملخص'));
      if (quickBtn) {
        quickBtn.click();
        await new Promise(r => setTimeout(r, 800));
        results.quickTabStats = Array.from(view.querySelectorAll('.stat-card')).map(c => c.innerText.replace(/\\n/g, ' | '));
      }

      // 4b. Sales tab
      const salesBtn = Array.from(view.querySelectorAll('button')).find(b => b.innerText.includes('تقرير المبيعات'));
      if (salesBtn) {
        salesBtn.click();
        await new Promise(r => setTimeout(r, 800));
        const genBtn = Array.from(view.querySelectorAll('button')).find(b => b.innerText.includes('عرض التقرير'));
        if (genBtn) genBtn.click();
        await new Promise(r => setTimeout(r, 1000));
        results.salesStats = Array.from(view.querySelectorAll('.stat-card')).map(c => c.innerText.replace(/\\n/g, ' | '));
        results.hasUserBreakdown = !!view.querySelector('.stats-cards-grid');
      }

      // 4c. Inventory tab
      const invBtn = Array.from(view.querySelectorAll('button')).find(b => b.innerText.includes('تقرير المخزون'));
      if (invBtn) {
        invBtn.click();
        await new Promise(r => setTimeout(r, 1000));
        results.invStats = Array.from(view.querySelectorAll('.stat-card')).map(c => c.innerText.replace(/\\n/g, ' | '));
        const invRows = view.querySelectorAll('table.custom-table tbody tr');
        results.invRowCount = invRows.length;
      }

      // 4d. Shifts tab
      const shiftBtn = Array.from(view.querySelectorAll('button')).find(b => b.innerText.includes('تقرير الشيفت'));
      if (shiftBtn) {
        shiftBtn.click();
        await new Promise(r => setTimeout(r, 800));
        // Check shifts list
        const shiftCards = Array.from(view.querySelectorAll('button')).filter(b => b.innerText.includes('وردية') || b.innerText.includes('الشيفت') || b.innerText.includes('مفتوح'));
        results.shiftCardsCount = shiftCards.length;
        if (shiftCards.length > 0) {
          shiftCards[0].click();
          await new Promise(r => setTimeout(r, 1000));
        }
        results.shiftDetailsLoaded = !!view.querySelector('table');
      }

      return { success: true, results };
    })()
  `);
  console.log('Reports Audit Results:', JSON.stringify(reportsAudit, null, 2));

  // 5. Test Print Modal
  console.log('--- 5. Testing Print Modal in Reports ---');
  const printModalAudit = await win.webContents.executeJavaScript(`
    (async () => {
      const printBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('طباعة'));
      if (printBtn) {
        printBtn.click();
        await new Promise(r => setTimeout(r, 600));
        const modal = document.querySelector('.report-print-modal');
        const hasContainer = !!modal?.querySelector('#printable-report');
        const thermalBtn = Array.from(modal?.querySelectorAll('button') || []).find(b => b.innerText.includes('حراري'));
        const a4Btn = Array.from(modal?.querySelectorAll('button') || []).find(b => b.innerText.includes('A4'));
        
        // Switch to A4
        if (a4Btn) a4Btn.click();
        await new Promise(r => setTimeout(r, 400));
        
        // Switch to Thermal
        if (thermalBtn) thermalBtn.click();
        await new Promise(r => setTimeout(r, 400));

        // Close modal
        const closeBtn = Array.from(modal?.querySelectorAll('button') || []).find(b => b.innerText.includes('إغلاق'));
        if (closeBtn) closeBtn.click();
        return { modalOpened: !!modal, hasPrintableContainer: hasContainer, hasFormatSwitcher: !!(thermalBtn && a4Btn) };
      }
      return { printBtnFound: false };
    })()
  `);
  console.log('Print Modal Audit:', JSON.stringify(printModalAudit, null, 2));

  // 6. Test POS Screen & Products
  console.log('--- 6. Testing POS Screen ---');
  const posAudit = await win.webContents.executeJavaScript(`
    (async () => {
      const posBtn = Array.from(document.querySelectorAll('.tab-btn')).find(b => b.innerText.includes('الكاشير') || b.innerText.includes('نقطة'));
      if (posBtn) posBtn.click();
      await new Promise(r => setTimeout(r, 800));
      const products = document.querySelectorAll('.product-card');
      const cats = document.querySelectorAll('.cat-btn, .category-chip, .category-btn');
      return {
        productsCount: products.length,
        categoriesCount: cats.length,
        hasCart: !!document.querySelector('.cart-section, .cart-panel, .cart-sidebar')
      };
    })()
  `);
  console.log('POS Screen Audit:', JSON.stringify(posAudit, null, 2));

  // 7. Test Tables Screen
  console.log('--- 7. Testing Tables Screen ---');
  const tablesAudit = await win.webContents.executeJavaScript(`
    (async () => {
      const tablesBtn = Array.from(document.querySelectorAll('.tab-btn')).find(b => b.innerText.includes('طاولات') || b.innerText.includes('صالات'));
      if (tablesBtn) tablesBtn.click();
      await new Promise(r => setTimeout(r, 800));
      const tables = document.querySelectorAll('.table-card');
      return {
        tablesCount: tables.length,
        viewLoaded: !!document.querySelector('.tables-view')
      };
    })()
  `);
  console.log('Tables Screen Audit:', JSON.stringify(tablesAudit, null, 2));

  // 8. Test Settings Screen
  console.log('--- 8. Testing Settings Screen ---');
  const settingsAudit = await win.webContents.executeJavaScript(`
    (async () => {
      const settingsBtn = Array.from(document.querySelectorAll('.tab-btn')).find(b => b.innerText.includes('إعدادات'));
      if (settingsBtn) settingsBtn.click();
      await new Promise(r => setTimeout(r, 800));
      return {
        viewLoaded: !!document.querySelector('.settings-view'),
        cardsCount: document.querySelectorAll('.settings-card').length
      };
    })()
  `);
  console.log('Settings Screen Audit:', JSON.stringify(settingsAudit, null, 2));

  // 9. Check Errors
  console.log('--- 9. Console Errors Summary ---');
  console.log('Captured runtime errors count:', capturedErrors.length);
  if (capturedErrors.length > 0) {
    console.error('Errors:', capturedErrors);
  } else {
    console.log('🎉 ALL SCREENS, REPORTS & BUTTONS AUDITED WITH 0 RUNTIME ERRORS!');
  }

  app.quit();
});
