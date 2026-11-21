const fs = require('fs');
const code = fs.readFileSync('src/App.jsx', 'utf8');

const returnIdx = code.indexOf('return (');
const lines = code.split('\n');

const tagStack = [];

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  const regex = /<\/?([a-zA-Z0-9_\.]+)(?:[^>]*?)?(\/?)>/g;
  let match;
  while ((match = regex.exec(line)) !== null) {
    const full = match[0];
    const tagName = match[1];
    const isSelfClosing = match[2] === '/' || full.endsWith('/>');
    const isClosing = full.startsWith('</');
    if (isSelfClosing) continue;
    if (['input', 'img', 'hr', 'br'].includes(tagName)) continue;
    if (isClosing) {
      if (tagStack.length > 0) {
        const top = tagStack[tagStack.length - 1];
        if (top.tagName === tagName) {
          tagStack.pop();
        } else {
          // check if matches an earlier tag
          const idx = tagStack.map(t => t.tagName).lastIndexOf(tagName);
          if (idx !== -1) {
            console.log(`Skipped unclosed tag ${tagStack[tagStack.length - 1].tagName} from line ${tagStack[tagStack.length - 1].line} before closing ${tagName} at line ${i + 1}`);
            tagStack.splice(idx);
          }
        }
      }
    } else {
      tagStack.push({ tagName, line: i + 1 });
    }
  }
}

console.log('Unclosed tags at end of file:');
tagStack.forEach(t => console.log(` <${t.tagName}> from line ${t.line}`));
