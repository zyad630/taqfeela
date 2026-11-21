import React from 'react';

export default function CategoryManagerModal({
  categories,
  handleDeleteCategory,
  handleMoveCategory,
  products,
  setCategoryForm,
  setCategoryManagerModal,
  setCategoryModal
}) {
  return (
    <div className="modal-overlay" onClick={() => setCategoryManagerModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '580px', width: '95%', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', borderBottom: '1px solid var(--border-color)', paddingBottom: '10px' }}>
              <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>📂</span>
                <span>إدارة وترتيب الأقسام (تصنيفات المنيو)</span>
              </h3>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => {
                  setCategoryForm({ id: null, name: '', icon: '☕' });
                  setCategoryModal(true);
                }}
              >
                + قسم جديد
              </button>
            </div>

            <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '0 0 14px' }}>
              استخدم أزرار (⬆️ للأعلى) و (⬇️ للأسفل) لترتيب ظهور الأقسام في الشريط الجانبي وشاشة المبيعات حسب أولوية عملك.
            </p>

            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', padding: '2px' }}>
              {categories.map((cat, idx) => (
                <div
                  key={cat.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    background: 'var(--bg-main, #0f172a)',
                    border: '1px solid var(--border-color, rgba(255,255,255,0.1))'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '20px' }}>{cat.icon || '☕'}</span>
                    <div>
                      <strong style={{ fontSize: '14px' }}>{cat.name}</strong>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        ترتيب: {idx + 1} | أصناف: {products.filter(p => p.category_id === cat.id).length}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      disabled={idx === 0}
                      onClick={() => handleMoveCategory(idx, -1)}
                      title="تحريك للأعلى"
                      style={{ padding: '4px 10px', fontSize: '13px' }}
                    >
                      ⬆️
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      disabled={idx === categories.length - 1}
                      onClick={() => handleMoveCategory(idx, 1)}
                      title="تحريك للأسفل"
                      style={{ padding: '4px 10px', fontSize: '13px' }}
                    >
                      ⬇️
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => {
                        setCategoryForm({ id: cat.id, name: cat.name, icon: cat.icon || '☕' });
                        setCategoryModal(true);
                      }}
                      title="تعديل"
                    >
                      ✏️
                    </button>
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      onClick={() => handleDeleteCategory(cat.id)}
                      title="حذف"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="modal-actions" style={{ marginTop: '16px' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setCategoryManagerModal(false)}>
                إغلاق
              </button>
            </div>
          </div>
        </div>
  );
}
