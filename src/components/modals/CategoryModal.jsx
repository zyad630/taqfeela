import React from 'react';

export default function CategoryModal({
  categoryForm,
  handleSaveCategory,
  setCategoryForm,
  setCategoryModal
}) {
  return (
    <div className="modal-overlay" onClick={() => setCategoryModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '440px' }}>
            <h3>{categoryForm.id ? '✏️ تعديل اسم القسم' : '➕ إضافة قسم منيو جديد'}</h3>
            <form onSubmit={handleSaveCategory}>
              <div className="form-group">
                <label>اسم القسم:</label>
                <input
                  type="text"
                  required
                  placeholder="مثال: مشروبات ساخنة، عصائر..."
                  value={categoryForm.name}
                  onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })}
                  autoFocus
                />
              </div>

              <div className="form-group">
                <label>أيقونة القسم (Emoji):</label>
                <input
                  type="text"
                  placeholder="مثال: ☕ أو 🥤 أو 🍰"
                  value={categoryForm.icon || '☕'}
                  onChange={(e) => setCategoryForm({ ...categoryForm, icon: e.target.value })}
                />
              </div>

              <div className="modal-actions" style={{ marginTop: '16px' }}>
                <button type="submit" className="btn btn-primary">
                  💾 حفظ القسم
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => setCategoryModal(false)}>
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
  );
}
