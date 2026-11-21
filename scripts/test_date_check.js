const db = require('../electron/db');
(async () => {
  await db.init();
  const res = db.queryGet("SELECT datetime('now') AS now_utc, date('now', 'localtime') AS lt, date('now') AS utc");
  console.log('SQL Results:', res);
  console.log('toCairoDateString(now):', db.toCairoDateString ? db.toCairoDateString(new Date().toISOString()) : 'N/A');
  const sampleIso = "2026-10-06T23:30:00.000Z"; // 11:30 PM UTC = 2:30 AM Cairo next day!
  const cairoConverted = db.queryGet("SELECT date(?, 'localtime') AS lt, date(?) AS utc", [sampleIso, sampleIso]);
  console.log('Sample 23:30 UTC converted:', cairoConverted);
})();
