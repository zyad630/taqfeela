import React from 'react';

export default function TablesConfigModal({
  handleResetTables,
  setTableCountsForm,
  setTablesConfigModal,
  tableCountsForm
}) {
  return (
    <div className="modal-overlay" onClick={() => setTablesConfigModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h3>🪑 تحديد وضبط عدد الطاولات في الصالات</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '16px' }}>
              حدد عدد الطاولات المراد توفيرها لكل صالة (الداخلية والخارجية)
            </p>
            <form onSubmit={handleResetTables}>
              <div className="form-group">
                <label>🏠 عدد طاولات الصالة الداخلية (Indoor):</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  required
                  placeholder="مثال: 8"
                  value={tableCountsForm.indoorCount}
                  onChange={(e) => setTableCountsForm({ ...tableCountsForm, indoorCount: e.target.value })}
                  autoFocus
                />
              </div>

              <div className="form-group">
                <label>🌳 عدد طاولات الصالة الخارجية (Outdoor):</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  required
                  placeholder="مثال: 6"
                  value={tableCountsForm.outdoorCount}
                  onChange={(e) => setTableCountsForm({ ...tableCountsForm, outdoorCount: e.target.value })}
                />
              </div>

              <div className="modal-actions">
                <button type="submit" className="btn btn-primary">
                  ✅ تطبيق وتحديث الطاولات
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => setTablesConfigModal(false)}>
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
  );
}
