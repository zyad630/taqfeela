import React from 'react';

export default function DeleteDebtModal({
  adminPasswordInput,
  deleteDebtData,
  handleConfirmDeleteDebt,
  setAdminPasswordInput,
  setDeleteDebtData,
  settings
}) {
  return (
    <div className="modal-overlay" onClick={() => setDeleteDebtData(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h3>🔒 تأكيد مسح حساب النوتة</h3>
            <div className="danger-alert-box">
              <p>⚠️ هل أنت متأكد من مسح حساب نوتة العميل <strong>{deleteDebtData.customer_name}</strong> بمبلغ متبقي <strong>{deleteDebtData.remaining_amount} {settings.currency || 'ج.م'}</strong>؟</p>
              <small>هذا الإجراء محمي ويتطلب إدخال كلمة مرور مدير النظام.</small>
            </div>

            <form onSubmit={handleConfirmDeleteDebt}>
              <div className="form-group">
                <label>كلمة مرور مدير النظام:</label>
                <input
                  type="password"
                  required
                  placeholder="أدخل كلمة مرور مدير النظام"
                  value={adminPasswordInput}
                  onChange={(e) => setAdminPasswordInput(e.target.value)}
                  autoFocus
                />
              </div>

              <div className="modal-actions">
                <button type="submit" className="btn btn-danger">
                  🗑️ تأكيد المسح النهائي
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => setDeleteDebtData(null)}>
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
  );
}
