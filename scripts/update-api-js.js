const fs = require('fs');
const menuData = require('./menuData');
const apiJs = fs.readFileSync('src/api.js', 'utf8');

const catsCode = 'const DEFAULT_CATEGORIES = ' + JSON.stringify(menuData.categories, null, 2) + ';\n';
const prodsWithIds = menuData.products.map((p, i) => ({ id: i + 1, ...p }));
const prodsCode = 'const DEFAULT_PRODUCTS = ' + JSON.stringify(prodsWithIds, null, 2) + ';\n';

const catStart = apiJs.indexOf('const DEFAULT_CATEGORIES =');
const tableStart = apiJs.indexOf('const DEFAULT_TABLES =');

if (catStart === -1 || tableStart === -1) {
  throw new Error('Could not find markers in src/api.js');
}

let updated = apiJs.slice(0, catStart) + catsCode + '\n' + prodsCode + '\n' + apiJs.slice(tableStart);
if (!updated.includes('bar_printer_name')) {
  updated = updated.replace("printer_name: '',", "printer_name: '',\n  bar_printer_name: '',");
}

fs.writeFileSync('src/api.js', updated, 'utf8');
console.log('src/api.js updated successfully with new menu!');
