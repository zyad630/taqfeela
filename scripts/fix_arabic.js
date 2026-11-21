const fs = require('fs');
let code = fs.readFileSync('src/App.jsx', 'utf8');

// Replace all corrupted lines by checking line contents or exact substrings
const lines = code.split('\n');
const newLines = lines.map((line, idx) => {
  const lineNum = idx + 1;

  if (lineNum === 752) {
    return "          showToast('⚠️ يرجى إدخال مبلغ نقدي صحيح');";
  }
  if (lineNum === 769) {
    return "      showToast('🔒 تم تقفيل الشيفت بنجاح وإغلاق الوردية');";
  }
  if (lineNum === 772) {
    return "      showToast(`❌ خطأ أثناء إغلاق الشيفت: ${err.message || 'حدث خطأ غير متوقع'}`);";
  }
  if (lineNum === 826) {
    return "        showToast(`⚠️ مجموع المبالغ المقسمة (${sum} ${settings.currency || 'ج.م'}) لا يطابق إجمالي الفاتورة (${cartTotal} ${settings.currency || 'ج.م'}). يرجى ضبط الأرقام.`);";
  }
  if (lineNum === 1188) {
    return "            <label>اختر فترة وردية الشيفت ({shiftSchedules.length} فترات):</label>";
  }
  if (lineNum === 1667) {
    return "                      💵 كاش";
  }
  if (lineNum === 1673) {
    return "                      📱 محفظة";
  }
  if (lineNum === 1679) {
    return "                      💳 فيزا";
  }
  if (lineNum === 1692) {
    return "                      ⚖️ مقسم";
  }
  if (lineNum === 1700) {
    return "                        <label>💵 كاش (نقدي):</label>";
  }
  if (lineNum === 1709) {
    return "                        <label>📱 محفظة (فودافون/إلكترونية):</label>";
  }
  if (lineNum === 1718) {
    return "                        <label>💳 فيزا (بطاقة):</label>";
  }
  if (lineNum === 1733) {
    return "                              {isMatch ? `✅ المجموع مطابق: ${sum} ${settings.currency || 'ج.م'}` : (";
  }
  if (lineNum === 1735) {
    return "                                  ? `⚠️ متبقي للتوزيع: ${diff} ${settings.currency || 'ج.م'}`";
  }
  if (lineNum === 1736) {
    return "                                  : `⚠️ زيادة عن الإجمالي: ${Math.abs(diff)} ${settings.currency || 'ج.م'}`";
  }
  if (lineNum === 1749) {
    return "                                ضع الباقي بالمحفظة";
  }
  if (lineNum === 1760) {
    return "                                ضع الباقي كاش";
  }
  if (lineNum === 1773) {
    return "                        <span>المبلغ المدفوع من العميل:</span>";
  }
  if (lineNum === 1783) {
    return "                          <span>المتبقي للعميل:</span>";
  }
  if (lineNum === 1784) {
    return "                          <strong>{changeDue} {settings.currency || 'ج.م'}</strong>";
  }
  if (lineNum === 1791) {
    return "                    ✅ إتمام الطلب وطباعة الفاتورة ({cartTotal} {settings.currency || 'ج.م'})";
  }
  if (lineNum === 1804) {
    return "                <h2>🪑 صالات الجلوس وإدارة الطاولات</h2>";
  }
  if (lineNum === 1805) {
    return "                <p>متابعة الطاولات الشاغرة والمشغولة وإدارة طلبات الصالات بكل سهولة</p>";
  }
  if (lineNum === 1812) {
    return "                  الكل ({tables.length})";
  }
  if (lineNum === 1818) {
    return "                  الصالات الداخلية ({tables.filter((t) => t.hall === 'indoor').length})";
  }
  if (lineNum === 1824) {
    return "                  الحديقة الخارجية ({tables.filter((t) => t.hall === 'outdoor').length})";
  }
  if (lineNum === 1844) {
    return "                          {isOccupied ? 'مشغولة' : 'متاحة'}";
  }
  if (lineNum === 1849) {
    return "                        <span>👥 سعة: {tbl.capacity} أفراد</span>";
  }
  if (lineNum === 1850) {
    return "                        <span>{tbl.hall === 'indoor' ? '🏠 داخلية' : '🌳 خارجية'}</span>";
  }
  if (lineNum === 1854) {
    return "                          🛒 طلب معلق ({tableCartsMap[tbl.id].cart.reduce((sum, it) => sum + it.qty, 0)} صنف)";
  }
  if (lineNum === 2617) {
    return "                    <h3 style={{ margin: 0, fontSize: '17px', color: '#f59e0b' }}>مواعيد ورديات الشيفتات (إعدادات الوردية)</h3>";
  }
  if (lineNum === 2618) {
    return "                    <small style={{ color: 'var(--text-muted)' }}>تحديد أوقات فترات العمل في الكافيه، لتسهيل اختيار وقت الشيفت عند الفتح أو للموظفين</small>";
  }
  if (lineNum === 2629) {
    return "                        title=\"أيقونة / رمز الشيفت\"";
  }
  if (lineNum === 2640) {
    return "                        placeholder=\"اسم الشيفت (مثال: الشيفت الصباحي)\"";
  }
  if (lineNum === 2648) {
    return "                        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>من:</span>";
  }
  if (lineNum === 2658) {
    return "                        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>إلى:</span>";
  }
  if (lineNum === 2678) {
    return "                          🗑️ حذف";
  }
  if (lineNum === 2690) {
    return "                        setShiftSchedules([...shiftSchedules, { id: newId, name: `وردية ${shiftSchedules.length + 1}`, start: '08:00', end: '16:00', icon: '☕' }]);";
  }
  if (lineNum === 2693) {
    return "                      + إضافة فترة شيفت جديدة";
  }
  if (lineNum === 2700) {
    return "                      🔄 استعادة الفترات الافتراضية";
  }
  if (lineNum === 3771) {
    return "                <span>المبلغ الفعلي الموجود بالدرج حالياً:</span>";
  }
  if (lineNum === 3773) {
    return "                  (اكتب ما في الدرج فعلياً أو اكتب قيمة العجز مباشرة مثل -50)";
  }
  if (lineNum === 3790) {
    return "                    الفارق: {diff.toFixed(2)} {settings.currency || 'ج.م'}";
  }
  if (lineNum === 3791) {
    return "                    {isShortage && ` ⚠️ (عجز / نقص في الدرج بقيمة ${Math.abs(diff).toFixed(2)})`}";
  }
  if (lineNum === 3792) {
    return "                    {isSurplus && ` 🎉 (زيادة / فائض في الدرج بقيمة ${diff.toFixed(2)})`}";
  }
  if (lineNum === 3793) {
    return "                    {!isShortage && !isSurplus && ' ✅ (الدرج مطابق تماماً بدون عجز أو زيادة)'}";
  }
  if (lineNum === 3800) {
    return "              <label>ملاحظات الإغلاق:</label>";
  }
  if (lineNum === 3803) {
    return "                placeholder=\"ملاحظات تسليم الشيفت\"";
  }
  if (lineNum === 3810) {
    return "              <button className=\"btn btn-danger\" onClick={handleConfirmCloseShift}>تأكيد إغلاق الشيفت</button>";
  }
  if (lineNum === 3811) {
    return "              <button className=\"btn btn-secondary\" onClick={() => setCloseShiftModal(false)}>إلغاء</button>";
  }
  if (lineNum === 4018) {
    return "                    if (val.includes('جميع الأوقات')) {";
  }
  if (lineNum === 4035) {
    return "                  <option value=\"جميع الأوقات (مرن)\">🌟 جميع الأوقات (مرن 24 ساعة 00:00 - 23:59)</option>";
  }
  if (lineNum === 4036) {
    return "                  <option value=\"دوام حر\">⚡ دوام حر (ساعات عمل مرنة)</option>";
  }

  return line;
});

fs.writeFileSync('src/App.jsx', newLines.join('\n'), 'utf8');
console.log('Successfully updated src/App.jsx with all proper Arabic texts!');
