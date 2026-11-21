const fs = require('fs');
const path = require('path');

const patterns = [
  /[\uFFFD]/,
  /ط§[ظط]/,
  /طھ[ط³]/,
  /ظƒ[ظ„]/,
  /Ã[\u0080-\u00BF]/,
  /Ã˜/,
  /Ã™/,
  /Ù[Ø-ي]/,
  /Ø[§-ي]/
];

function scanFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const matched = [];
    for (let p of patterns) {
      if (p.test(content)) {
        matched.push(p.toString());
      }
    }
    if (matched.length > 0) {
      const lines = content.split('\n');
      const sampleLines = [];
      lines.forEach((l, i) => {
        if (patterns.some(p => p.test(l))) {
          if (sampleLines.length < 10) {
            sampleLines.push(`L${i+1}: ${l.trim().slice(0, 100)}`);
          }
        }
      });
      return { filePath, patterns: matched, samples: sampleLines };
    }
  } catch (e) {}
  return null;
}

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir, { withFileTypes: true });
  for (const item of list) {
    if (['node_modules', '.git', 'dist', 'release', 'backups', '.test-senior-audit'].includes(item.name)) continue;
    const p = path.join(dir, item.name);
    if (item.isDirectory()) {
      results = results.concat(walk(p));
    } else if (/\.(js|jsx|html|css|json|bat|txt|md|sql)$/i.test(item.name)) {
      if (p.includes('temp_scan.js') || p.includes('scan_mojibake.js') || p.includes('test_decode.js')) continue;
      const res = scanFile(p);
      if (res) results.push(res);
    }
  }
  return results;
}

const found = walk('.');
console.log('=== MOJIBAKE SCAN RESULTS ===');
console.log(JSON.stringify(found, null, 2));
