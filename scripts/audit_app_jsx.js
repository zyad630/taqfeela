const fs = require('fs');

const appContent = fs.readFileSync('src/App.jsx', 'utf8');
const lines = appContent.split('\n');

const issues = [];

lines.forEach((line, idx) => {
  const lineNum = idx + 1;
  // Check for mojibake patterns
  if (line.includes('ط§ظ') || line.includes('طھط³') || line.includes('ظƒظ') || line.includes('âڑ') || line.includes('â‌') || line.includes('ًں')) {
    issues.push({ lineNum, type: 'mojibake', text: line.trim() });
  }
  // Check for misplaced question marks inside Arabic text, e.g. "مرحبا ? بك"
  if (/[\u0600-\u06FF]\s*\?\s*[\u0600-\u06FF]/.test(line)) {
    issues.push({ lineNum, type: 'question_mark_arabic', text: line.trim() });
  }
  // Check for unicode replacement character
  if (line.includes('\uFFFD')) {
    issues.push({ lineNum, type: 'replacement_char', text: line.trim() });
  }
});

console.log('Total issues found in src/App.jsx:', issues.length);
if (issues.length > 0) {
  console.log('Sample issues:', issues.slice(0, 20));
} else {
  console.log('src/App.jsx has ZERO mojibake, ZERO replacement chars, ZERO corrupted Arabic question marks!');
}
