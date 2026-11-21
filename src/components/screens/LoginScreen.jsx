import React, { useState, useEffect } from 'react';
import api from '../../api';
import { MIN_PASSWORD_LENGTH } from '../../constants.js';

export default function LoginScreen({
  closeSummary,
  emergencyConfirmPass,
  emergencyError,
  emergencyNewPass,
  emergencyPin,
  emergencyResetModal,
  emergencySuccess,
  handleEmergencyReset,
  handleLogin,
  pendingLogin,
  licenseData,
  loginError,
  loginFailCount,
  loginForm,
  setCloseSummary,
  setEmergencyConfirmPass,
  setEmergencyError,
  setEmergencyNewPass,
  setEmergencyPin,
  setEmergencyResetModal,
  setEmergencySuccess,
  setLoginForm,
  settings
}) {
  const [needsInitialSetup, setNeedsInitialSetup] = useState(false);
  const [setupCafeName, setSetupCafeName] = useState('');
  const [setupAdminName, setSetupAdminName] = useState('مدير النظام');
  const [setupPassword, setSetupPassword] = useState('');
  const [setupConfirmPassword, setSetupConfirmPassword] = useState('');
  const [setupError, setSetupError] = useState('');
  const [setupSuccess, setSetupSuccess] = useState('');

  // Password visibility states
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showSetupPassword, setShowSetupPassword] = useState(false);
  const [showSetupConfirmPassword, setShowSetupConfirmPassword] = useState(false);
  const [showEmergencyNewPass, setShowEmergencyNewPass] = useState(false);
  const [showEmergencyConfirmPass, setShowEmergencyConfirmPass] = useState(false);
  const [showOldAdminPass, setShowOldAdminPass] = useState(false);

  // Admin password reset modal mode: 'old_password' | 'emergency'
  const [resetMode, setResetMode] = useState('old_password');
  const [oldAdminPass, setOldAdminPass] = useState('');

  useEffect(() => {
    let mounted = true;
    if (api.hasAdminUser) {
      api.hasAdminUser().then((hasAdmin) => {
        if (mounted && hasAdmin === false) {
          setNeedsInitialSetup(true);
        }
      }).catch(() => {});
    }
    return () => { mounted = false; };
  }, []);

  async function handleFirstRunSetup(e) {
    e.preventDefault();
    setSetupError('');
    setSetupSuccess('');
    if (!setupPassword || setupPassword.trim().length < 12) {
      setSetupError('كلمة المرور يجب أن تكون 12 حرفاً على الأقل وتحتوي على أحرف وأرقام');
      return;
    }
    if (setupPassword !== setupConfirmPassword) {
      setSetupError('كلمتا المرور غير متطابقتين');
      return;
    }
    try {
      const cafeInfo = setupCafeName.trim() ? { cafe_name: setupCafeName.trim() } : null;
      const res = await api.setupInitialAdmin(setupPassword.trim(), setupAdminName.trim() || 'مدير النظام', cafeInfo);
      if (res && res.success) {
        setNeedsInitialSetup(false);
        setSetupSuccess('✅ تم إنشاء حساب المدير(admin) بنجاح! يمكنك تسجيل الدخول الآن.');
        setLoginForm({ username: 'admin', password: setupPassword.trim() });
      } else {
        setSetupError(res?.error || 'تعذر إنشاء حساب المدير');
      }
    } catch (err) {
      setSetupError(err.message || 'حدث خطأ أثناء إعداد النظام');
    }
  }

  return (
    <div className="login-screen">
        <div className="login-card">
          <div className="login-brand">
            <span className="brand-icon">☕</span>
            <h1>{settings.cafe_name || 'التكية أسيوط الجديدة'}</h1>
          </div>

          {closeSummary && (
            <div className="summary-alert" style={{ marginBottom: '16px', textAlign: 'right', fontSize: '13px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <strong style={{ color: '#10b981' }}>🔒 تم تقفيل الشيفت السابق بنجاح</strong>
                <button
                  type="button"
                  onClick={() => setCloseSummary(null)}
                  style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '14px' }}
                  title="إغلاق التنبيه"
                >
                  ✕
                </button>
              </div>
              <div>إجمالي المبيعات: {closeSummary.totalSales || 0} {settings.currency || 'ج.م'}</div>
              <div>الكاش الفعلي بالدرج: {closeSummary.closingCash || 0} {settings.currency || 'ج.م'}</div>
              {closeSummary.cashDifference !== undefined && (
                <div style={{ marginTop: '4px', color: closeSummary.cashDifference < -0.01 ? '#ef4444' : (closeSummary.cashDifference > 0.01 ? '#10b981' : '#6b7280'), fontWeight: 'bold' }}>
                  {closeSummary.cashDifference < -0.01 ? `⚠️ عجز في الدرج: ${Math.abs(closeSummary.cashDifference)}` : (closeSummary.cashDifference > 0.01 ? `🎉 زيادة وفائض: ${closeSummary.cashDifference}` : '✅ مطابق بالكامل')} {settings.currency || 'ج.م'}
                </div>
              )}
            </div>
          )}

          {setupSuccess && (
            <div className="summary-alert" style={{ marginBottom: '16px', textAlign: 'center', fontWeight: 'bold' }}>
              {setupSuccess}
            </div>
          )}

          {needsInitialSetup ? (
            <form onSubmit={handleFirstRunSetup} className="login-form">
              <div style={{ background: 'rgba(200, 125, 50, 0.12)', border: '1px solid var(--primary)', borderRadius: '10px', padding: '12px', marginBottom: '16px', fontSize: '13px', textAlign: 'right' }}>
                <strong style={{ color: 'var(--primary)', display: 'block', marginBottom: '4px' }}>🚀 مرحباً بك! إعداد النظام لأول مرة</strong>
                <span>يرجى تعيين كلمة مرور المدير العام (اسم الدخول سيكون: <code>admin</code>) للبدء في استخدام النظام.</span>
              </div>

              {setupError && <div className="login-alert-danger">⚠️ {setupError}</div>}

              <div className="form-group">
                <label>اسم الكافيه / المنشأة (اختياري):</label>
                <input
                  type="text"
                  placeholder="مثال: 90 كافيه"
                  value={setupCafeName}
                  onChange={(e) => setSetupCafeName(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label>اسم المدير:</label>
                <input
                  type="text"
                  required
                  placeholder="مدير النظام"
                  value={setupAdminName}
                  onChange={(e) => setSetupAdminName(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label>كلمة مرور المدير الجديدة (12 حرفاً على الأقل بأحرف وأرقام):</label>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <input
                    type={showSetupPassword ? "text" : "password"}
                    required
                    placeholder="مثال: AdminCafe2026!"
                    value={setupPassword}
                    onChange={(e) => setSetupPassword(e.target.value)}
                    style={{ width: '100%', paddingLeft: '44px' }}
                    autoFocus
                  />
                  <button
                    type="button"
                    tabIndex="-1"
                    onClick={() => setShowSetupPassword(!showSetupPassword)}
                    title={showSetupPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
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
                    {showSetupPassword ? '👁️‍🗨️' : '👁️'}
                  </button>
                </div>
              </div>

              <div className="form-group">
                <label>تأكيد كلمة المرور:</label>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <input
                    type={showSetupConfirmPassword ? "text" : "password"}
                    required
                    placeholder="أعد إدخال كلمة المرور"
                    value={setupConfirmPassword}
                    onChange={(e) => setSetupConfirmPassword(e.target.value)}
                    style={{ width: '100%', paddingLeft: '44px' }}
                  />
                  <button
                    type="button"
                    tabIndex="-1"
                    onClick={() => setShowSetupConfirmPassword(!showSetupConfirmPassword)}
                    title={showSetupConfirmPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
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
                    {showSetupConfirmPassword ? '👁️‍🗨️' : '👁️'}
                  </button>
                </div>
              </div>

              <button type="submit" className="btn btn-primary btn-lg btn-login-submit" style={{ marginTop: '10px' }}>
                ✅ حفظ وإعداد حساب المدير
              </button>
            </form>
          ) : (
            <form onSubmit={handleLogin} className="login-form">
              {loginError && <div className="login-alert-danger">⚠️ {loginError}</div>}

              <div className="form-group">
                <label>اسم المستخدم:</label>
                <input
                  type="text"
                  required
                  placeholder="👤 أدخل اسم المستخدم"
                  value={loginForm.username}
                  onChange={(e) => setLoginForm({ ...loginForm, username: e.target.value })}
                  autoFocus
                />
              </div>

              <div className="form-group">
                <label>كلمة المرور:</label>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <input
                    type={showLoginPassword ? "text" : "password"}
                    required
                    placeholder="🔑 أدخل كلمة المرور"
                    value={loginForm.password}
                    onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                    style={{ width: '100%', paddingLeft: '44px' }}
                  />
                  <button
                    type="button"
                    tabIndex="-1"
                    onClick={() => setShowLoginPassword(!showLoginPassword)}
                    title={showLoginPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
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
                    {showLoginPassword ? '👁️‍🗨️' : '👁️'}
                  </button>
                </div>
              </div>

              <button type="submit" className="btn btn-primary btn-lg btn-login-submit" disabled={pendingLogin} style={{ marginTop: '10px' }}>
                {pendingLogin ? '⏳ جاري تسجيل الدخول...' : '🔐 تسجيل الدخول وبدء العمل'}
              </button>

              {/* Show forgot password link after 3 failed attempts */}
              {loginFailCount >= 3 && (
                <div style={{ textAlign: 'center', marginTop: '14px' }}>
                  <button
                    type="button"
                    onClick={() => { setEmergencyResetModal(true); setEmergencyError(''); setEmergencySuccess(''); }}
                    style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '12px', cursor: 'pointer', textDecoration: 'underline' }}
                  >
                    🔑 نسيت كلمة المرور؟ (تواصل مع المورد للحصول على رمز الطوارئ)
                  </button>
                </div>
              )}
            </form>
          )}
        </div>

        {/* Reset / Change Admin Password Modal */}
        {emergencyResetModal && (
          <div className="modal-overlay" onClick={() => setEmergencyResetModal(false)} style={{ zIndex: 99999 }}>
            <div className="modal-card" onClick={e => e.stopPropagation()} style={{ maxWidth: '480px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <h3 style={{ color: '#f59e0b', margin: 0 }}>🔑 إعادة تعيين كلمة مرور المدير (Admin)</h3>
                <button
                  type="button"
                  onClick={() => setEmergencyResetModal(false)}
                  style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '16px' }}
                >
                  ✕
                </button>
              </div>

              {/* Mode Selector Tabs */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '16px' }}>
                <button
                  type="button"
                  onClick={() => { setResetMode('old_password'); setEmergencyError(''); setEmergencySuccess(''); }}
                  style={{
                    padding: '8px 10px',
                    borderRadius: '8px',
                    fontSize: '12.5px',
                    fontWeight: resetMode === 'old_password' ? '800' : '600',
                    cursor: 'pointer',
                    background: resetMode === 'old_password' ? 'var(--primary)' : 'rgba(255,255,255,0.06)',
                    color: resetMode === 'old_password' ? '#fff' : 'var(--text-main)',
                    border: `1.5px solid ${resetMode === 'old_password' ? 'var(--primary)' : 'var(--border-color)'}`
                  }}
                >
                  🔒 بكلمة المرور القديمة
                </button>
                <button
                  type="button"
                  onClick={() => { setResetMode('emergency'); setEmergencyError(''); setEmergencySuccess(''); }}
                  style={{
                    padding: '8px 10px',
                    borderRadius: '8px',
                    fontSize: '12.5px',
                    fontWeight: resetMode === 'emergency' ? '800' : '600',
                    cursor: 'pointer',
                    background: resetMode === 'emergency' ? '#d97706' : 'rgba(255,255,255,0.06)',
                    color: resetMode === 'emergency' ? '#fff' : 'var(--text-main)',
                    border: `1.5px solid ${resetMode === 'emergency' ? '#d97706' : 'var(--border-color)'}`
                  }}
                >
                  🚨 كود طوارئ المطور
                </button>
              </div>

              {emergencySuccess ? (
                <div style={{ background: 'rgba(16,185,129,0.15)', border: '1px solid #10b981', borderRadius: '10px', padding: '16px', textAlign: 'center', color: '#10b981', fontSize: '14px', lineHeight: '1.6' }}>
                  {emergencySuccess}
                  <br />
                  <button className="btn btn-primary" style={{ marginTop: '14px' }} onClick={() => setEmergencyResetModal(false)}>
                    ✅ إغلاق وتسجيل الدخول
                  </button>
                </div>
              ) : (
                <form onSubmit={async (e) => {
                  e.preventDefault();
                  setEmergencyError('');
                  setEmergencySuccess('');

                  if (!emergencyNewPass || emergencyNewPass.trim().length < MIN_PASSWORD_LENGTH) {
                    setEmergencyError(`كلمة المرور الجديدة يجب أن تكون ${MIN_PASSWORD_LENGTH} أحرف/أرقام على الأقل`);
                    return;
                  }
                  if (emergencyNewPass !== emergencyConfirmPass) {
                    setEmergencyError('كلمتا المرور غير متطابقتين');
                    return;
                  }

                  if (resetMode === 'old_password') {
                    if (!oldAdminPass.trim()) {
                      setEmergencyError('يرجى إدخال كلمة المرور القديمة للمدير');
                      return;
                    }
                    try {
                      const res = await api.changeAdminPassword(oldAdminPass.trim(), emergencyNewPass.trim());
                      if (res && res.success) {
                        setEmergencySuccess('✅ تم تغيير كلمة مرور المدير بنجاح! يمكنك الدخول بها الآن.');
                        setOldAdminPass('');
                        setEmergencyNewPass('');
                        setEmergencyConfirmPass('');
                      } else {
                        setEmergencyError(res?.error || 'كلمة المرور الحالية غير صحيحة');
                      }
                    } catch (err) {
                      setEmergencyError(err.message || 'حدث خطأ أثناء تغيير كلمة المرور');
                    }
                  } else {
                    handleEmergencyReset(e);
                  }
                }}>
                  {emergencyError && <div className="login-alert-danger" style={{ marginBottom: '12px' }}>⚠️ {emergencyError}</div>}

                  {resetMode === 'old_password' ? (
                    <>
                      <div className="form-group">
                        <label>كلمة المرور القديمة / الحالية للمدير:</label>
                        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                          <input
                            type={showOldAdminPass ? "text" : "password"}
                            required
                            placeholder="أدخل كلمة المرور الحالية"
                            value={oldAdminPass}
                            onChange={e => setOldAdminPass(e.target.value)}
                            style={{ width: '100%', paddingLeft: '44px' }}
                            autoFocus
                          />
                          <button
                            type="button"
                            tabIndex="-1"
                            onClick={() => setShowOldAdminPass(!showOldAdminPass)}
                            title={showOldAdminPass ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
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
                            {showOldAdminPass ? '👁️‍🗨️' : '👁️'}
                          </button>
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <p style={{ color: 'var(--text-muted)', fontSize: '13px', margin: '0 0 10px' }}>
                        إذا نسيت كلمة المرور القديمة، أرسل معرّف الجهاز للمورد ليوّلد لك رمز الطوارئ الخاص بك.
                      </p>
                      {licenseData?.machineId && (
                        <div style={{ background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.4)', borderRadius: '8px', padding: '10px 14px', marginBottom: '14px' }}>
                          <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>🖥️ معرّف جهازك (Machine ID) — أرسله للمورد:</div>
                          <div style={{ fontFamily: 'monospace', fontSize: '14px', color: '#fbbf24', fontWeight: 'bold', letterSpacing: '1px', userSelect: 'all' }}>{licenseData?.machineId}</div>
                        </div>
                      )}
                      <div className="form-group">
                        <label>🔑 كود الطوارئ من المورد (مرتبط بجهازك):</label>
                        <input
                          type="text"
                          required
                          placeholder="الصق كود الطوارئ الذي أرسله لك المورد"
                          value={emergencyPin}
                          onChange={e => setEmergencyPin(e.target.value)}
                          style={{ fontFamily: 'monospace', fontSize: '12px', letterSpacing: '0.5px' }}
                          autoFocus
                        />
                      </div>
                    </>
                  )}

                  <div className="form-group">
                    <label>كلمة المرور الجديدة للمدير:</label>
                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                      <input
                        type={showEmergencyNewPass ? "text" : "password"}
                        required
                        placeholder={`${MIN_PASSWORD_LENGTH} أحرف على الأقل`}
                        value={emergencyNewPass}
                        onChange={e => setEmergencyNewPass(e.target.value)}
                        style={{ width: '100%', paddingLeft: '44px' }}
                      />
                      <button
                        type="button"
                        tabIndex="-1"
                        onClick={() => setShowEmergencyNewPass(!showEmergencyNewPass)}
                        title={showEmergencyNewPass ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
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
                        {showEmergencyNewPass ? '👁️‍🗨️' : '👁️'}
                      </button>
                    </div>
                  </div>
                  <div className="form-group">
                    <label>تأكيد كلمة المرور الجديدة:</label>
                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                      <input
                        type={showEmergencyConfirmPass ? "text" : "password"}
                        required
                        placeholder="أعد إدخال كلمة المرور"
                        value={emergencyConfirmPass}
                        onChange={e => setEmergencyConfirmPass(e.target.value)}
                        style={{ width: '100%', paddingLeft: '44px' }}
                      />
                      <button
                        type="button"
                        tabIndex="-1"
                        onClick={() => setShowEmergencyConfirmPass(!showEmergencyConfirmPass)}
                        title={showEmergencyConfirmPass ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
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
                        {showEmergencyConfirmPass ? '👁️‍🗨️' : '👁️'}
                      </button>
                    </div>
                  </div>

                  {resetMode === 'old_password' && (
                    <div style={{ textAlign: 'center', margin: '8px 0 14px' }}>
                      <button
                        type="button"
                        onClick={() => { setResetMode('emergency'); setEmergencyError(''); }}
                        style={{ background: 'none', border: 'none', color: '#b45309', fontSize: '12.5px', cursor: 'pointer', textDecoration: 'underline', fontWeight: 'bold' }}
                      >
                        نسيت كلمة المرور القديمة؟ اضغط هنا لاستعادة كلمة المرور عبر كود الطوارئ 🚨
                      </button>
                    </div>
                  )}

                  <div className="modal-actions">
                    <button type="submit" className="btn btn-primary">
                      {resetMode === 'old_password' ? '💾 حفظ وتغيير كلمة المرور' : '🔓 إعادة تعيين كلمة المرور'}
                    </button>
                    <button type="button" className="btn btn-secondary" onClick={() => setEmergencyResetModal(false)}>إلغاء</button>
                  </div>
                </form>
              )}
            </div>
          </div>
        )}
      </div>
  );
}
