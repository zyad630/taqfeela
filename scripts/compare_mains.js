const fs = require('fs');
const rootMain = fs.readFileSync('main.js', 'utf8');
const elecMain = fs.readFileSync('electron/main.js', 'utf8');

function getHandlers(content) {
  const matches = content.match(/ipcMain\.(handle|on)\s*\(\s*['"][^'"]+['"]/g) || [];
  return matches.map(m => m.replace(/ipcMain\.(handle|on)\s*\(\s*['"]/, '').replace(/['"]$/, ''));
}

const rootH = getHandlers(rootMain);
const elecH = getHandlers(elecMain);

console.log('rootMain handlers count:', rootH.length);
console.log('electron/main.js handlers count:', elecH.length);

const missingInElec = rootH.filter(h => !elecH.includes(h));
console.log('Handlers in rootMain but missing in electron/main.js:', missingInElec);

const missingInRoot = elecH.filter(h => !rootH.includes(h));
console.log('Handlers in electron/main.js but missing in rootMain:', missingInRoot);
