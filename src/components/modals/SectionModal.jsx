import React from 'react';

export default function SectionModal({
  handleSaveSection,
  sectionForm,
  setSectionForm,
  setSectionModal
}) {
  return (
    <div className="modal-overlay" onClick={() => setSectionModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h3>{sectionForm.id ? '✏️ تعديل بيانات المكان / الصالة' : '🪑 إضافة صالة / مكان جديد'}</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '16px' }}>
              حدد اسم المكان (مثل: أرضي، علوي، عائلات، بارك شباب...)
            </p>
            <form onSubmit={handleSaveSection}>
              <div className="form-group">
                <label>اسم المكان / الصالة:</label>
                <input
                  type="text"
                  required
                  placeholder="مثال: بارك شباب أو عائلات"
                  value={sectionForm.name}
                  onChange={(e) => setSectionForm({ ...sectionForm, name: e.target.value })}
                  autoFocus
                />
              </div>

              <div className="form-group">
                <label>ترتيب العرض (اختياري):</label>
                <input
                  type="number"
                  placeholder="مثال: 1 أو 2"
                  value={sectionForm.sort_order}
                  onChange={(e) => setSectionForm({ ...sectionForm, sort_order: e.target.value })}
                />
              </div>

              <div className="modal-actions">
                <button type="submit" className="btn btn-primary">
                  💾 حفظ المكان
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => setSectionModal(false)}>
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
  );
}
