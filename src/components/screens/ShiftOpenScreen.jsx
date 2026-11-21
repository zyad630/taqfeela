import React from 'react';

export default function ShiftOpenScreen({
  closeSummary,
  currentUser,
  handleLogout,
  handleOpenShift,
  pendingOpenShift,
  openingCashInput,
  openingNotesInput,
  setOpeningCashInput,
  setOpeningNotesInput,
  setShiftTypeInput,
  settings,
  shiftSchedules,
  shiftTypeInput
}) {
  return (
    <div className="shift-screen">
        <div className="shift-card-modal">
          <div className="shift-icon">☕</div>
          <h1 style={{ marginBottom: '18px' }}>مرحباً بك، {currentUser.name}</h1>

          {closeSummary && (
            <div className="summary-alert">
              <strong>تم إغلاق الشيفت السابق بنجاح:</strong>
              <div>إجمالي المبيعات: {closeSummary.totalSales || 0} {settings.currency || 'ج.م'}</div>
              <div>الكاش الفعلي بالدرج: {closeSummary.closingCash || 0} {settings.currency || 'ج.م'}</div>
              {closeSummary.cashDifference !== undefined && (
                <div style={{ color: closeSummary.cashDifference < -0.01 ? '#ef4444' : (closeSummary.cashDifference > 0.01 ? '#10b981' : '#6b7280'), fontWeight: 'bold' }}>
                  {closeSummary.cashDifference < -0.01 ? `⚠️ عجز في الدرج: ${Math.abs(closeSummary.cashDifference)}` : (closeSummary.cashDifference > 0.01 ? `🎉 زيادة وفائض: ${closeSummary.cashDifference}` : '✅ مطابق بالكامل')} {settings.currency || 'ج.م'}
                </div>
              )}
            </div>
          )}

          {/* Shift Schedule Preset Selection - Only shown if enable_multi_shifts is enabled in developer settings */}
          {settings.enable_multi_shifts === 'true' && (
            <div className="shift-preset-selector">
              <label>اختر فترة وردية الشيفت ({shiftSchedules.length} فترات):</label>
              <div className="shifts-preset-grid">
                {shiftSchedules.map((s) => {
                  const title = `${s.name} (${s.start} - ${s.end})`;
                  const isActive = shiftTypeInput.includes(s.name) || shiftTypeInput === title;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      className={`shift-preset-btn ${isActive ? 'active' : ''}`}
                      onClick={() => setShiftTypeInput(title)}
                    >
                      <span className="preset-icon">{s.icon || '?'}</span>
                      <strong>{s.name}</strong>
                      <small>{s.start} - {s.end}</small>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="input-group">
            <label>مبلغ عهدة بداية الشيفت (الكاش بالدرج):</label>
            <input
              type="number"
              placeholder="مثال: 500"
              value={openingCashInput}
              onChange={(e) => setOpeningCashInput(e.target.value)}
              autoFocus
            />
          </div>

          <div className="input-group">
            <label>ملاحظات الشيفت (اختياري):</label>
            <input
              type="text"
              placeholder="ملاحظات تسليم الدرج أو الكاشير"
              value={openingNotesInput}
              onChange={(e) => setOpeningNotesInput(e.target.value)}
            />
          </div>

          <div className="shift-open-actions">
            <button className="btn btn-primary btn-lg" onClick={handleOpenShift} disabled={pendingOpenShift}>
              {pendingOpenShift ? '⏳ جاري فتح الشيفت...' : '🚀 فتح الشيفت وبدء البيع'}
            </button>
            <button className="btn btn-secondary" onClick={handleLogout}>
              🔒 تبديل المستخدم / خروج
            </button>
          </div>
        </div>
      </div>
  );
}
