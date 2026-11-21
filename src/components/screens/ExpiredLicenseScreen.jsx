import React from 'react';

export default function ExpiredLicenseScreen({
  handleActivateLicense,
  licenseData,
  licenseError,
  licenseInput,
  setLicenseInput
}) {
  return (
    <div className="modal-overlay" style={{ zIndex: 99998, background: 'rgba(0, 0, 0, 0.95)', backdropFilter: 'blur(10px)' }}>
          <div className="modal-card" style={{ maxWidth: '520px', border: '1px solid rgba(239, 68, 68, 0.6)' }}>
            <div className="modal-header">
              <h2 style={{ color: '#ef4444', fontSize: '22px' }}>🔒 انتهت صلاحية ترخيص البرنامج</h2>
              <p style={{ margin: '6px 0 0', fontSize: '14px', color: 'var(--text-muted)' }}>
                انتهى ترخيصك ولا يمكن استخدام البرنامج حتى تجديد الترخيص. تواصل مع المورد للحصول على كود تجديد.
              </p>
            </div>

            <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '8px', padding: '12px 16px', margin: '14px 0' }}>
              <div style={{ fontSize: '13px', color: '#fca5a5', marginBottom: '6px' }}>
                ⚠️ انتهى الترخيص بتاريخ: <strong style={{ color: '#ef4444' }}>{licenseData.expiresAt}</strong>
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>معرف جهازك (Machine ID):</div>
              <code style={{ fontSize: '15px', color: '#60a5fa', fontWeight: 'bold', letterSpacing: '1px', userSelect: 'all' }}>
                {licenseData.machineId}
              </code>
            </div>

            {licenseError && (
              <div className="login-error-badge" style={{ marginBottom: '14px' }}>
                ⚠️ {licenseError}
              </div>
            )}

            <form onSubmit={handleActivateLicense}>
              <div className="form-group">
                <label>كود التجديد (Renewal License Key):</label>
                <input
                  type="text"
                  required
                  placeholder="الصق كود التجديد هنا..."
                  value={licenseInput}
                  onChange={(e) => setLicenseInput(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="modal-actions" style={{ marginTop: '18px' }}>
                <button type="submit" className="btn btn-primary" style={{ width: '100%', fontSize: '15px', background: 'linear-gradient(135deg, #dc2626, #ef4444)' }}>
                  🔄 تجديد الترخيص وفتح البرنامج
                </button>
              </div>
            </form>
          </div>
        </div>
  );
}
