import React from 'react';

export default function EditExpenseModal({
  editExpenseForm,
  handleUpdateExpense,
  setEditExpenseForm,
  setEditingExpense,
  settings
}) {
  return (
    <div className="modal-overlay" onClick={() => setEditingExpense(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '480px' }}>
            <h3>✏️ تعديل وتغيير بند المصروف</h3>
            <form onSubmit={handleUpdateExpense}>
              <div className="form-group">
                <label>قيمة المصروف ({settings.currency || 'ج.م'}):</label>
                <input
                  type="number"
                  step="0.5"
                  required
                  value={editExpenseForm.amount}
                  onChange={(e) => setEditExpenseForm({ ...editExpenseForm, amount: e.target.value })}
                  autoFocus
                />
              </div>

              <div className="form-group">
                <label>بند / صنف المصروف:</label>
                <select
                  value={editExpenseForm.category}
                  onChange={(e) => setEditExpenseForm({ ...editExpenseForm, category: e.target.value })}
                  style={{ marginBottom: '8px' }}
                >
                  <option value="مشتريات خامات (بن/حليب/سكر/مستلزمات)">مشتريات خامات (بن/حليب/سكر/مستلزمات)</option>
                  <option value="شراء بن وتوليفات">شراء بن وتوليفات</option>
                  <option value="شراء حليب وألبان">شراء حليب وألبان</option>
                  <option value="مستلزمات وأكواب وأكياس">مستلزمات وأكواب وأكياس</option>
                  <option value="يوميات ونثريات عمال">يوميات ونثريات عمال</option>
                  <option value="فواتير وكهرباء ومياه">فواتير وكهرباء ومياه</option>
                  <option value="صيانة ونظافة">صيانة ونظافة</option>
                  <option value="مصروفات إدارية أخرى">مصروفات إدارية أخرى</option>
                </select>
                <input
                  type="text"
                  placeholder="أو اكتب صنف/بند مخصص هنا..."
                  value={editExpenseForm.category}
                  onChange={(e) => setEditExpenseForm({ ...editExpenseForm, category: e.target.value })}
                  style={{ fontSize: '12.5px' }}
                />
              </div>

              <div className="form-group">
                <label>ملاحظات إضافية:</label>
                <input
                  type="text"
                  placeholder="ملاحظات توضيحية..."
                  value={editExpenseForm.notes || ''}
                  onChange={(e) => setEditExpenseForm({ ...editExpenseForm, notes: e.target.value })}
                />
              </div>

              <div className="modal-actions">
                <button type="submit" className="btn btn-primary">حفظ التعديلات وتحديث الخزينة</button>
                <button type="button" className="btn btn-secondary" onClick={() => setEditingExpense(null)}>إلغاء</button>
              </div>
            </form>
          </div>
        </div>
  );
}
