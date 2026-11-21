const fs = require('fs');
const lines = fs.readFileSync('src/App.jsx', 'utf8').split('\n');

const stack = [];

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  // Look for {something && (
  if (/\{\s*.*&&\s*\(\s*$/.test(line) || /\{\s*.*&&\s*\(/.test(line)) {
    stack.push({ line: i + 1, text: line.trim() });
  }
  if (/^\s*\)\s*\}\s*$/.test(line) || /\)\s*\}\s*$/.test(line)) {
    if (stack.length > 0) {
      stack.pop();
    } else {
      console.log('Extra )} at line', i + 1);
    }
  }
}

console.log('Unclosed { ... && ( blocks:', stack);
