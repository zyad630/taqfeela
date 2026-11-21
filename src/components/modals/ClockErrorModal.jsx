import React from 'react';
import api from '../../api';

export default function ClockErrorModal({
  clockError,
  refreshData,
  setClockError,
  showToast
}) {
  return (
    <div className="modal-overlay" style={{ zIndex: 99999, background: 'rgba(0,0,0,0.88)' }}>
          <div className="modal-card" style={{ maxWidth: '520px', width: '92%', border: '2px solid #ef4444', textAlign: 'center', padding: '28px' }}>
            <div style={{ fontSize: '48px', marginBottom: '12px' }}>⏰❌</div>
            <h3 style={{ color: '#ef4444', fontSize: '20px', marginBottom: '12px', fontWeight: 'bold' }}>تنبيه أمني: خطأ في تاريخ الجهاز</h3>
            <p style={{ whiteSpace: 'pre-line', lineHeight: '1.8', color: 'var(--text-main, #f1f5f9)', fontSize: '14px', marginBottom: '18px' }}>
              {clockError}
            </p>
            <div style={{ background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.3)', padding: '12px', borderRadius: '8px', color: '#fca5a5', fontSize: '13px', marginBottom: '20px', textAlign: 'right' }}>
              💡 <strong>كيفية الحل:</strong> اضبط تاريخ وساعة الويندوز على اليوم والتوقيت الفعلي الصحيح، ثم اضغط على زر "إعادة فحص التاريخ" أدناه.
              <br /><br />
              🔑 <strong>أو:</strong> إذا كانت بطارية اللوحة الأم منتهية — أدخل كلمة مرور المدير أدناه لإعادة مزامنة الساعة يدوياً.
            </div>
            <button
              type="button"
              className="btn btn-primary btn-lg"
              style={{ width: '100%', padding: '12px', fontWeight: 'bold', fontSize: '15px', marginBottom: '10px' }}
              onClick={async () => {
                try {
                  const chk = api.checkClock ? await api.checkClock() : { valid: true };
                  if (chk && chk.valid) {
                    setClockError(null);
                    showToast('✅ تم التحقق من تاريخ الجهاز بنجاح!');
                    await refreshData();
                  } else {
                    showToast('❌ تاريخ الجهاز ما زال غير صحيح!');
                  }
                } catch (_) {
                  showToast('❌ تعذر التحقق، تأكد من التوقيت');
                }
              }}
            >
              🔄 إعادة فحص التاريخ الآن
            </button>
            {/* P0-FIX: مسار طوارئ المدير — مزامنة إجبارية بكلمة مرور المدير */}
            <div style={{ marginTop: '16px', borderTop: '1px solid rgba(239, 68, 68, 0.25)', paddingTop: '16px' }}>
              <p style={{ color: '#94a3b8', fontSize: '12px', marginBottom: '8px' }}>🔑 مسار طوارئ المدير (CMOS Battery Override)</p>
              <input
                id="clock-admin-pw"
                type="password"
                placeholder="كلمة مرور المدير"
                style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color, #475569)', background: 'var(--bg-input, var(--bg-card))', color: 'var(--text-main, #f1f5f9)', fontSize: '14px', marginBottom: '8px', textAlign: 'center' }}
              />
              <button
                type="button"
                className="btn btn-lg"
                style={{ width: '100%', padding: '10px', fontWeight: 'bold', fontSize: '14px', background: '#f59e0b', color: '#000', border: 'none', borderRadius: '8px', cursor: 'pointer' }}
                onClick={async () => {
                  try {
                    const pw = document.getElementById('clock-admin-pw')?.value;
                    if (!pw || !pw.trim()) {
                      showToast('❌ أدخل كلمة مرور المدير أولاً');
                      return;
                    }
                    if (!api.resetClockGuard) {
                      showToast('❌ هذه الميزة غير متاحة في هذا الإصدار');
                      return;
                    }
                    const res = await api.resetClockGuard(pw.trim());
                    if (res && res.success) {
                      setClockError(null);
                      showToast('✅ تم مزامنة ساعة النظام بنجاح بصلاحيات المدير!');
                      await refreshData();
                    } else {
                      showToast(`❌ ${res?.error || 'كلمة مرور المدير غير صحيحة'}`);
                    }
                  } catch (err) {
                    showToast('❌ حدث خطأ أثناء المزامنة');
                  }
                }}
              >
                🔓 مزامنة الساعة (بصلاحيات المدير)
              </button>
            </div>
          </div>
        </div>
  );
}
