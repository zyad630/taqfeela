import React from 'react';

export default function LicenseActivationScreen({
  handleActivateLicense,
  licenseData,
  licenseError,
  licenseInput,
  setLicenseInput
}) {
  return (
    <div className="modal-overlay" style={{ zIndex: 99998, background: 'rgba(0, 0, 0, 0.9)', backdropFilter: 'blur(10px)' }}>
          <div className="modal-card" style={{ maxWidth: '520px', border: '1px solid rgba(245, 158, 11, 0.6)' }}>
            <div className="modal-header">
              <h2 style={{ color: '#f59e0b', fontSize: '22px' }}>🔐 تفعيل رخصة البرنامج (Cafe POS License)</h2>
              <p style={{ margin: '6px 0 0', fontSize: '14px', color: 'var(--text-muted)' }}>
                نسخة تجارية مقفلة على هذا الجهاز. يرجى إدخال كود الترخيص للتفعيل الفوري بدون إنترنت.
              </p>
            </div>

            <div style={{ background: 'var(--bg-main)', padding: '12px 16px', borderRadius: 'var(--radius-md)', margin: '14px 0', border: '1px solid var(--border-color)' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block' }}>معرف جهازك (Machine ID):</span>
              <code style={{ fontSize: '15px', color: '#60a5fa', fontWeight: 'bold', letterSpacing: '1px', userSelect: 'all' }}>
                {licenseData.machineId || 'CAFE-MACHINE-001'}
              </code>
            </div>

            {licenseError && (
              <div className="login-error-badge" style={{ marginBottom: '14px' }}>
                ⚠️ {licenseError}
              </div>
            )}

            <form onSubmit={handleActivateLicense}>
              <div className="form-group">
                <label>كود التفعيل (License Key) * :</label>
                <input
                  type="text"
                  required
                  placeholder="الصق كود الترخيص هنا..."
                  value={licenseInput}
                  onChange={(e) => setLicenseInput(e.target.value)}
                />
              </div>
              <div className="modal-actions" style={{ marginTop: '18px' }}>
                <button type="submit" className="btn btn-primary" style={{ width: '100%', fontSize: '15px' }}>
                  ⚡ تفعيل البرنامج الآن
                </button>
              </div>
            </form>
          </div>
        </div>
  );
}
