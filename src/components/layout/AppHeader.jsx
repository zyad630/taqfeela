import React from 'react';

export default function AppHeader({
  currentUser,
  handleLogout,
  handleReturnToCashier,
  loadExpensesList,
  savedCashierUser,
  setAdminOverlayError,
  setAdminOverlayModal,
  setAdminOverlayPassword,
  setCloseShiftModal,
  setExpenseModal,
  setExpensesModal,
  settings,
  shift,
  vendorDevFeatures
}) {
  return (
    <header className="main-header">
        <div className="header-brand">
          <div className="logo-badge">☕</div>
          <div>
            <h1 className="brand-title">{settings.cafe_name || 'التكية أسيوط الجديدة'}</h1>
            <span className="brand-subtitle">نظام تقفيلة لإدارة الكافيهات والمحلات</span>
          </div>
        </div>

        {/* User Profile Pill in Header */}
        <div className="user-profile-pill">
          <div className="user-avatar">{currentUser.role === 'admin' ? '👑' : '👤'}</div>
          <div className="user-meta">
            <div className="user-name-row">
              <strong>{currentUser.name}</strong>
              <span className={`role-badge ${currentUser.role === 'admin' ? 'role-admin' : 'role-cashier'}`}>
                {currentUser.role === 'admin' ? 'مدير النظام' : 'كاشير'}
              </span>
            </div>
          </div>
        </div>

        {/* Live Shift Status Bar: إجمالي المبيعات والطلبات ظاهرة افتراضياً، ومبيعات الدرج وفودافون كاش تتفعل من إعدادات المطور */}
        {shift && (
          <div className="shift-status-pill">
            <div className="status-item">
              <span className="status-label">إجمالي المبيعات:</span>
              <strong className="status-val">{shift.total_sales || 0} {settings.currency || 'ج.م'}</strong>
            </div>
            <div className="divider"></div>
            <div className="status-item">
              <span className="status-label">الطلبات:</span>
              <strong className="status-val">{shift.total_orders || 0}</strong>
            </div>
            {vendorDevFeatures.show_shift_status_bar && (
              <>
                <div className="divider"></div>
                <div className="status-item" title="مبيعات فودافون كاش والمحافظ الإلكترونية">
                  <span className="status-label">📱 فودافون كاش:</span>
                  <strong className="status-val" style={{ color: '#60a5fa' }}>{shift.wallet_sales || 0} {settings.currency || 'ج.م'}</strong>
                </div>
                <div className="divider"></div>
                <div className="status-item">
                  <span className="status-label">💵 كاش الدرج:</span>
                  <strong className="status-val text-green">{shift.expected_cash || 0} {settings.currency || 'ج.م'}</strong>
                </div>
              </>
            )}
          </div>
        )}


        {shift?.is_overdue && (
          <div
            className="shift-overdue-alert"
            onClick={() => setCloseShiftModal(true)}
            title="انقر لإنهاء الوردية"
            style={{
              background: 'linear-gradient(135deg, #ef4444, #b91c1c)',
              color: '#fff',
              padding: '6px 14px',
              borderRadius: '20px',
              fontSize: '12px',
              fontWeight: '700',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 2px 8px rgba(239, 68, 68, 0.35)',
              cursor: 'pointer'
            }}
          >
            <span>⚠️</span>
            <span>الشيفت مفتوح منذ {Math.round(shift.open_hours)} ساعة! اضغط لإغلاقه وبدء وردية جديدة</span>
          </div>
        )}

        {/* Actions */}
        <div className="header-actions" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {/* Admin Quick-Access Button (shown to cashiers only) */}
          {currentUser?.role !== 'admin' && !savedCashierUser && (
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => {
                setAdminOverlayModal(true);
                setAdminOverlayPassword('');
                setAdminOverlayError('');
              }}
              title="دخول سريع لوضع المدير بدون إغلاق الشيفت"
              style={{
                background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                color: '#fff',
                fontWeight: 'bold',
                border: 'none',
                borderRadius: '8px',
                padding: '6px 14px',
                fontSize: '13px',
                boxShadow: '0 2px 8px rgba(245,158,11,0.3)'
              }}
            >
              👑 دخول الأدمن
            </button>
          )}
          {/* Return to Cashier Button (shown when in admin overlay mode) */}
          {savedCashierUser && (
            <button
              type="button"
              className="btn btn-sm"
              onClick={handleReturnToCashier}
              title="العودة لوضع الكاشير والشيفت الحالي"
              style={{
                background: 'linear-gradient(135deg, #10b981, #059669)',
                color: '#fff',
                fontWeight: 'bold',
                border: 'none',
                borderRadius: '8px',
                padding: '6px 14px',
                fontSize: '13px',
                boxShadow: '0 2px 8px rgba(16,185,129,0.3)',
                animation: 'pulse 2s infinite'
              }}
            >
              🔄 رجوع للكاشير ({savedCashierUser.name})
            </button>
          )}
          <button
            type="button"
            className="btn btn-outline-warning btn-sm"
            onClick={() => {
              loadExpensesList();
              setExpensesModal(true);
            }}
            title="عرض وتعديل وتغيير بنود كافة المصروفات"
            style={{ fontWeight: 'bold' }}
          >
            📋 سجل وتعديل المصروفات
          </button>
          <button className="btn btn-warning btn-sm" onClick={() => setExpenseModal(true)}>
            💸 تسجيل مصروف
          </button>
          <button className="btn btn-danger btn-sm" onClick={() => setCloseShiftModal(true)}>
            🔒 إغلاق الشيفت
          </button>
        </div>
      </header>
  );
}
