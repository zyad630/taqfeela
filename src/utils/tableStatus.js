

// ================= THERMAL AGING & BON/SYNC HELPERS =================
export function getTableThermalState(tbl, tableCartsMap, sessionTimes) {
  const cartData = (tableCartsMap && (tableCartsMap[tbl.id] || tableCartsMap[String(tbl.id)])) || {};
  const tblCart = cartData.cart || [];
  const hasCart = tblCart.length > 0;
  const isCheckPrinted = Boolean(cartData.printedCheck && hasCart);
  const isOccupied = tbl.status === 'occupied' || hasCart;

  if (!isOccupied && !hasCart) {
    return {
      stage: 'available',
      label: 'متاحة',
      icon: '🟢',
      className: 'heat-available',
      elapsedMinutes: 0,
      timeText: 'فارغة'
    };
  }

  if (isCheckPrinted) {
    const printTime = cartData.printedCheckTime || Date.now();
    const waitMins = Math.max(0, Math.floor((Date.now() - printTime) / 60000));
    return {
      stage: 'check_printed',
      label: 'شيك مطبوع',
      icon: '🧾',
      className: 'is-receipt-ticket',
      elapsedMinutes: waitMins,
      timeText: waitMins > 0 ? `منذ ${waitMins} د` : 'الآن'
    };
  }

  // Calculate elapsed session time
  const openedAt = cartData.openedAt || (sessionTimes && sessionTimes[tbl.id]) || Date.now();
  const elapsedMinutes = Math.max(1, Math.floor((Date.now() - openedAt) / 60000));

  if (elapsedMinutes < 20) {
    return {
      stage: 'cool',
      label: 'بداية الجلسة',
      icon: '🌿',
      className: 'heat-cool',
      elapsedMinutes,
      timeText: `${elapsedMinutes} د`
    };
  } else if (elapsedMinutes < 45) {
    return {
      stage: 'warm',
      label: 'جلسة نشطة',
      icon: '☕',
      className: 'heat-warm',
      elapsedMinutes,
      timeText: `${elapsedMinutes} د`
    };
  } else if (elapsedMinutes < 90) {
    const hours = Math.floor(elapsedMinutes / 60);
    const mins = elapsedMinutes % 60;
    return {
      stage: 'hot',
      label: 'طاولة ساخنة',
      icon: '🔥',
      className: 'heat-hot',
      elapsedMinutes,
      timeText: hours > 0 ? `${hours}:${String(mins).padStart(2, '0')} س` : `${elapsedMinutes} د`
    };
  } else {
    const hours = Math.floor(elapsedMinutes / 60);
    const mins = elapsedMinutes % 60;
    return {
      stage: 'flame',
      label: 'وقت طويل',
      icon: '♨️',
      className: 'heat-flame',
      elapsedMinutes,
      timeText: `${hours}:${String(mins).padStart(2, '0')} س`
    };
  }
}



export function getTableBonStatus(tblCart) {
  if (!tblCart || tblCart.length === 0) return null;
  const totalQty = tblCart.reduce((sum, it) => sum + (Number(it.qty) || 0), 0);
  const sentQty = tblCart.reduce((sum, it) => sum + (Number(it.sent_qty) || 0), 0);
  const unsentQty = Math.max(0, totalQty - sentQty);

  if (unsentQty === 0 && sentQty > 0) {
    return { status: 'sent', label: `بون مطبوع (${sentQty})`, icon: '🚀', className: 'bon-sent' };
  }
  if (unsentQty > 0 && sentQty > 0) {
    return { status: 'partial', label: `جديد (${unsentQty}) / مطبوع (${sentQty})`, icon: '⏳', className: 'bon-partial' };
  }
  return { status: 'unsent', label: `لم يُرسل (${unsentQty})`, icon: '⏳', className: 'bon-unsent' };
}



export function getTableSyncStatus(tblId, inFlightSet) {
  if (inFlightSet && (inFlightSet.has(tblId) || inFlightSet.has(String(tblId)))) {
    return { status: 'saving', label: 'مزامنة...', icon: '🔄', className: 'saving' };
  }
  return { status: 'synced', label: 'متزامن', icon: '🟢', className: 'synced' };
}
