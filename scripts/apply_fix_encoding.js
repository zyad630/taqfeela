const fs = require('fs');
const iconv = require('iconv-lite');

const appPath = 'src/App.jsx';
const backupPath = 'src/App.jsx.bak';

const original = fs.readFileSync(appPath, 'utf8');
fs.writeFileSync(backupPath, original, 'utf8');
console.log('Backup created at', backupPath);

const buf = iconv.encode(original, 'win1256');
const decoded = iconv.decode(buf, 'utf8');

fs.writeFileSync(appPath, decoded, 'utf8');
console.log('src/App.jsx successfully restored to UTF-8 Arabic!');
