/**
 * check-undefined-refs.js
 * Scans App.jsx for ReferencedIdentifiers that have no binding in scope.
 * Intended to catch regressions like the missing `handleViewReceipt` (Round 6 fix).
 *
 * Usage: node scripts/check-undefined-refs.js
 * No dev-dependency install needed — uses @babel/traverse already in node_modules.
 *
 * Exit 0 = clean. Exit 1 = unresolved references found.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;

const APP_JSX = path.resolve(__dirname, '../src/App.jsx');
const code = fs.readFileSync(APP_JSX, 'utf8');

let ast;
try {
  ast = parser.parse(code, {
    sourceType: 'module',
    plugins: ['jsx', 'optionalChaining', 'nullishCoalescingOperator', 'classProperties'],
    errorRecovery: true,
  });
} catch (e) {
  console.error('Parse error:', e.message);
  process.exit(1);
}

// Known browser/DOM/React globals that are never "bound" in file scope
const KNOWN_GLOBALS = new Set([
  // JS built-ins
  'undefined', 'null', 'true', 'false', 'NaN', 'Infinity',
  'console', 'Math', 'JSON', 'Date', 'Array', 'Object', 'String', 'Number',
  'Boolean', 'Promise', 'Error', 'Set', 'Map', 'Symbol', 'RegExp', 'URL',
  'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'encodeURIComponent',
  'decodeURIComponent', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval',
  'fetch', 'AbortController', 'FormData', 'Blob', 'File', 'FileReader',
  // Browser globals
  'window', 'document', 'navigator', 'location', 'history', 'screen',
  'localStorage', 'sessionStorage', 'indexedDB', 'XMLHttpRequest',
  'performance', 'alert', 'confirm', 'prompt',
  // React ecosystem (imported at top, traverse sees them as external sometimes)
  'React', 'useState', 'useEffect', 'useRef', 'useCallback', 'useMemo',
  'useContext', 'useReducer', 'createContext', 'forwardRef', 'memo',
  'Fragment', 'Suspense', 'lazy',
  // Node.js / Electron
  'process', 'require', 'module', 'exports', '__dirname', '__filename', 'Buffer',
  // Common third-party (imported at top of App.jsx)
  'api', 'Intl', 'crypto', 'atob', 'btoa', 'structuredClone', 'queueMicrotask',
  'requestAnimationFrame', 'cancelAnimationFrame', 'ResizeObserver', 'MutationObserver',
  'IntersectionObserver', 'CustomEvent', 'EventSource', 'WebSocket',
  'globalThis', 'self', 'top', 'parent', 'opener',
  // JSX special
  'children',
]);

const unresolved = new Set();

traverse(ast, {
  ReferencedIdentifier(nodePath) {
    const { name } = nodePath.node;
    if (KNOWN_GLOBALS.has(name)) return;
    // Skip if it's a property access (obj.foo) — foo is not a reference
    if (
      nodePath.parent.type === 'MemberExpression' &&
      nodePath.parent.property === nodePath.node &&
      !nodePath.parent.computed
    ) return;
    // Skip JSX attribute names
    if (nodePath.parent.type === 'JSXAttribute') return;
    // Skip type-only positions (unlikely in .jsx but safe)
    if (nodePath.isReferenced() && !nodePath.scope.hasBinding(name)) {
      const loc = nodePath.node.loc;
      const line = loc ? loc.start.line : '?';
      unresolved.add(`  ⚠️  '${name}' at line ${line}`);
    }
  },
});

if (unresolved.size === 0) {
  console.log('✅ App.jsx: no unresolved identifier references found.');
  process.exit(0);
} else {
  console.error(`❌ App.jsx: ${unresolved.size} unresolved reference(s):`);
  for (const msg of [...unresolved].sort()) console.error(msg);
  process.exit(1);
}
