const iconv = require('iconv-lite');

const sample = 'ط§ظ„ظ…ط¯ظٹط±';
const buf = iconv.encode(sample, 'win1256');
const decoded = iconv.decode(buf, 'utf8');

console.log('Original:', sample);
console.log('Decoded from win1256 -> utf8:', decoded);

const sample2 = 'طھط³ط¬ظٹظ„ ط§ظ„ط¯ط®ظˆظ„';
console.log('Sample2 decoded:', iconv.decode(iconv.encode(sample2, 'win1256'), 'utf8'));

const sample3 = 'ظƒظ„ظ…ط© ط§ظ„ظ…ط±ظˆط±';
console.log('Sample3 decoded:', iconv.decode(iconv.encode(sample3, 'win1256'), 'utf8'));
