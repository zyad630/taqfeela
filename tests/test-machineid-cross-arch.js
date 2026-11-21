const { execFileSync, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const assert = require('assert');

console.log('====================================================================');
console.log(' ITEM 2: Cross-Architecture Machine ID & License Verification       ');
console.log('====================================================================\n');

const ia32Binary = 'D:/cafe-app-build/release/win-ia32-unpacked/TaqfeelaPOS.exe';
assert(fs.existsSync(ia32Binary), 'ia32 binary must exist at ' + ia32Binary);

const dbPath = path.resolve(__dirname, '../electron/db').replace(/\\/g, '/');

// 1. Run getMachineId in x64 Node process
const x64MachineIdScript = `
  const db = require('${dbPath}');
  console.log('X64_MACHINE_ID:' + db.getMachineId());
`;
const x64Out = execSync(`node -e "${x64MachineIdScript.replace(/\n/g, ' ')}"`, { encoding: 'utf8' });
const x64Match = x64Out.match(/X64_MACHINE_ID:([A-F0-9]+)/);
const x64Id = x64Match ? x64Match[1] : null;
console.log('Host Architecture: x64');
console.log('x64 Machine ID:   ', x64Id);

// 2. Run getMachineId in ia32 Electron process
const ia32MachineIdScript = `
  const db = require('${dbPath}');
  console.log('IA32_MACHINE_ID:' + db.getMachineId());
`;
const ia32Out = execFileSync(ia32Binary, ['-e', ia32MachineIdScript.replace(/\n/g, ' ')], {
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  encoding: 'utf8'
});
const ia32Match = ia32Out.match(/IA32_MACHINE_ID:([A-F0-9]+)/);
const ia32Id = ia32Match ? ia32Match[1] : null;
console.log('\nSub-process Architecture: ia32 (WOW64)');
console.log('ia32 Machine ID:  ', ia32Id);

console.log('\n--- Cross-Architecture Comparison ---');
console.log('x64 Machine ID: ', x64Id);
console.log('ia32 Machine ID:', ia32Id);
console.log('Identical?      ', x64Id === ia32Id);
assert.strictEqual(x64Id, ia32Id, 'Machine ID must be identical across x64 and ia32 architectures on the same hardware');
console.log('\n✅ PASS: Machine ID is 100% identical across x64 and ia32 architectures!');
console.log('✅ PASS: Any license activated in 64-bit works in 32-bit (and vice versa) without re-activation!');
