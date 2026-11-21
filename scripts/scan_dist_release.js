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

function checkFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    for (let p of patterns) {
      if (p.test(content)) {
        return { filePath, pattern: p.toString() };
      }
    }
  } catch (e) {}
  return null;
}

const distJs = 'dist/assets/index-BW9u7_Pg.js';
console.log('Checking dist:', checkFile(distJs));

// Also check all files in release
function scanRelease(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (let e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      scanRelease(full);
    } else if (/\.(js|html|json)$/i.test(e.name)) {
      const res = checkFile(full);
      if (res) console.log('Corrupted in release:', res);
    }
  }
}

if (fs.existsSync('release')) {
  scanRelease('release');
}
