const crypto = require('crypto');
const readline = require('readline');
const { execSync } = require('child_process');
const { PRIVATE_KEY_PEM } = require('./generate-license');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.clear();
console.log('================================================================');
console.log('   ☕ أداة توليد كود تفعيل العملاء - تقفيلة كافيه (Cafe POS)  ');
console.log('================================================================');
console.log(' تعمل 100% بدون إنترنت — Ed25519 — تدعم التراخيص بتاريخ انتهاء');
console.log('----------------------------------------------------------------\n');

function addDays(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function askDuration(cleanId) {
  console.log('');
  console.log('  [1] أسبوع واحد   (7 أيام)');
  console.log('  [2] شهر واحد     (30 يوم)');
  console.log('  [3] 3 أشهر       (90 يوم)');
  console.log('  [4] 6 أشهر       (180 يوم)');
  console.log('  [5] سنة كاملة    (365 يوم)');
  console.log('  [6] ادخل عدد أيام مخصص');
  console.log('  [0] ترخيص دائم   (بدون تاريخ انتهاء)');
  console.log('');

  rl.question('👉 اختر نوع الترخيص (0-6): ', (choice) => {
    const c = choice.trim();
    let days = null;
    let label = '';

    if (c === '0') { days = null; label = 'دائم (Permanent)'; }
    else if (c === '1') { days = 7;   label = '7 أيام (أسبوع واحد)'; }
    else if (c === '2') { days = 30;  label = '30 يوم (شهر واحد)'; }
    else if (c === '3') { days = 90;  label = '90 يوم (3 أشهر)'; }
    else if (c === '4') { days = 180; label = '180 يوم (6 أشهر)'; }
    else if (c === '5') { days = 365; label = '365 يوم (سنة كاملة)'; }
    else if (c === '6') {
      rl.question('👉 أدخل عدد الأيام: ', (d) => {
        const n = parseInt(d.trim(), 10);
        if (!n || n < 1) {
          console.log('\n❌ عدد أيام غير صحيح، حاول مرة أخرى.\n');
          return askDuration(cleanId);
        }
        generateAndShow(cleanId, n, `${n} يوم`);
      });
      return;
    } else {
      console.log('\n❌ اختيار غير صحيح.\n');
      return askDuration(cleanId);
    }

    generateAndShow(cleanId, days, label);
  });
}

function generateAndShow(cleanId, days, label) {
  try {
    let licenseKey;
    let expiryDate = null;

    if (days && Number(days) > 0) {
      expiryDate = addDays(Number(days));
      const signData = `${cleanId}|${expiryDate}`;
      const signature = crypto.sign(null, Buffer.from(signData, 'utf8'), PRIVATE_KEY_PEM);
      licenseKey = `${expiryDate}:${signature.toString('base64')}`;
    } else {
      const signature = crypto.sign(null, Buffer.from(cleanId, 'utf8'), PRIVATE_KEY_PEM);
      licenseKey = signature.toString('base64');
    }

    // Auto-copy to Windows clipboard
    try { execSync('clip', { input: licenseKey }); } catch (_) {}

    console.log('\n================================================================');
    console.log(`  🎯 معرّف الجهاز   : ${cleanId}`);
    console.log(`  📅 نوع الترخيص    : ${label}`);
    if (expiryDate) {
      console.log(`  ⏳ صالح حتى       : ${expiryDate}`);
    }
    console.log('----------------------------------------------------------------');
    console.log('  🔑 كود التفعيل للعميل:');
    console.log(`\n  ${licenseKey}\n`);
    console.log('  ✅ تم نسخ الكود تلقائياً للحافظة (Ctrl+V لإرساله)');
    console.log('================================================================\n');

  } catch (err) {
    console.error('❌ خطأ أثناء التشفير:', err.message);
  }

  rl.question('هل تريد توليد كود لعميل آخر؟ (y/n): ', (ans) => {
    const a = ans.trim().toLowerCase();
    if (a === 'y' || a === 'نعم' || a === '1') {
      console.log('\n');
      askMachineId();
    } else {
      console.log('\n👋 شكراً لك، تم إنهاء البرنامج.\n');
      rl.close();
      process.exit(0);
    }
  });
}

function askMachineId() {
  rl.question('👉 الصق معرّف جهاز العميل (Machine ID) واضغط Enter:\n> ', (input) => {
    const cleanId = String(input || '').trim().toUpperCase();
    if (!cleanId || cleanId.length < 8) {
      console.log('\n❌ معرّف الجهاز غير صحيح (يجب أن يكون 8 أحرف على الأقل كما يظهر في البرنامج).\n');
      return askMachineId();
    }
    askDuration(cleanId);
  });
}

askMachineId();
