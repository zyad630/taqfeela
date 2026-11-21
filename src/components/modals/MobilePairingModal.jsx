import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';

export default function MobilePairingModal({ isOpen, onClose, showToast }) {
  const [pairingData, setPairingData] = useState(null);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [pairedDevice, setPairedDevice] = useState(null);
  const [timeLeft, setTimeLeft] = useState(600); // 10 minutes (600s)

  const generateSession = async () => {
    try {
      setLoading(true);
      setPairedDevice(null);
      if (window.api && window.api.createMobilePairingSession) {
        const session = await window.api.createMobilePairingSession();
        setPairingData(session);
        setTimeLeft(600);

        // Generate QR Code image
        const url = await QRCode.toDataURL(session.qrPayload, {
          width: 260,
          margin: 1,
          color: {
            dark: '#2B1A14',
            light: '#FFFFFF'
          }
        });
        setQrDataUrl(url);
      }
    } catch (err) {
      console.error('Failed to create pairing session:', err);
      if (showToast) showToast('فشل إنشاء جلسة الاقتران: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      generateSession();
    }
  }, [isOpen]);

  // Countdown timer
  useEffect(() => {
    if (!isOpen || timeLeft <= 0) return;
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [isOpen, timeLeft]);

  // Listen for mobile device paired event
  useEffect(() => {
    if (!isOpen || !window.api || !window.api.onMobileDevicePaired) return;
    const unsub = window.api.onMobileDevicePaired((device) => {
      setPairedDevice(device);
      if (showToast) showToast(`تم ربط هاتف ${device.deviceName} بنجاح!`, 'success');
    });
    return () => {
      if (typeof unsub === 'function') unsub();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const formattedTime = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 9999 }}>
      <div
        className="modal-card"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: '480px',
          textAlign: 'center',
          background: 'var(--bg-card, #FFFFFF)',
          borderRadius: '18px',
          padding: '28px',
          border: '2px solid var(--primary, #EE7F14)'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ margin: 0, fontSize: '20px', color: 'var(--text-main, #2B1A14)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>📱</span> ربط هاتف ويتر جديد
          </h3>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '22px',
              cursor: 'pointer',
              color: 'var(--text-muted)'
            }}
          >
            ✕
          </button>
        </div>

        {loading ? (
          <div style={{ padding: '40px', color: 'var(--text-muted)' }}>جاري توليد كود ورمز الاقتران...</div>
        ) : pairedDevice ? (
          <div style={{ padding: '30px 10px' }}>
            <div style={{ fontSize: '56px', marginBottom: '12px' }}>✅</div>
            <h4 style={{ color: '#2E9E62', margin: '0 0 8px 0', fontSize: '22px' }}>تم الاقتران بنجاح!</h4>
            <p style={{ color: 'var(--text-main)', fontSize: '16px', margin: 0 }}>
              تم ربط الجهاز: <strong>{pairedDevice.deviceName}</strong> ({pairedDevice.platform})
            </p>
            <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '6px' }}>
              يمكن للويتر الآن اختيار اسمه وإدخال الـ PIN لتسجيل الدخول والبدء في طلب الطاولات.
            </p>
            <button
              onClick={onClose}
              className="btn btn-primary"
              style={{ marginTop: '20px', width: '100%', padding: '12px', fontSize: '16px' }}
            >
              تم وإغلاق النافذة
            </button>
          </div>
        ) : (
          <div>
            <p style={{ color: 'var(--text-muted)', fontSize: '14px', margin: '0 0 16px 0', lineHeight: '1.5' }}>
              وجّه كاميرا تطبيق تقفيلة على الهاتف نحو الـ QR كود للاقتران الفوري، أو أدخل الكود المكون من 6 أرقام.
            </p>

            {/* QR Code Container */}
            <div
              style={{
                display: 'inline-block',
                padding: '12px',
                background: '#FFFFFF',
                borderRadius: '14px',
                border: '1.5px solid var(--border-color, #E3CDAE)',
                boxShadow: '0 4px 16px rgba(0,0,0,0.06)'
              }}
            >
              {qrDataUrl ? (
                <img
                  src={qrDataUrl}
                  alt="Pairing QR Code"
                  style={{ width: '220px', height: '220px', display: 'block' }}
                />
              ) : (
                <div style={{ width: '220px', height: '220px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  جاري التحميل...
                </div>
              )}
            </div>

            {/* 6-Digit Code Badge */}
            <div style={{ marginTop: '16px' }}>
              <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                أو اكتب كود الاقتران يدوياً:
              </div>
              <div
                style={{
                  display: 'inline-block',
                  fontSize: '32px',
                  fontWeight: 'bold',
                  letterSpacing: '8px',
                  color: 'var(--primary, #EE7F14)',
                  padding: '6px 20px',
                  background: 'rgba(238, 127, 20, 0.1)',
                  borderRadius: '12px',
                  border: '1.5px dashed var(--primary, #EE7F14)'
                }}
              >
                {pairingData?.code || '------'}
              </div>
            </div>

            {/* Expiry Countdown */}
            <div style={{ marginTop: '14px', fontSize: '13px', color: timeLeft < 60 ? '#C2432A' : 'var(--text-muted)' }}>
              ⏳ ينتهي الكود خلال: <strong>{formattedTime}</strong>
            </div>

            {/* Local Network Info */}
            <div
              style={{
                marginTop: '16px',
                padding: '10px',
                borderRadius: '10px',
                background: 'rgba(0,0,0,0.03)',
                fontSize: '12px',
                color: 'var(--text-muted)'
              }}
            >
              عنوان الكاشير على الشبكة: <strong>{pairingData?.localIp}:{pairingData?.port}</strong>
              <br />
              <small>تأكد من اتصال هاتف الويتر بنفس شبكة واي فاي الكافيه.</small>
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '18px' }}>
              <button
                type="button"
                onClick={generateSession}
                className="btn btn-secondary"
                style={{ flex: 1, padding: '10px' }}
              >
                🔄 كود جديد
              </button>
              <button
                type="button"
                onClick={onClose}
                className="btn btn-primary"
                style={{ flex: 1, padding: '10px' }}
              >
                إغلاق
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
