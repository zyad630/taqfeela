import React, { useState } from 'react';

export default function UserModal({
  handleSaveUser,
  setUserForm,
  setUserModal,
  shiftSchedules,
  userForm,
  sections = []
}) {
  const [showUserPassword, setShowUserPassword] = useState(false);
  return (
    <div className="modal-overlay" onClick={() => setUserModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h3>{userForm.id ? '✏️ تعديل بيانات الموظف' : '👤 إضافة موظف / كاشير جديد'}</h3>
            <form onSubmit={handleSaveUser}>
              <div className="form-group">
                <label>اسم الموظف الثلاثي:</label>
                <input
                  type="text"
                  required
                  placeholder="مثال: أحمد محمود إبراهيم"
                  value={userForm.name || ''}
                  onChange={(e) => setUserForm({ ...userForm, name: e.target.value })}
                  autoFocus
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>اسم المستخدم (لتسجيل الدخول):</label>
                  <input
                    type="text"
                    required
                    placeholder="مثال: ahmed1"
                    value={userForm.username || ''}
                    onChange={(e) => setUserForm({ ...userForm, username: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label>كلمة المرور (Password):</label>
                  <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                    <input
                      type={showUserPassword ? "text" : "password"}
                      placeholder={userForm.id ? 'اتركه فارغاً للإبقاء على الحالية' : 'أدخل كلمة المرور'}
                      value={userForm.password || ''}
                      onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                      style={{ width: '100%', paddingLeft: '44px' }}
                    />
                    <button
                      type="button"
                      tabIndex="-1"
                      onClick={() => setShowUserPassword(!showUserPassword)}
                      title={showUserPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
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
                      {showUserPassword ? '👁️‍🗨️' : '👁️'}
                    </button>
                  </div>
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>الصلاحية:</label>
                  <select
                    value={userForm.role || 'cashier'}
                    onChange={(e) => setUserForm({ ...userForm, role: e.target.value })}
                  >
                    <option value="cashier">💼 موظف كاشير (صلاحيات البيع فقط)</option>
                    <option value="waiter">🍽️ ويتر / صالة (طلبات الموبايل والطاولات)</option>
                    <option value="admin">👑 مدير النظام (كامل الصلاحيات والتقارير)</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>رقم الهاتف / التواصل:</label>
                  <input
                    type="text"
                    placeholder="010xxxxxxxx"
                    value={userForm.phone || ''}
                    onChange={(e) => setUserForm({ ...userForm, phone: e.target.value })}
                  />
                </div>
              </div>

              <div className="form-row" style={{ background: 'rgba(238, 127, 20, 0.05)', padding: '12px', borderRadius: '10px', marginBottom: '14px', border: '1px solid rgba(238, 127, 20, 0.2)' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>🔑 رمز الـ PIN للدخول السريع (تطبيق الموبايل):</label>
                  <input
                    type="text"
                    maxLength="6"
                    placeholder="رمز PIN من 6 أرقام (أو اتركه فارغاً وسيستخدم كلمة المرور)"
                    value={userForm.pin || ''}
                    onChange={(e) => setUserForm({ ...userForm, pin: e.target.value.replace(/\D/g, '') })}
                  />
                  <small style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
                    رمز من 6 أرقام لتسجيل الدخول السريع، أو يمكن تسجيل الدخول بكلمة المرور المسجلة أعلاه مباشرة.
                  </small>
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>📍 الصالات المصرح بها للويتر:</label>
                  <select
                    value={(() => {
                      try {
                        const h = typeof userForm.assigned_halls === 'string'
                          ? (userForm.assigned_halls === 'ALL' ? 'ALL' : JSON.parse(userForm.assigned_halls)[0])
                          : (Array.isArray(userForm.assigned_halls) ? userForm.assigned_halls[0] : 'ALL');
                        return h || 'ALL';
                      } catch (_) { return 'ALL'; }
                    })()}
                    onChange={(e) => {
                      const v = e.target.value;
                      setUserForm({
                        ...userForm,
                        assigned_halls: v === 'ALL' ? 'ALL' : JSON.stringify([v])
                      });
                    }}
                  >
                    <option value="ALL">🌟 جميع الصالات (غير مقيد)</option>
                    {sections && sections.length > 0 ? (
                      sections.map((sec) => (
                        <option key={sec.id || sec.name} value={sec.name}>
                          📍 صالة {sec.name}
                        </option>
                      ))
                    ) : (
                      <>
                        <option value="أرضي">📍 صالة أرضي</option>
                        <option value="علوي">📍 صالة علوي</option>
                        <option value="بارك">📍 صالة بارك</option>
                        <option value="عائلات">📍 صالة عائلات</option>
                        <option value="بارك شباب">📍 صالة بارك شباب</option>
                      </>
                    )}
                  </select>
                  <small style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
                    يحدد أي طاولات تظهر للويتر وتمنعه برمجياً من الطلب خارج صالته.
                  </small>
                </div>
              </div>

              <div className="form-group">
                <label>قالب الشيفت المحدد للموظف (من نظام الـ 3 شيفتات):</label>
                <select
                  value={userForm.shift_name || ''}
                  onChange={(e) => {
                    const val = e.target.value;
                    const matched = shiftSchedules.find((sch) => sch.name === val || `${sch.name} (${sch.start} - ${sch.end})` === val);
                    let sStart = matched ? matched.start : '08:00';
                    let sEnd = matched ? matched.end : '16:00';
                    if (val.includes('جميع الأوقات')) {
                      sStart = '00:00';
                      sEnd = '23:59';
                    }
                    setUserForm({
                      ...userForm,
                      shift_name: val,
                      shift_start: sStart,
                      shift_end: sEnd
                    });
                  }}
                >
                  {shiftSchedules.map((sch) => (
                    <option key={sch.id} value={sch.name}>
                      {sch.icon || '☕'} {sch.name} ({sch.start} - {sch.end})
                    </option>
                  ))}
                  <option value="جميع الأوقات (مرن)">🌟 جميع الأوقات (مرن 24 ساعة 00:00 - 23:59)</option>
                  <option value="دوام حر">⚡ دوام حر (ساعات عمل مرنة)</option>
                </select>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>وقت بداية الشيفت:</label>
                  <input
                    type="time"
                    value={userForm.shift_start || '08:00'}
                    onChange={(e) => setUserForm({ ...userForm, shift_start: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>وقت نهاية الشيفت:</label>
                  <input
                    type="time"
                    value={userForm.shift_end || '16:00'}
                    onChange={(e) => setUserForm({ ...userForm, shift_end: e.target.value })}
                  />
                </div>
              </div>

              <div className="form-group" style={{ marginTop: '12px', background: 'rgba(16,185,129,0.08)', padding: '14px', borderRadius: '10px', border: '1px solid rgba(16,185,129,0.25)' }}>
                <label style={{ fontWeight: '600' }}>💰 الراتب الأساسي الشهري ({`ج.م`}):</label>
                <input
                  type="number"
                  step="50"
                  min="0"
                  required
                  placeholder="مثال: 3500"
                  value={userForm.salary !== undefined && userForm.salary !== null ? userForm.salary : ''}
                  onChange={(e) => setUserForm({ ...userForm, salary: e.target.value })}
                />
                <small style={{ color: 'var(--text-muted)', marginTop: '6px', display: 'block' }}>
                  💡 سعر اليوم الواحد = {Math.round((Number(userForm.salary || 3500) / 30) * 100) / 100} ج.م/يوم — سيتم خصم أيام الغياب بهذا السعر تلقائياً
                </small>
              </div>

              <div className="modal-actions">
                <button type="submit" className="btn btn-primary">
                  💾 حفظ بيانات الموظف
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => setUserModal(false)}>
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
  );
}
