const fs = require('fs');
const path = require('path');

const srcDb = path.join(__dirname, '..', 'cafe-pos.db');
if (!fs.existsSync(srcDb)) {
  console.error('Source cafe-pos.db not found!');
  process.exit(1);
}

const roaming = process.env.APPDATA || 'C:\\Users\\zyad\\AppData\\Roaming';
const targets = [
  path.join(roaming, 'cafe-pos'),
  path.join(roaming, 'TaqfeelaPOS')
];

targets.forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log('Created directory:', dir);
  }
  const destDb = path.join(dir, 'cafe-pos.db');
  if (fs.existsSync(destDb)) {
    const backup = path.join(dir, `cafe-pos-corrupt-backup-${Date.now()}.db`);
    fs.copyFileSync(destDb, backup);
    console.log(`Backed up existing ${destDb} to ${backup}`);
  }
  fs.copyFileSync(srcDb, destDb);
  console.log(`Successfully restored healthy DB to: ${destDb} (Size: ${fs.statSync(destDb).size} bytes)`);
});
