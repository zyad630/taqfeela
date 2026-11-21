const fs = require('fs');
const iconv = require('iconv-lite');

const original = fs.readFileSync('src/App.jsx', 'utf8');
const buf = iconv.encode(original, 'win1256');
const decoded = iconv.decode(buf, 'utf8');

console.log('Original length:', original.length);
console.log('Decoded length:', decoded.length);

// Check some known Arabic snippets
const lines = decoded.split('\n');
console.log('Sample lines from decoded:');
for (let i = 120; i < 135; i++) {
  console.log(`Line ${i}:`, lines[i]);
}

// Check lines around 4580 (password modal)
for (let i = 4580; i < 4595; i++) {
  console.log(`Line ${i}:`, lines[i]);
}
