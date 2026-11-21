const fs = require('fs');
const appLines = fs.readFileSync('src/App.jsx', 'utf8').split('\n');
const bakLines = fs.readFileSync('src/App.jsx.bak', 'utf8').split('\n');

console.log('Total appLines:', appLines.length);
console.log('Total bakLines:', bakLines.length);

let diffs = 0;
let qMarksInApp = 0;

for (let i = 0; i < Math.min(appLines.length, bakLines.length); i++) {
  const al = appLines[i];
  const bl = bakLines[i];
  if (al !== bl) {
    diffs++;
    if (al.includes('?') && !bl.includes('?')) {
      qMarksInApp++;
      if (qMarksInApp <= 15) {
        console.log(`[Diff at line ${i+1}]`);
        console.log('   BAK (clean):', bl.trim());
        console.log('   APP (broken):', al.trim());
      }
    }
  }
}
console.log(`\nTotal different lines: ${diffs}`);
console.log(`Lines where App.jsx has ? and Bak had clean Arabic: ${qMarksInApp}`);
