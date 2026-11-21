import React, { useState } from 'react';

export default function AdminOverlayModal({
  adminOverlayError,
  adminOverlayPassword,
  handleAdminOverlayLogin,
  setAdminOverlayError,
  setAdminOverlayModal,
  setAdminOverlayPassword
}) {
  const [showPassword, setShowPassword] = useState(false);
  return (
    <div className="modal-overlay" onClick={() => setAdminOverlayModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '440px', border: '1.5px solid #f59e0b' }}>
            <div style={{ textAlign: 'center', marginBottom: '16px' }}>
              <span style={{ fontSize: '40px' }}>👑</span>
              <h3 style={{ margin: '8px 0 4px', color: '#f59e0b' }}>دخول سريع لوضع المدير</h3>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>
                أدخل كلمة مرور الأدمن لفتح كافة الصلاحيات (التقارير، المنيو، الإعدادات) دون إغلاق شيفت الكاشير الحالي.
              </p>
            </div>

            {adminOverlayError && (
              <div className="login-alert-danger" style={{ marginBottom: '12px' }}>
                ⚠️ {adminOverlayError}
              </div>
            )}

            <form onSubmit={handleAdminOverlayLogin}>
              <div className="form-group">
                <label style={{ fontWeight: 'bold', marginBottom: '6px', display: 'block' }}>كلمة مرور المدير (الأدمن):</label>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    placeholder="أدخل كلمة مرور المدير..."
                    value={adminOverlayPassword}
                    onChange={(e) => {
                      setAdminOverlayPassword(e.target.value);
                      setAdminOverlayError('');
                    }}
                    autoFocus
                    style={{ width: '100%', padding: '10px 42px 10px 10px', fontSize: '14px' }}
                  />
                  <button
                    type="button"
                    tabIndex="-1"
                    onClick={() => setShowPassword(!showPassword)}
                    title={showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
                    style={{
                      position: 'absolute',
                      left: '10px',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: '18px',
                      color: 'var(--text-muted)',
                      padding: '4px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      userSelect: 'none'
                    }}
                  >
                    {showPassword ? '👁️‍🗨️' : '👁️'}
                  </button>
                </div>
              </div>

              <div className="modal-actions" style={{ marginTop: '20px', display: 'flex', gap: '10px' }}>
                <button
                  type="submit"
                  className="btn btn-warning"
                  style={{ fontWeight: 'bold', flex: 1, padding: '10px' }}
                >
                  👑 تأكيد والدخول كمدير
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setAdminOverlayModal(false);
                    setAdminOverlayPassword('');
                    setAdminOverlayError('');
                  }}
                  style={{ padding: '10px 16px' }}
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
  );
}
