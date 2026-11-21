export const stripRev = (c) => {
  if (!c || typeof c !== 'object') return c;
  const { _rev, ...rest } = c;
  return rest;
};
export const cartChanged = (a, b) => JSON.stringify(stripRev(a)) !== JSON.stringify(stripRev(b));
// لقطة الـ poll قديمة لو حصل تعديل محلي أو عملية حساسة بعد ما بدأت
export const isSnapshotStale = ({ busy, seqAtStart, seqNow }) => Boolean(busy) || seqAtStart !== seqNow;
export const escapeHtml = (v) => String(v == null ? '' : v)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
