'use strict';

const fs = require('fs');
const path = require('path');

const appDir = path.resolve(__dirname, '../app');
const requiredRoutes = [
  '_layout.tsx',
  'index.tsx',
  '(auth)/pair.tsx',
  '(auth)/login.tsx',
  '(waiter)/tables.tsx',
  'order/[tableId].tsx'
];

if (!fs.existsSync(appDir)) {
  console.error('❌ [CI Route Check] Missing apps/mobile/app/ directory! Expo export would produce an empty app.');
  process.exit(1);
}

const missing = requiredRoutes.filter((rel) => !fs.existsSync(path.join(appDir, rel)));
if (missing.length > 0) {
  console.error('❌ [CI Route Check] Missing required expo-router screens:', missing.join(', '));
  process.exit(1);
}

console.log(`✅ [CI Route Check] Verified ${requiredRoutes.length} required mobile expo-router screens in apps/mobile/app/.`);

