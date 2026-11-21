import React from 'react';

export default function RestoreOrderModal({
  currentUser,
  handleConfirmRestoreOrder,
  orderToRestore,
  restoreAdminPassword,
  setOrderToRestore,
  setRestoreAdminPassword,
  setRestoreModal,
  settings,
  pendingRestoreOrder
}) {
  return (
    <div className="modal-overlay" onClick={() => { setRestoreModal(false); setOrderToRestore(null); setRestoreAdminPassword(''); }}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '460px' }}>
        <h3>🔄 استعادة الفاتورة الملغية</h3>
        <div style={{ background: 'rgba(234,179,8,0.1)', border: '1px solid rgba(234,179,8,0.3)', borderRadius: '8px', padding: '12px 16px', marginBottom: '16px' }}>
          <div><strong>رقم الفاتورة:</strong> #{orderToRestore.id}</div>
          <div><strong>الإجمالي:</strong> {orderToRestore.total} {settings.currency || 'ج.م'}</div>
          {orderToRestore.customer_name && <div><strong>العميل:</strong> {orderToRestore.customer_name}</div>}
          <div style={{ marginTop: '8px', fontSize: '13px', color: '#eab308' }}>
            ℹ️ سيتم إرجاع حالة الفاتورة إلى مكتملة، وإعادة خصم كميات المنتجات من المخزن، وإلغاء استرداد الخزنة.
          </div>
        </div>
        <div className="form-group" style={{ marginTop: '12px' }}>
          <label style={{ color: '#ef4444', fontWeight: 'bold' }}>🔒 كلمة مرور المدير (مطلوبة دائماً لاستعادة الفاتورة):</label>
          <input
            type="password"
            value={restoreAdminPassword}
            onChange={(e) => setRestoreAdminPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleConfirmRestoreOrder();
              }
            }}
            placeholder="أدخل كلمة مرور المدير لتأكيد الاستعادة..."
            autoFocus
            required
          />
        </div>
        <div className="modal-actions">
          <button
            type="button"
            className="btn btn-warning"
            onClick={handleConfirmRestoreOrder}
            disabled={pendingRestoreOrder}
          >
            {pendingRestoreOrder ? '⏳ جاري الاستعادة...' : '🔄 تأكيد الاستعادة'}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => { setRestoreModal(false); setOrderToRestore(null); setRestoreAdminPassword(''); }}
          >
            رجوع
          </button>
        </div>
      </div>
    </div>
  );
}
