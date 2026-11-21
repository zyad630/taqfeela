const fs = require('fs');

const bak = fs.readFileSync('src/App.jsx.bak', 'utf8');
const curr = fs.readFileSync('src/App.jsx', 'utf8');

function extractActualTablesSection(code) {
  const needle = "{activeTab === 'tables' &&";
  const startIdx = code.indexOf(needle);
  if (startIdx === -1) return 'NOT FOUND';
  return code.slice(startIdx, startIdx + 2000);
}

console.log('--- BAK ACTUAL TABLES SECTION ---');
console.log(extractActualTablesSection(bak));

console.log('\n--- CURRENT ACTUAL TABLES SECTION ---');
console.log(extractActualTablesSection(curr));
