import React from 'react';

export default function ForcePasswordModal({
  confirmPasswordInput,
  currentUser,
  handleForcePasswordChange,
  newPasswordInput,
  passwordChangeError,
  setConfirmPasswordInput,
  setNewPasswordInput
}) {
  return (
    <div className="modal-overlay" style={{ zIndex: 99999, background: 'rgba(0, 0, 0, 0.85)', backdropFilter: 'blur(8px)' }}>
          <div className="modal-card" style={{ maxWidth: '460px', border: '1px solid rgba(239, 68, 68, 0.5)' }}>
            <div className="modal-header">
              <h3 style={{ color: '#ef4444' }}>🔒 تنبيه أمني: تغيير كلمة المرور الافتراضية</h3>
              <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--text-muted)' }}>
                مرحباً {currentUser.name}، هذا الحساب يستخدم كلمة مرور افتراضية. لدواعي الأمان وسلامة البيانات، يجب تعيين كلمة مرور جديدة قوية قبل المتابعة.
              </p>
            </div>

            {passwordChangeError && (
              <div className="login-error-badge" style={{ marginBottom: '14px' }}>
                ⚠️ {passwordChangeError}
              </div>
            )}

            <form onSubmit={handleForcePasswordChange}>
              <div className="form-group">
                <label>كلمة المرور الجديدة * :</label>
                <input
                  type="password"
                  required
                  autoFocus
                  placeholder="أدخل كلمة مرور سرية جديدة"
                  value={newPasswordInput}
                  onChange={(e) => setNewPasswordInput(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label>تأكيد كلمة المرور الجديدة * :</label>
                <input
                  type="password"
                  required
                  placeholder="أعد كتابة كلمة المرور للتأكيد"
                  value={confirmPasswordInput}
                  onChange={(e) => setConfirmPasswordInput(e.target.value)}
                />
              </div>

              <div className="modal-actions" style={{ marginTop: '18px' }}>
                <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>
                  🔐 تعيين كلمة المرور والمتابعة
                </button>
              </div>
            </form>
          </div>
        </div>
  );
}
