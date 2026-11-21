const fs = require('fs');
const babel = require('@babel/parser');
const code = fs.readFileSync('src/App.jsx', 'utf8');
const lines = code.split('\n');

for (let step = 500; step <= lines.length; step += 300) {
  const start = Math.max(0, step - 300);
  const copy = [...lines];
  // Replace lines from start to step with a dummy comment
  copy.splice(start, step - start, '/* removed */');
  try {
    babel.parse(copy.join('\n'), { sourceType: 'module', plugins: ['jsx'] });
    console.log(`Fixes when removing range ${start + 1} - ${step}`);
  } catch (e) {
    //
  }
}
