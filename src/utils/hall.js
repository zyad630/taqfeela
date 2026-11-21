

// دالة موحدة لتطبيع ومقارنة أسماء الصالات والأقسام لمنع اختفاء الطاولات بسبب الفروق الطفيفة في الهمزات أو المسافات
export function normalizeHallName(name) {
  if (!name) return '';
  return String(name)
    .trim()
    .toLowerCase()
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/\s+/g, ' ');
}



export function isSameHall(hallA, hallB) {
  if (hallA === hallB) return true;
  if (!hallA || !hallB) return false;
  return normalizeHallName(hallA) === normalizeHallName(hallB);
}



// تنسيق اسم الطاولة أو المكان: إذا كان القسم به مكان/طاولة واحدة فقط، يُعرض اسم المكان مباشرة (مثل: عروبه)
export function formatTableDisplay(orderOrTbl, allTables = []) {
  if (!orderOrTbl) return '';
  const rawName = (orderOrTbl.tableName || orderOrTbl.table_name || orderOrTbl.name || '').trim();
  const num = String(orderOrTbl.tableNumber || orderOrTbl.table_number || orderOrTbl.number || '').trim();
  const h = (orderOrTbl.table_hall || orderOrTbl.hall || '').trim();
  const cleanName = rawName.replace(/^طاولة\s*/, '').trim();

  // هل هذا المكان صالة / قسم ذو طاولة واحدة فقط (أو اسم الطاولة يطابق اسم المكان)؟
  const isSameAsHall = Boolean(h && (cleanName === h || rawName === h || num === h));
  const hallTablesCount = (h && Array.isArray(allTables) && allTables.length > 0)
    ? allTables.filter(t => isSameHall(t.hall, h)).length
    : 0;
  const isSinglePlace = isSameAsHall || (h && hallTablesCount === 1 && (cleanName === '1' || num === '1' || !cleanName || cleanName === h));

  if (isSinglePlace) {
    return h;
  }

  const hallTag = (h && h !== 'indoor' && h !== 'outdoor') ? ` (${h.replace(/^صالة\s*/, '')})` : '';
  if (cleanName && num && cleanName !== num) return `طاولة: ${cleanName} (${num})${hallTag}`;
  if (cleanName) return `طاولة: ${cleanName}${hallTag}`;
  if (num) return `طاولة: ${num}${hallTag}`;
  return h || '';
}
