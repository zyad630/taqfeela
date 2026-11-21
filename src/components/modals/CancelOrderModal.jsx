import React from 'react';

export default function CancelOrderModal({
  cancelAdminPassword,
  cancelReasonInput,
  currentUser,
  handleConfirmCancelOrder,
  pendingCancelOrder,
  orderToCancel,
  setCancelAdminPassword,
  setCancelModal,
  setCancelReasonInput,
  setOrderToCancel,
  settings
}) {
  return (
    <div className="modal-overlay" onClick={() => { setCancelModal(false); setOrderToCancel(null); }}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '460px' }}>
            <h3>⚠️ إلغاء الفاتورة</h3>
            <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '8px', padding: '12px 16px', marginBottom: '16px' }}>
              <div><strong>رقم الفاتورة:</strong> #{orderToCancel.id}</div>
              <div><strong>الإجمالي:</strong> {orderToCancel.total} {settings.currency || 'ج.م'}</div>
              {orderToCancel.customer_name && <div><strong>العميل:</strong> {orderToCancel.customer_name}</div>}
              {orderToCancel.payment_method === 'split' && (
                <div style={{ marginTop: '8px', fontSize: '12px', color: '#f59e0b' }}>
                  ⚠️ فاتورة مقسمة - سيتم استرداد كاش: {orderToCancel.cash_amount || 0} + محفظة: {orderToCancel.wallet_amount || 0} {settings.currency || 'ج.م'}
                </div>
              )}
            </div>
            <div className="form-group">
              <label>سبب الإلغاء:</label>
              <input
                type="text"
                value={cancelReasonInput}
                onChange={(e) => setCancelReasonInput(e.target.value)}
                placeholder="أدخل سبب الإلغاء..."
                autoFocus
              />
            </div>
            {orderToCancel.payment_method && currentUser?.role !== 'admin' && (
              <div className="form-group" style={{ marginTop: '12px' }}>
                <label style={{ color: '#ef4444', fontWeight: 'bold' }}>🔒 كلمة مرور المدير (مطلوبة لإلغاء فاتورة مدفوعة):</label>
                <input
                  type="password"
                  value={cancelAdminPassword}
                  onChange={(e) => setCancelAdminPassword(e.target.value)}
                  placeholder="أدخل كلمة مرور المدير..."
                  required
                />
              </div>
            )}
            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-danger"
                onClick={handleConfirmCancelOrder}
                disabled={pendingCancelOrder}
              >
                {pendingCancelOrder ? '⏳ جاري الإلغاء...' : '🗑️ تأكيد الإلغاء'}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => { setCancelModal(false); setOrderToCancel(null); setCancelAdminPassword(''); }}
              >
                رجوع
              </button>
            </div>
          </div>
        </div>
  );
}
