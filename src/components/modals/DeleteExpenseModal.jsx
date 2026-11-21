import React from 'react';

export default function DeleteExpenseModal({
  deleteExpensePassword,
  handleConfirmDeleteExpense,
  pendingExpense,
  setDeleteExpenseData,
  setDeleteExpensePassword
}) {
  return (
    <div className="modal-overlay" onClick={() => { setDeleteExpenseData(null); setDeleteExpensePassword(''); }}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '440px' }}>
            <h3>🔒 تأكيد حذف المصروف</h3>
            <div style={{ background: 'rgba(239, 68, 68, 0.12)', border: '1px solid #ef4444', padding: '12px', borderRadius: '8px', marginBottom: '14px' }}>
              <p style={{ margin: '0 0 6px 0', fontWeight: 'bold', color: '#ef4444' }}>⚠️ هل أنت متأكد من حذف هذا المصروف؟</p>
              <small style={{ color: 'var(--text-muted)' }}>هذا الإجراء محمي ويتطلب إدخال كلمة مرور مدير النظام (Admin).</small>
            </div>
            <form onSubmit={handleConfirmDeleteExpense}>
              <div className="form-group">
                <label>كلمة مرور المدير:</label>
                <input
                  type="password"
                  placeholder="أدخل كلمة مرور المدير..."
                  value={deleteExpensePassword}
                  onChange={(e) => setDeleteExpensePassword(e.target.value)}
                  autoFocus
                  required
                />
              </div>
              <div className="modal-actions">
                <button type="submit" className="btn btn-danger" disabled={pendingExpense}>
                  {pendingExpense ? '⏳ جاري الحذف...' : '🗑️ تأكيد الحذف'}
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => { setDeleteExpenseData(null); setDeleteExpensePassword(''); }}>
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
  );
}
