import React from 'react';

export default function CloseShiftModal({
  actualCashInput,
  closeNotesInput,
  handleConfirmCloseShift,
  pendingCloseShift,
  setActualCashInput,
  setCloseNotesInput,
  setCloseShiftModal,
  setShiftBlockerModal,
  setShiftOverridePassword,
  settings,
  shift,
  shiftBlockerModal,
  shiftOverridePassword
}) {
  return (
    <div className="modal-overlay" onClick={() => { setCloseShiftModal(false); setShiftBlockerModal(null); setShiftOverridePassword(''); }}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h3>🔒 تقفيل وإغلاق الشيفت</h3>
            <div className="shift-stats-box">
              <div><strong>💼 عهدة البداية (الكاش الافتتاحي):</strong> {shift.opening_cash || 0} {settings.currency || 'ج.م'}</div>
              <div><strong>💵 مبيعات كاش نقدي:</strong> {shift.cash_sales || 0} {settings.currency || 'ج.م'}</div>
              {(Number(shift.debt_collections) || 0) > 0 && (
                <div><strong>📥 تحصيل ديون ونوتة:</strong> +{shift.debt_collections} {settings.currency || 'ج.م'}</div>
              )}
              <div><strong>📱 محفظة إلكترونية:</strong> {shift.wallet_sales || 0} {settings.currency || 'ج.م'}</div>
              <div><strong>📋 المصروفات المسجلة:</strong> -{shift.expenses_total || 0} {settings.currency || 'ج.م'}</div>
              {(Number(shift.refunds_total) || 0) > 0 && (
                <div><strong>🔄 المرتجعات:</strong> -{shift.refunds_total} {settings.currency || 'ج.م'}</div>
              )}
              <hr />
              <div className="expected-cash-highlight">
                <span>💰 الكاش المتوقع بالدرج (نقدي فقط):</span>
                <strong>{shift.expected_cash || 0} {settings.currency || 'ج.م'}</strong>
              </div>
            </div>

            <div className="form-group">
              <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>المبلغ الفعلي الموجود بالدرج حالياً:</span>
                <small style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
                  (اكتب ما في الدرج فعلياً أو اكتب قيمة العجز مباشرة مثل -50)
                </small>
              </label>
              <input
                type="number"
                placeholder={shift.expected_cash || 0}
                value={actualCashInput}
                onChange={(e) => setActualCashInput(e.target.value)}
                autoFocus
              />
              {actualCashInput !== '' && (() => {
                const rawVal = parseFloat(actualCashInput) || 0;
                const diff = rawVal < 0 ? rawVal : (rawVal - (shift.expected_cash || 0));
                const isShortage = diff < -0.01;
                const isSurplus = diff > 0.01;
                return (
                  <div className={`diff-alert ${isShortage ? 'text-danger' : (isSurplus ? 'text-green' : '')}`} style={{ marginTop: '8px', padding: '8px 12px', borderRadius: '6px', background: isShortage ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)', fontWeight: 'bold' }}>
                    الفارق: {diff.toFixed(2)} {settings.currency || 'ج.م'}
                    {isShortage && ` ⚠️ (عجز / نقص في الدرج بقيمة ${Math.abs(diff).toFixed(2)})`}
                    {isSurplus && ` 🎉 (زيادة / فائض في الدرج بقيمة ${diff.toFixed(2)})`}
                    {!isShortage && !isSurplus && ' ✅ (الدرج مطابق تماماً بدون عجز أو زيادة)'}
                  </div>
                );
              })()}
            </div>

            <div className="form-group">
              <label>ملاحظات الإغلاق:</label>
              <input
                type="text"
                placeholder="ملاحظات تسليم الشيفت"
                value={closeNotesInput}
                onChange={(e) => setCloseNotesInput(e.target.value)}
              />
            </div>

            {shiftBlockerModal && (
              <div style={{ background: 'rgba(239, 68, 68, 0.12)', border: '1px solid #ef4444', padding: '14px', borderRadius: '8px', marginBottom: '15px' }}>
                <div style={{ color: '#ef4444', fontWeight: 'bold', fontSize: '14px', marginBottom: '8px' }}>
                  ⚠️ تنبيه: لا يمكن إغلاق الشيفت لوجود عمليات معلقة!
                </div>
                <div style={{ fontSize: '13px', lineHeight: '1.6', marginBottom: '10px' }}>
                  {shiftBlockerModal.openTablesCount > 0 && <div>• عدد الطاولات المفتوحة: <strong>{shiftBlockerModal.openTablesCount}</strong> طاولة</div>}
                  {shiftBlockerModal.pendingOrdersCount > 0 && <div>• عدد الطلبات المعلقة: <strong>{shiftBlockerModal.pendingOrdersCount}</strong> طلب</div>}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px' }}>
                  لترحيل الطاولات وإغلاق الشيفت الحالي، يلزم إدخال كلمة مرور المدير (Admin):
                </div>
                <input
                  type="password"
                  placeholder="كلمة مرور المدير للتجاوز"
                  value={shiftOverridePassword}
                  onChange={(e) => setShiftOverridePassword(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-card)' }}
                  autoFocus
                />
              </div>
            )}

            <div className="modal-actions">
              <button className="btn btn-danger" onClick={() => handleConfirmCloseShift(shiftOverridePassword)} disabled={pendingCloseShift}>
                {pendingCloseShift ? '⏳ جاري إغلاق الشيفت...' : (shiftBlockerModal ? '🔓 تأكيد التجاوز وإغلاق الشيفت' : 'تأكيد إغلاق الشيفت')}
              </button>
              <button className="btn btn-secondary" onClick={() => { setCloseShiftModal(false); setShiftBlockerModal(null); setShiftOverridePassword(''); }}>
                إلغاء
              </button>
            </div>
          </div>
        </div>
  );
}
