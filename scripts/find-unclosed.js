const fs = require('fs');
const babel = require('@babel/parser');
const code = fs.readFileSync('src/App.jsx', 'utf8');

// Tokenize code
const tokens = [];
try {
  babel.parse(code, {
    sourceType: 'module',
    plugins: ['jsx'],
    tokens: true,
    onToken: (t) => tokens.push(t)
  });
} catch (e) {
  // e will be thrown when it fails
}

const stack = [];
for (const t of tokens) {
  if (t.type.label === '{') {
    stack.push(t);
  } else if (t.type.label === '}') {
    stack.pop();
  }
}

console.log('Unclosed { token count:', stack.length);
stack.forEach((t) => {
  console.log(`Unclosed { at line ${t.loc.start.line}, col ${t.loc.start.column}`);
});
