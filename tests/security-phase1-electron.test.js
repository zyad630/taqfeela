const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

test('Phase 1: Electron Security Hardening (Static & Contract Audit)', async (t) => {
  const mainJsPath = path.join(__dirname, '../electron/main.js');
  const mainContent = fs.readFileSync(mainJsPath, 'utf8');

  await t.test('1. Dangerous commandLine switches are completely removed', () => {
    assert.strictEqual(
      mainContent.includes("'no-sandbox'"),
      false,
      "Expected 'no-sandbox' switch to be removed from electron/main.js"
    );
    assert.strictEqual(
      mainContent.includes("'disable-gpu-sandbox'"),
      false,
      "Expected 'disable-gpu-sandbox' switch to be removed from electron/main.js"
    );
    assert.strictEqual(
      mainContent.includes("'disable-software-rasterizer'"),
      false,
      "Expected 'disable-software-rasterizer' switch to be removed from electron/main.js"
    );
    assert.strictEqual(
      /appendSwitch\s*\(\s*['"]disable-features['"]\s*,\s*['"]RendererCodeIntegrity['"]\s*\)/.test(mainContent),
      false,
      "Expected 'RendererCodeIntegrity' switch to be removed from electron/main.js"
    );
  });

  await t.test('2. All BrowserWindow webPreferences enforce strict isolation', () => {
    // Locate all new BrowserWindow({ ... }) blocks
    const windowMatches = mainContent.match(/new\s+BrowserWindow\s*\(\s*\{[\s\S]*?\}\s*\)/g) || [];
    assert.ok(windowMatches.length >= 3, `Expected at least 3 BrowserWindow instances, found ${windowMatches.length}`);

    for (const winBlock of windowMatches) {
      assert.match(winBlock, /sandbox:\s*true/, `BrowserWindow missing 'sandbox: true':\n${winBlock}`);
      assert.match(winBlock, /contextIsolation:\s*true/, `BrowserWindow missing 'contextIsolation: true':\n${winBlock}`);
      assert.match(winBlock, /nodeIntegration:\s*false/, `BrowserWindow missing 'nodeIntegration: false':\n${winBlock}`);
      assert.match(winBlock, /webSecurity:\s*true/, `BrowserWindow missing 'webSecurity: true':\n${winBlock}`);
      assert.match(winBlock, /allowRunningInsecureContent:\s*false/, `BrowserWindow missing 'allowRunningInsecureContent: false':\n${winBlock}`);
    }
  });

  await t.test('3. setPermissionRequestHandler denies unauthorized permissions', () => {
    assert.match(
      mainContent,
      /setPermissionRequestHandler/,
      "Expected electron/main.js to register a setPermissionRequestHandler"
    );
  });

  await t.test('4. will-navigate blocks unauthorized navigation', () => {
    assert.match(
      mainContent,
      /will-navigate/,
      "Expected electron/main.js to register will-navigate security handler"
    );
  });

  await t.test('5. Content Security Policy (CSP) header is configured', () => {
    assert.match(
      mainContent,
      /Content-Security-Policy/i,
      "Expected electron/main.js to enforce Content-Security-Policy headers"
    );
  });

  await t.test('6. preload.js is compatible with sandbox (no unsafe Node core requires)', () => {
    const preloadPath = path.join(__dirname, '../electron/preload.js');
    const preloadContent = fs.readFileSync(preloadPath, 'utf8');
    // Ensure preload does not require dangerous core modules like child_process, fs, net, etc.
    const forbidden = ['child_process', 'fs', 'net', 'http', 'https', 'tls', 'os', 'cluster'];
    for (const mod of forbidden) {
      assert.strictEqual(
        preloadContent.includes(`require('${mod}')`) || preloadContent.includes(`require("${mod}")`),
        false,
        `preload.js should not require unsafe module '${mod}'`
      );
    }
  });
});
