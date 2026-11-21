const fs = require('fs');
const path = require('path');
const iconv = require('iconv-lite');

function checkFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  if (content.includes('ط§ظ„') || content.includes('طھط³')) {
    console.log('Mojibake found in:', filePath);
  }
}

function scanDir(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== 'dist' && entry.name !== 'release') {
      scanDir(full);
    } else if (entry.isFile() && (entry.name.endsWith('.jsx') || entry.name.endsWith('.js') || entry.name.endsWith('.html'))) {
      checkFile(full);
    }
  }
}

console.log('Scanning src and electron:');
scanDir(path.join(__dirname, '..', 'src'));
scanDir(path.join(__dirname, '..', 'electron'));
