import React from 'react';

export default function SystemResetModal({
  handleConfirmSystemReset,
  setSystemResetError,
  setSystemResetModal,
  setSystemResetPassword,
  systemResetError,
  systemResetLoading,
  systemResetPassword,
  systemResetType
}) {
  return (
    <div className="modal-overlay" onClick={() => !systemResetLoading && setSystemResetModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '480px', border: systemResetType === 'full_factory' ? '2px solid #ef4444' : '2px solid #f59e0b' }}>
            <div style={{ textAlign: 'center', marginBottom: '14px' }}>
              <span style={{ fontSize: '42px' }}>{systemResetType === 'full_factory' ? '💣' : '🧹'}</span>
              <h3 style={{ margin: '8px 0 6px', color: systemResetType === 'full_factory' ? '#ef4444' : '#f59e0b' }}>
                {systemResetType === 'full_factory' ? 'تأكيد إعادة ضبط المصنع الشامل' : 'تأكيد تصفير العمليات (مع إبقاء المنيو)'}
              </h3>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: '1.5' }}>
                {systemResetType === 'full_factory'
                  ? 'تحذير: سيتم حذف كافة الفواتير، الحسابات، النوتة، والمصروفات، ومسح كافة أصناف المنيو. لا يمكن التراجع عن هذه الخطوة!'
                  : 'سيتم مسح كافة الفواتير واليوميات والورديات وحسابات النوتة والآجل، مع الحفاظ الكامل على أصناف المنيو والأقسام والطاولات والإعدادات.'}
              </p>
            </div>

            {systemResetError && (
              <div className="login-alert-danger" style={{ marginBottom: '12px' }}>
                ⚠️ {systemResetError}
              </div>
            )}

            <form onSubmit={handleConfirmSystemReset}>
              <div className="form-group">
                <label>أدخل كلمة مرور الأدمن للمتابعة:</label>
                <input
                  type="password"
                  required
                  placeholder="كلمة مرور الأدمن..."
                  value={systemResetPassword}
                  onChange={(e) => {
                    setSystemResetPassword(e.target.value);
                    setSystemResetError('');
                  }}
                  autoFocus
                  disabled={systemResetLoading}
                />
              </div>

              <div className="modal-actions" style={{ marginTop: '18px' }}>
                <button
                  type="submit"
                  className={`btn ${systemResetType === 'full_factory' ? 'btn-danger' : 'btn-warning'}`}
                  disabled={systemResetLoading}
                  style={{ fontWeight: 'bold' }}
                >
                  {systemResetLoading ? '⏳ جاري التنفيذ...' : '⚠️ تأكيد التنفيذ الفوري'}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={systemResetLoading}
                  onClick={() => setSystemResetModal(false)}
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
  );
}
