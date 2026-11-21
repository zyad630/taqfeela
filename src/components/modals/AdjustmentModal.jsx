import React from 'react';

export default function AdjustmentModal({
  adjustmentForm,
  handleSaveAdjustment,
  setAdjustmentForm,
  setAdjustmentModal,
  settings,
  usersList
}) {
  return (
    <div className="modal-overlay" onClick={() => setAdjustmentModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h3>⚖️ تسجيل خصم / مكافأة / غياب لموظف</h3>
            <form onSubmit={handleSaveAdjustment}>
              <div className="form-group">
                <label>الموظف المعني:</label>
                <select
                  required
                  value={adjustmentForm.userId}
                  onChange={(e) => setAdjustmentForm({ ...adjustmentForm, userId: e.target.value })}
                >
                  <option value="">-- اختر الموظف --</option>
                  {usersList.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} (@{u.username}) - {u.role === 'admin' ? 'مدير' : 'كاشير'}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>نوع الإجراء:</label>
                <select
                  value={adjustmentForm.type}
                  onChange={(e) => setAdjustmentForm({ ...adjustmentForm, type: e.target.value })}
                >
                  <option value="penalty">🔻 خصم مالي / جزاء</option>
                  <option value="bonus">🎁 مكافأة مالية / تميز</option>
                  <option value="absence">❌ تسجيل غياب في يوم محدد</option>
                </select>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>تاريخ اليوم المحدد:</label>
                  <input
                    type="date"
                    required
                    value={adjustmentForm.date || new Date().toISOString().slice(0, 10)}
                    onChange={(e) => setAdjustmentForm({ ...adjustmentForm, date: e.target.value })}
                  />
                </div>

                {adjustmentForm.type !== 'absence' ? (
                  <div className="form-group">
                    <label>المبلغ ({settings.currency || 'ج.م'}):</label>
                    <input
                      type="number"
                      step="0.5"
                      required
                      min="0.5"
                      placeholder="مثال: 100"
                      value={adjustmentForm.amount !== undefined && adjustmentForm.amount !== null ? adjustmentForm.amount : ''}
                      onChange={(e) => setAdjustmentForm({ ...adjustmentForm, amount: e.target.value })}
                      autoFocus
                    />
                  </div>
                ) : (
                  <div className="form-group">
                    <label>عدد أيام الغياب:</label>
                    <select
                      value={adjustmentForm.daysCount || '1'}
                      onChange={(e) => setAdjustmentForm({ ...adjustmentForm, daysCount: e.target.value })}
                    >
                      <option value="1">1 يوم كامل</option>
                      <option value="0.5">نصف يوم (0.5)</option>
                      <option value="2">يومان (2)</option>
                      <option value="3">3 أيام</option>
                    </select>
                  </div>
                )}
              </div>

              <div className="form-group">
                <label>سبب الخصم / المكافأة / الغياب بالتفصيل * :</label>
                <input
                  type="text"
                  required
                  placeholder={
                    adjustmentForm.type === 'penalty'
                      ? 'مثال: تأخير ساعة عن الشيفت الصباحي أو عجز'
                      : adjustmentForm.type === 'bonus'
                        ? 'مثال: تحقيق أعلى مبيعات وتميز في الخدمة'
                        : 'مثال: غياب بدون إذن مسبق'
                  }
                  value={adjustmentForm.reason || ''}
                  onChange={(e) => setAdjustmentForm({ ...adjustmentForm, reason: e.target.value })}
                />
              </div>

              <div className="modal-actions">
                <button type="submit" className="btn btn-primary">
                  💾 تأكيد وحفظ بالسجل
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => setAdjustmentModal(false)}>
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
  );
}
