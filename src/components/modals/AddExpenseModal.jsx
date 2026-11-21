import React from 'react';

export default function AddExpenseModal({
  expenseForm,
  handleAddExpense,
  pendingExpense,
  setExpenseForm,
  setExpenseModal,
  settings
}) {
  return (
    <div className="modal-overlay" style={{ zIndex: 1001 }} onClick={() => setExpenseModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h3>💸 تسجيل مصروف من الخزينة</h3>
            <form onSubmit={handleAddExpense}>
              <div className="form-group">
                <label>قيمة المصروف ({settings.currency || 'ج.م'}):</label>
                <input
                  type="number"
                  step="0.5"
                  required
                  placeholder="مثال: 150"
                  value={expenseForm.amount !== undefined && expenseForm.amount !== null ? expenseForm.amount : ''}
                  onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })}
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label>بند المصروف:</label>
                <select
                  value={expenseForm.category || 'مشتريات خامات (بن/حليب/سكر/مستلزمات)'}
                  onChange={(e) => setExpenseForm({ ...expenseForm, category: e.target.value })}
                >
                  <option value="مشتريات خامات (بن/حليب/سكر/مستلزمات)">مشتريات خامات (بن/حليب/سكر/مستلزمات)</option>
                  <option value="يوميات ونثريات عمال">يوميات ونثريات عمال</option>
                  <option value="فواتير وكهرباء ومياه">فواتير وكهرباء ومياه</option>
                  <option value="صيانة ونظافة">صيانة ونظافة</option>
                  <option value="مصروفات إدارية أخرى">مصروفات إدارية أخرى</option>
                </select>
              </div>
              <div className="form-group">
                <label>ملاحظات إضافية:</label>
                <input
                  type="text"
                  placeholder="مثال: شراء 2 كيلو بن برازيلي"
                  value={expenseForm.notes || ''}
                  onChange={(e) => setExpenseForm({ ...expenseForm, notes: e.target.value })}
                />
              </div>
              <div className="modal-actions">
                <button type="submit" className="btn btn-primary" disabled={pendingExpense}>
                  {pendingExpense ? '⏳ جاري الحفظ...' : 'تأكيد وخصم من الخزينة'}
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => setExpenseModal(false)}>إلغاء</button>
              </div>
            </form>
          </div>
        </div>
  );
}
