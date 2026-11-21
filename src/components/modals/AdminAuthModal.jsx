import React from 'react';

export default function AdminAuthModal({
  adminAuthError,
  adminAuthModal,
  adminAuthPassword,
  adminAuthPrintVoid,
  adminAuthReason = '',
  adminAuthTargetQty,
  handleConfirmAdminAuth,
  setAdminAuthError,
  setAdminAuthModal,
  setAdminAuthPassword,
  setAdminAuthPrintVoid,
  setAdminAuthReason,
  setAdminAuthTargetQty
}) {
  return (
    <div className="modal-overlay" onClick={() => setAdminAuthModal(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '460px', border: '1.5px solid #f59e0b' }}>
            <div style={{ textAlign: 'center', marginBottom: '14px' }}>
              <span style={{ fontSize: '36px' }}>🔐</span>
              <h3 style={{ margin: '8px 0 4px', color: '#f59e0b' }}>موافقة الإدارة المطلوبة</h3>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
                {adminAuthModal.type === 'clear_cart'
                  ? 'يوجد أصناف تم إرسالها للبار بالفعل. إفراغ السلة يتطلب تصريح المشرف/الأدمن'
                  : adminAuthModal.type === 'edit_after_check_printed'
                    ? `تمت طباعة شيك الحساب للعميل مسبقاً. ${adminAuthModal.actionName ? adminAuthModal.actionName + ' ' : ''}يتطلب موافقة الأدمن لفك قفل الطاولة.`
                    : adminAuthModal.type === 'reprint_prebill_check'
                      ? 'تمت طباعة شيك الحساب للعميل لهذه الطاولة مسبقاً. إعادة طباعة الشيك تتطلب موافقة الأدمن لمنع التكرار.'
                      : adminAuthModal.targetQty <= 0
                        ? `إلغاء صنف "${adminAuthModal.item?.name}" بعد إرساله للبار يتطلب كلمة سر الأدمن`
                        : `تخفيض كمية "${adminAuthModal.item?.name}" بعد إرسالها للبار يتطلب كلمة سر الأدمن`}
              </p>
            </div>

            {adminAuthModal.item && (
              <div style={{ background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.25)', borderRadius: '8px', padding: '12px', marginBottom: '14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span>الصنف:</span>
                  <strong>{adminAuthModal.item.name}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span>الكمية المسجلة بالسلة:</span>
                  <span>{adminAuthModal.item.qty}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span>تم إرسالها للبار:</span>
                  <span style={{ color: '#f59e0b', fontWeight: 'bold' }}>{adminAuthModal.item.sent_qty || 0}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px', paddingTop: '8px', borderTop: '1px dashed rgba(255,255,255,0.1)' }}>
                  <span>الكمية الجديدة المطلوبة:</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => setAdminAuthTargetQty(prev => Math.max(0, prev - 1))}
                      style={{ padding: '2px 10px', fontSize: '16px' }}
                    >-</button>
                    <input
                      type="number"
                      min="0"
                      max={adminAuthModal.item.qty}
                      value={adminAuthTargetQty}
                      onChange={(e) => setAdminAuthTargetQty(Math.max(0, parseInt(e.target.value) || 0))}
                      style={{ width: '60px', textAlign: 'center', padding: '4px', borderRadius: '6px', background: 'var(--bg-input, var(--bg-card))', color: 'var(--text-main)', border: '1px solid var(--border-color)' }}
                    />
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => setAdminAuthTargetQty(prev => Math.min(adminAuthModal.item.qty, prev + 1))}
                      style={{ padding: '2px 10px', fontSize: '16px' }}
                    >+</button>
                  </div>
                </div>
              </div>
            )}

            {adminAuthError && (
              <div className="login-alert-danger" style={{ marginBottom: '12px' }}>
                ⚠️ {adminAuthError}
              </div>
            )}

            <form onSubmit={handleConfirmAdminAuth}>
              {(adminAuthModal.item || adminAuthModal.type === 'clear_cart') && setAdminAuthReason && (
                <div className="form-group" style={{ marginBottom: '10px' }}>
                  <label>سبب الإلغاء / التعديل (يظهر في تقرير الإلغاءات):</label>
                  <input
                    type="text"
                    placeholder="مثلاً: العميل غيّر رأيه / خطأ في الإدخال..."
                    value={adminAuthReason}
                    onChange={(e) => setAdminAuthReason(e.target.value)}
                  />
                </div>
              )}

              <div className="form-group">
                <label>كلمة مرور الأدمن / المشرف:</label>
                <input
                  type="password"
                  required
                  placeholder="أدخل كلمة مرور الأدمن للتصريح..."
                  value={adminAuthPassword}
                  onChange={(e) => {
                    setAdminAuthPassword(e.target.value);
                    setAdminAuthError('');
                  }}
                  autoFocus
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '12px 0' }}>
                <input
                  type="checkbox"
                  id="chkPrintVoid"
                  checked={adminAuthPrintVoid}
                  onChange={(e) => setAdminAuthPrintVoid(e.target.checked)}
                />
                <label htmlFor="chkPrintVoid" style={{ fontSize: '13px', cursor: 'pointer', margin: 0 }}>
                  🖨️ طباعة بون إشعار إلغاء/تعديل لطابعة البار
                </label>
              </div>

              <div className="modal-actions" style={{ marginTop: '16px' }}>
                <button type="submit" className="btn btn-warning" style={{ fontWeight: 'bold' }}>
                  ✅ اعتماد الحذف / التعديل
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => setAdminAuthModal(null)}>
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
  );
}
