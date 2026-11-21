import React, { useState, useEffect } from 'react';
import api from '../../api';
import SectionErrorBoundary from '../SectionErrorBoundary.jsx';
import MobilePairingModal from '../modals/MobilePairingModal.jsx';
import { DEFAULT_SHIFT_SCHEDULES } from '../../constants.js';
import { isSameHall } from '../../utils/hall.js';

export default function SettingsTab({
  availablePrinters,
  currentUser,
  handleDeleteSection,
  handleDialogBackup,
  handleDialogRestore,
  handleResetSectionTables,
  handleSaveSettings,
  handleSaveVendorDevFeatures,
  handleToggleShowAllTablesTab,
  handleUnlockVendorDev,
  licenseData,
  qrInfo,
  refreshData,
  sectionRanges,
  sectionTableCounts,
  sections,
  setActiveTab,
  setSectionForm,
  setSectionModal,
  setSectionRanges,
  setSettings,
  setShiftSchedules,
  setShowPrinterWizard,
  setSystemResetError,
  setSystemResetModal,
  setSystemResetPassword,
  setSystemResetType,
  setVendorDevFeatures,
  setVendorDevPassword,
  setVendorDevUnlocked,
  setWizardPrinters,
  settings,
  shiftSchedules,
  showAllTablesTab,
  showToast,
  tables,
  testPrintStation,
  vendorDevError,
  vendorDevFeatures,
  vendorDevPassword,
  vendorDevSaving,
  vendorDevUnlocked
}) {
  const [showPairingModal, setShowPairingModal] = useState(false);
  const [pairedDevices, setPairedDevices] = useState([]);
  const [loadingDevices, setLoadingDevices] = useState(false);
  const isMobileHubEnabled = settings.enable_mobile_hub === 'true' || Boolean(vendorDevFeatures.enable_mobile_hub);

  const loadPairedDevices = async () => {
    if (!isMobileHubEnabled) {
      setPairedDevices([]);
      return;
    }
    try {
      setLoadingDevices(true);
      if (api.listPairedDevices) {
        const devices = await api.listPairedDevices();
        setPairedDevices(Array.isArray(devices) ? devices : []);
      }
    } catch (err) {
      console.error('Failed to load paired devices:', err);
    } finally {
      setLoadingDevices(false);
    }
  };

  useEffect(() => {
    if (isMobileHubEnabled) {
      loadPairedDevices();
    } else {
      setPairedDevices([]);
      setShowPairingModal(false);
    }
  }, [isMobileHubEnabled]);

  const handleRevokeDevice = async (deviceId, deviceName) => {
    if (!window.confirm(`هل أنت متأكد من إلغاء اقتران وفصل جهاز "${deviceName}"؟`)) return;
    try {
      if (api.revokeMobileDevice) {
        await api.revokeMobileDevice(deviceId);
        showToast && showToast(`تم فصل الجهاز "${deviceName}" بنجاح`, 'success');
        loadPairedDevices();
      }
    } catch (err) {
      showToast && showToast(`فشل فصل الجهاز: ${err.message}`, 'error');
    }
  };

  const handleDeleteDevice = async (deviceId, deviceName) => {
    if (!window.confirm(`هل أنت متأكد من حذف جهاز "${deviceName}" نهائياً من النظام؟`)) return;
    try {
      if (api.deleteMobileDevice) {
        await api.deleteMobileDevice(deviceId);
        showToast && showToast(`تم حذف الجهاز "${deviceName}" بنجاح`, 'success');
        loadPairedDevices();
      }
    } catch (err) {
      showToast && showToast(`فشل حذف الجهاز: ${err.message}`, 'error');
    }
  };

  const handleToggleAutoAppend = async (enabled) => {
    try {
      const nextVal = enabled ? 'true' : 'false';
      const nextSettings = { ...settings, waiter_auto_append_to_tables: nextVal };
      setSettings(nextSettings);
      if (api.saveSettings) {
        await api.saveSettings({ waiter_auto_append_to_tables: nextVal });
      }
      showToast && showToast(enabled ? 'تم تفعيل الإضافة المباشرة لسلة الكاشير' : 'تم تعطيل الإضافة المباشرة', 'success');
    } catch (err) {
      showToast && showToast(`فشل حفظ الإعداد: ${err.message}`, 'error');
    }
  };

  return (
    <SectionErrorBoundary name="الإعدادات" onFallback={() => setActiveTab('pos')}>
            <div className="settings-view">
              <div className="view-header">
              <h2>⚙️ إعدادات الكافيه وطباعة الفواتير والصالات</h2>
              <p>تخصيص بيانات المحل، وتحديد عدد طاولات الصالة الداخلية والخارجية</p>
            </div>

            {/* Theme Mode Selector Card */}
            <div className="settings-card" style={{ marginBottom: '24px', border: '1.5px solid var(--primary)' }}>
              <div className="card-header-styled" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span className="header-icon">🎨</span>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '17px' }}>مظهر وألوان البرنامج (Theme Mode)</h3>
                    <small style={{ color: 'var(--text-muted)' }}>اختر نمط الألوان المفضل لشاشة الكاشير وتسجيل الدخول بضغطة واحدة</small>
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', marginTop: '16px' }}>
                {/* Option 1: Classic Dark Mode */}
                {(() => {
                  const activeTheme = settings.app_theme || (typeof localStorage !== 'undefined' && localStorage.getItem('cafepos_app_theme')) || 'dark';
                  const isDark = activeTheme !== 'latte';
                  const isLatte = activeTheme === 'latte';
                  const applyThemeInstant = async (newTheme) => {
                    try { localStorage.setItem('cafepos_app_theme', newTheme); } catch (_) {}
                    if (typeof document !== 'undefined') {
                      document.body.classList.toggle('theme-latte', newTheme === 'latte');
                    }
                    const nextSettings = { ...settings, app_theme: newTheme };
                    setSettings(nextSettings);
                    try {
                      if (api.saveSettings) {
                        await api.saveSettings({ app_theme: newTheme });
                      }
                      showToast(newTheme === 'latte' ? '☕ تم تفعيل وضع الكافيه الكريمي والإسبريسو' : '🌙 تم تفعيل الوضع الليلي الكلاسيكي');
                    } catch (_) {}
                  };
                  return (
                    <>
                      <div
                        onClick={() => applyThemeInstant('dark')}
                        style={{
                          cursor: 'pointer',
                          padding: '16px',
                          borderRadius: '14px',
                          border: isDark ? '2.5px solid #c88a4b' : '1.5px solid var(--border-color)',
                          background: '#0e131f',
                          color: '#f8fafc',
                          boxShadow: isDark ? '0 8px 24px rgba(0,0,0,0.35)' : 'none',
                          transition: 'all 0.2s ease',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '10px'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <strong style={{ fontSize: '15.5px', color: '#f3ba2f' }}>🌙 الوضع الليلي الكلاسيكي (Dark Mode)</strong>
                          {isDark && <span style={{ background: '#10b981', color: '#fff', fontSize: '11px', fontWeight: 'bold', padding: '3px 10px', borderRadius: '20px' }}>✓ مُفعّل</span>}
                        </div>
                        <small style={{ color: '#94a3b8', fontSize: '12px' }}>خلفية داكنة مريحة للإضاءة الخافتة مع لمسات ذهبية</small>
                        <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                          <span style={{ width: '28px', height: '28px', borderRadius: '8px', background: '#0e131f', border: '1px solid #334155' }} title="خلفية رئيسية" />
                          <span style={{ width: '28px', height: '28px', borderRadius: '8px', background: '#161e31', border: '1px solid #334155' }} title="لوحة جانبية" />
                          <span style={{ width: '28px', height: '28px', borderRadius: '8px', background: '#1f2b45', border: '1px solid #334155' }} title="كارت الصنف" />
                          <span style={{ width: '28px', height: '28px', borderRadius: '8px', background: '#c88a4b', border: '1px solid #f3ba2f' }} title="اللون الأساسي" />
                        </div>
                      </div>

                      <div
                        onClick={() => applyThemeInstant('latte')}
                        style={{
                          cursor: 'pointer',
                          padding: '16px',
                          borderRadius: '14px',
                          border: isLatte ? '2.5px solid #c87d32' : '1.5px solid var(--border-color)',
                          background: '#f3ede2',
                          color: '#2c1e16',
                          boxShadow: isLatte ? '0 8px 24px rgba(44,30,22,0.18)' : 'none',
                          transition: 'all 0.2s ease',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '10px'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <strong style={{ fontSize: '15.5px', color: '#2c1e16' }}>☕ وضع الكافيه الكريمي والإسبريسو (Latte Mode)</strong>
                          {isLatte && <span style={{ background: '#15803d', color: '#fff', fontSize: '11px', fontWeight: 'bold', padding: '3px 10px', borderRadius: '20px' }}>✓ مُفعّل</span>}
                        </div>
                        <small style={{ color: '#6e5a4f', fontSize: '12px' }}>ألوان اللاتيه الكريمية الدافئة مع هيدر وقوائم الإسبريسو الفخمة وكروت بيضاء ناصعة</small>
                        <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                          <span style={{ width: '28px', height: '28px', borderRadius: '8px', background: '#2c1e16', border: '1px solid #433024' }} title="إسبريسو الهيدر" />
                          <span style={{ width: '28px', height: '28px', borderRadius: '8px', background: '#c87d32', border: '1px solid #b06922' }} title="كراميل القهوة" />
                          <span style={{ width: '28px', height: '28px', borderRadius: '8px', background: '#f3ede2', border: '1px solid #d6c7bc' }} title="كريمي لاتيه" />
                          <span style={{ width: '28px', height: '28px', borderRadius: '8px', background: '#ffffff', border: '1px solid #d6c7bc' }} title="أبيض ناصع للكروت" />
                        </div>
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>

            {/* Dynamic Sections & Halls Configuration */}
            <div className="settings-card" style={{ marginBottom: '24px' }}>
              <div className="card-header-styled" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span className="header-icon">🪑</span>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '17px' }}>إدارة الصالات والأماكن والطاولات (خاص بالمدير)</h3>
                    <small style={{ color: 'var(--text-muted)' }}>أضف أي مكان في الكافيه وحدد عدد الطاولات داخله بكل سهولة وبشكل فوري</small>
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => {
                    setSectionForm({ id: null, name: '', sort_order: (sections.length + 1) });
                    setSectionModal(true);
                  }}
                >
                  ➕ إضافة صالة / مكان جديد
                </button>
              </div>

              <div style={{ marginTop: '16px' }}>
                {sections.length === 0 ? (
                  <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '20px' }}>لا توجد صالات مضافة حتى الآن. اضغط على "إضافة صالة / مكان جديد" للبدء.</p>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '14px' }}>
                    {sections.map((sec) => {
                      const currentCount = tables.filter(t => isSameHall(t.hall, sec.name)).length;
                      const inputVal = sectionTableCounts[sec.id] !== undefined ? sectionTableCounts[sec.id] : currentCount;
                      return (
                        <div
                          key={sec.id}
                          style={{
                            background: 'var(--bg-card, rgba(255,255,255,0.03))',
                            border: '1px solid var(--border-color, rgba(255,255,255,0.1))',
                            borderRadius: 'var(--radius-md, 8px)',
                            padding: '14px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '10px'
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <strong style={{ fontSize: '16px', color: 'var(--primary, #f59e0b)' }}>📍 {sec.name}</strong>
                            <div style={{ display: 'flex', gap: '6px' }}>
                              <button
                                type="button"
                                className="btn btn-sm btn-outline-light"
                                title="تعديل الاسم"
                                onClick={() => {
                                  setSectionForm({ id: sec.id, name: sec.name, sort_order: sec.sort_order });
                                  setSectionModal(true);
                                }}
                              >
                                ✏️
                              </button>
                              <button
                                type="button"
                                className="btn btn-sm btn-danger"
                                title="حذف المكان"
                                onClick={() => handleDeleteSection(sec.id, sec.name)}
                              >
                                🗑️
                              </button>
                            </div>
                          </div>

                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                              <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>من رقم:</label>
                              <input
                                type="number"
                                min="1"
                                placeholder="1"
                                style={{ width: '60px', padding: '5px 6px', textAlign: 'center', borderRadius: '6px', background: 'var(--bg-input, rgba(255,255,255,0.06))', color: 'var(--text-main)', border: '1px solid var(--border-color)' }}
                                value={sectionRanges[sec.id]?.start ?? 1}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setSectionRanges(prev => ({
                                    ...prev,
                                    [sec.id]: { ...(prev[sec.id] || {}), start: val }
                                  }));
                                }}
                              />
                              <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>إلى رقم:</label>
                              <input
                                type="number"
                                min="1"
                                placeholder="18"
                                style={{ width: '60px', padding: '5px 6px', textAlign: 'center', borderRadius: '6px', background: 'var(--bg-input, rgba(255,255,255,0.06))', color: 'var(--text-main)', border: '1px solid var(--border-color)' }}
                                value={sectionRanges[sec.id]?.end ?? (currentCount || 18)}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setSectionRanges(prev => ({
                                    ...prev,
                                    [sec.id]: { ...(prev[sec.id] || {}), end: val }
                                  }));
                                }}
                              />
                              <button
                                type="button"
                                className="btn btn-sm btn-warning"
                                style={{ whiteSpace: 'nowrap', flex: 1, fontWeight: '700' }}
                                onClick={() => {
                                  const startRaw = sectionRanges[sec.id]?.start;
                                  const endRaw = sectionRanges[sec.id]?.end;
                                  const start = parseInt(startRaw !== undefined && startRaw !== '' ? startRaw : 1) || 1;
                                  const end = parseInt(endRaw !== undefined && endRaw !== '' ? endRaw : (currentCount > 0 ? currentCount : 18)) || start;
                                  const count = Math.max(1, end - start + 1);
                                  handleResetSectionTables(sec.id, sec.name, count, start, end);
                                }}
                              >
                                🔄 ترقيم وتطبيق
                              </button>
                            </div>
                            <div style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
                              الحالي: {currentCount} طاولة فعالة (مثال: ترقيم من 1 إلى 18)
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                <div style={{ marginTop: '14px', fontSize: '13.5px', color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between' }}>
                  <span>إجمالي طاولات الكافيه: <strong>{tables.length} طاولة</strong> موزعة على {sections.length} أماكن</span>
                </div>
              </div>
            </div>


            <form className="settings-form" onSubmit={handleSaveSettings}>
              <div className="form-group">
                <label>اسم الكافيه / المحل:</label>
                <input
                  type="text"
                  value={settings.cafe_name || ''}
                  onChange={(e) => setSettings({ ...settings, cafe_name: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label>العنوان:</label>
                <input
                  type="text"
                  value={settings.cafe_address || ''}
                  onChange={(e) => setSettings({ ...settings, cafe_address: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label>رقم التليفون / خدمة العملاء:</label>
                <input
                  type="text"
                  value={settings.cafe_phone || ''}
                  onChange={(e) => setSettings({ ...settings, cafe_phone: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label>العملة المستخدمة:</label>
                <input
                  type="text"
                  value={settings.currency || 'ج.م'}
                  onChange={(e) => setSettings({ ...settings, currency: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label>🌍 المنطقة الزمنية (Timezone — للتشغيل حول العالم):</label>
                <select
                  value={settings.timezone_mode || 'auto'}
                  onChange={(e) => setSettings({ ...settings, timezone_mode: e.target.value })}
                >
                  <option value="auto">🌐 تلقائي — حسب توقيت الجهاز (موصى به عالمياً)</option>
                  <option value="Africa/Cairo">🇪🇬 مصر — القاهرة (Africa/Cairo — دعم التوقيت الصيفي)</option>
                  <option value="Asia/Riyadh">🇸🇦 السعودية — الرياض (Asia/Riyadh)</option>
                  <option value="Asia/Dubai">🇦🇪 الإمارات — دبي (Asia/Dubai)</option>
                  <option value="Asia/Kuwait">🇰🇼 الكويت (Asia/Kuwait)</option>
                  <option value="Asia/Qatar">🇶🇦 قطر — الدوحة (Asia/Qatar)</option>
                  <option value="Asia/Amman">🇯🇴 الأردن — عمّان (Asia/Amman)</option>
                  <option value="Africa/Casablanca">🇲🇦 المغرب — الدار البيضاء (Africa/Casablanca)</option>
                  <option value="Europe/Istanbul">🇹🇷 تركيا — إسطنبول (Europe/Istanbul)</option>
                  <option value="Europe/London">🇬🇧 بريطانيا — لندن (Europe/London)</option>
                  <option value="Europe/Berlin">🇪🇺 أوروبا الوسطى — برلين / باريس (Europe/Berlin)</option>
                  <option value="America/New_York">🇺🇸 أمريكا — نيويورك (America/New_York)</option>
                </select>
                <small style={{ color: 'var(--text-muted)', display: 'block', marginTop: '4px' }}>
                  في الوضع التلقائي يطبع البرنامج الفواتير والتقارير بنفس توقيت ويندوز الخاص بجهاز العميل في أي دولة.
                </small>
              </div>

              <div className="form-group">
                <label>رسالة أسفل الفاتورة (Footer):</label>
                <textarea
                  rows="3"
                  value={settings.receipt_footer || ''}
                  onChange={(e) => setSettings({ ...settings, receipt_footer: e.target.value })}
                ></textarea>
              </div>

              <div className="form-group" style={{ background: 'var(--bg-card)', padding: '16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', marginTop: '16px' }}>
                <label style={{ fontWeight: 'bold', fontSize: '15px', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>⏰</span> نظام التوقيت الصيفي وتاريخ اليوم (DST Settings):
                </label>
                <small style={{ display: 'block', color: 'var(--text-muted)', marginBottom: '12px' }}>
                  يحدد كيفية حساب بداية ونهاية اليوم لتقارير المبيعات والورديات الليلية بعد منتصف الليل
                </small>
                <select
                  className="form-control"
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', background: 'var(--bg-input)', color: 'var(--text-main)', border: '1px solid var(--border-color)' }}
                  value={settings.dst_mode || 'auto'}
                  onChange={(e) => setSettings({ ...settings, dst_mode: e.target.value })}
                >
                  <option value="auto">تلقائي وفقاً للقانون المصري رقم 24 لسنة 2023 (موصى به)</option>
                  <option value="enabled">مُفعّل دائماً (توقيت صيفي UTC+3 طوال العام)</option>
                  <option value="disabled">معطّل دائماً (توقيت شتوي UTC+2 طوال العام)</option>
                  <option value="custom">تخصيص يدوي لفترة التوقيت الصيفي</option>
                </select>

                {settings.dst_mode === 'custom' && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '12px' }}>
                    <div>
                      <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>تاريخ بداية التوقيت الصيفي:</label>
                      <input
                        type="datetime-local"
                        className="form-control"
                        value={settings.dst_custom_start ? settings.dst_custom_start.slice(0, 16) : ''}
                        onChange={(e) => setSettings({ ...settings, dst_custom_start: e.target.value ? new Date(e.target.value).toISOString() : '' })}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>تاريخ نهاية التوقيت الصيفي:</label>
                      <input
                        type="datetime-local"
                        className="form-control"
                        value={settings.dst_custom_end ? settings.dst_custom_end.slice(0, 16) : ''}
                        onChange={(e) => setSettings({ ...settings, dst_custom_end: e.target.value ? new Date(e.target.value).toISOString() : '' })}
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="form-group" style={{ background: 'var(--bg-card)', padding: '16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', marginTop: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '14px' }}>
                  <label style={{ fontWeight: 'bold', fontSize: '15px', margin: 0 }}>🖨️ إعدادات الطابعات المزدوجة والطباعة الصامتة (Dual Printers):</label>
                  <button
                    type="button"
                    className="btn btn-outline-primary btn-sm"
                    style={{ borderRadius: '8px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px' }}
                    onClick={() => {
                      setWizardPrinters({
                        printer_name: settings.printer_name || '',
                        bar_printer_name: settings.bar_printer_name || '',
                        shisha_printer_name: settings.shisha_printer_name !== undefined ? settings.shisha_printer_name : 'شيشة',
                        silent_print: settings.silent_print !== undefined ? settings.silent_print : '1'
                      });
                      setShowPrinterWizard(true);
                    }}
                  >
                    <span>🚀</span> تشغيل معالج ضبط الطابعات
                  </button>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                  <input
                    type="checkbox"
                    id="silent_print"
                    style={{ width: '18px', height: '18px' }}
                    checked={settings.silent_print === '1'}
                    onChange={(e) => setSettings({ ...settings, silent_print: e.target.checked ? '1' : '0' })}
                  />
                  <label htmlFor="silent_print" style={{ margin: 0, cursor: 'pointer', fontSize: '14px', fontWeight: '600' }}>
                    ⚡ تفعيل الطباعة المباشرة الصامتة (بدون فتح نافذة المعاينة والطباعة الافتراضية للنظام)
                  </label>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px', background: 'rgba(255, 255, 255, 0.03)', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                  <label htmlFor="receipt_paper_width" style={{ margin: 0, fontSize: '14px', fontWeight: 'bold' }}>
                    📏 عرض ورق الفاتورة الحراري:
                  </label>
                  <select
                    id="receipt_paper_width"
                    value={settings.receipt_paper_width || '80'}
                    onChange={(e) => setSettings({ ...settings, receipt_paper_width: e.target.value })}
                    style={{ minWidth: '220px', padding: '6px 10px', borderRadius: '6px' }}
                  >
                    <option value="80">ورق 80 مم (الافتراضي - 72mm طباعة)</option>
                    <option value="58">ورق 58 مم (محمول/صغير - 48mm طباعة)</option>
                  </select>
                </div>

                <div className="form-row" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
                  {/* 1. Cashier Printer */}
                  <div style={{ background: 'rgba(59, 130, 246, 0.05)', padding: '14px', borderRadius: '10px', border: '1px solid rgba(59, 130, 246, 0.25)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                    <div>
                      <label style={{ fontSize: '14px', fontWeight: 'bold', color: '#60a5fa', display: 'block', marginBottom: '6px' }}>
                        🧾 1. طابعة الكاشير (فواتير الحساب للعميل):
                      </label>
                      {availablePrinters.length > 0 && (
                        <select
                          style={{ marginBottom: '8px', width: '100%' }}
                          value={settings.printer_name || ''}
                          onChange={(e) => setSettings({ ...settings, printer_name: e.target.value })}
                        >
                          <option value="">-- طابعة النظام الافتراضية --</option>
                          {availablePrinters.map((p, idx) => (
                            <option key={idx} value={p.name}>
                              {p.name} {p.isDefault ? '(افتراضية الويندوز)' : ''}
                            </option>
                          ))}
                        </select>
                      )}
                      <input
                        type="text"
                        placeholder="أو اكتب اسم الطابعة: مثلاً POS-80"
                        value={settings.printer_name || ''}
                        onChange={(e) => setSettings({ ...settings, printer_name: e.target.value })}
                      />
                      <small style={{ color: 'var(--text-muted)', fontSize: '11px', display: 'block', marginTop: '4px', marginBottom: '10px' }}>
                        تُطبع عليها فاتورة الحساب وشيك العميل عند طلبه
                      </small>
                    </div>
                    <button
                      type="button"
                      className="btn btn-outline-primary btn-sm"
                      style={{ width: '100%', borderRadius: '6px', fontSize: '11px', fontWeight: '600', padding: '5px' }}
                      onClick={() => testPrintStation('طابعة الكاشير', settings.printer_name)}
                    >
                      🖨️ اختبار طابعة الكاشير
                    </button>
                  </div>

                  {/* 2. Bar/Kitchen Printer */}
                  <div style={{ background: 'rgba(245, 158, 11, 0.05)', padding: '14px', borderRadius: '10px', border: '1px solid rgba(245, 158, 11, 0.25)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                    <div>
                      <label style={{ fontSize: '14px', fontWeight: 'bold', color: '#f59e0b', display: 'block', marginBottom: '6px' }}>
                        ☕ 2. طابعة البار / المطبخ (بونات المشروبات):
                      </label>
                      {availablePrinters.length > 0 && (
                        <select
                          style={{ marginBottom: '8px', width: '100%' }}
                          value={settings.bar_printer_name || ''}
                          onChange={(e) => setSettings({ ...settings, bar_printer_name: e.target.value })}
                        >
                          <option value="">-- نفس طابعة الكاشير الافتراضية --</option>
                          {availablePrinters.map((p, idx) => (
                            <option key={idx} value={p.name}>
                              {p.name} {p.isDefault ? '(افتراضية الويندوز)' : ''}
                            </option>
                          ))}
                        </select>
                      )}
                      <input
                        type="text"
                        placeholder="أو اكتب اسم الطابعة: مثلاً Kitchen-Printer"
                        value={settings.bar_printer_name || ''}
                        onChange={(e) => setSettings({ ...settings, bar_printer_name: e.target.value })}
                      />
                      <small style={{ color: 'var(--text-muted)', fontSize: '11px', display: 'block', marginTop: '4px', marginBottom: '10px' }}>
                        تُطبع عليها بونات المشروبات للتحضير عند الضغط على "إرسال للبار"
                      </small>
                    </div>
                    <button
                      type="button"
                      className="btn btn-outline-warning btn-sm"
                      style={{ width: '100%', borderRadius: '6px', fontSize: '11px', fontWeight: '600', padding: '5px', color: '#fbbf24', borderColor: '#fbbf24' }}
                      onClick={() => testPrintStation('طابعة البار والمطبخ', settings.bar_printer_name)}
                    >
                      🖨️ اختبار طابعة البار
                    </button>
                  </div>

                  {/* 3. Shisha Printer */}
                  <div style={{ background: 'rgba(168, 85, 247, 0.05)', padding: '14px', borderRadius: '10px', border: '1px solid rgba(168, 85, 247, 0.25)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                    <div>
                      <label style={{ fontSize: '14px', fontWeight: 'bold', color: '#c084fc', display: 'block', marginBottom: '6px' }}>
                        💨 3. طابعة قسم الشيشة (بونات الشيشة المنفصلة):
                      </label>
                      {availablePrinters.length > 0 && (
                        <select
                          style={{ marginBottom: '8px', width: '100%' }}
                          value={settings.shisha_printer_name || ''}
                          onChange={(e) => setSettings({ ...settings, shisha_printer_name: e.target.value })}
                        >
                          <option value="">-- افتراضية الشيشة (اسمها: شيشة) --</option>
                          {availablePrinters.map((p, idx) => (
                            <option key={idx} value={p.name}>
                              {p.name} {p.isDefault ? '(افتراضية الويندوز)' : ''}
                            </option>
                          ))}
                        </select>
                      )}
                      <input
                        type="text"
                        placeholder="اسم طابعة الشيشة (الافتراضي: شيشة)"
                        value={settings.shisha_printer_name !== undefined ? settings.shisha_printer_name : 'شيشة'}
                        onChange={(e) => setSettings({ ...settings, shisha_printer_name: e.target.value })}
                      />
                      <small style={{ color: 'var(--text-muted)', fontSize: '11px', display: 'block', marginTop: '4px', marginBottom: '10px' }}>
                        تُطبع عليها أصناف الشيشة تلقائياً وصامتاً عند الضغط على "إرسال للبار"
                      </small>
                    </div>
                    <button
                      type="button"
                      className="btn btn-outline-info btn-sm"
                      style={{ width: '100%', borderRadius: '6px', fontSize: '11px', fontWeight: '600', padding: '5px', color: '#c084fc', borderColor: '#c084fc' }}
                      onClick={() => testPrintStation('طابعة الشيشة', settings.shisha_printer_name)}
                    >
                      🖨️ اختبار طابعة الشيشة
                    </button>
                  </div>
                </div>
              </div>

              <div className="form-group" style={{ background: 'var(--bg-card)', padding: '16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', marginTop: '16px' }}>
                <label style={{ fontWeight: 'bold', fontSize: '15px', display: 'block', marginBottom: '12px' }}>📦 سياسة المخزون ونفاد الكميات:</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <input
                    type="checkbox"
                    id="allow_negative_stock"
                    style={{ width: '18px', height: '18px' }}
                    checked={settings.allow_negative_stock === '1'}
                    onChange={(e) => setSettings({ ...settings, allow_negative_stock: e.target.checked ? '1' : '0' })}
                  />
                  <label htmlFor="allow_negative_stock" style={{ margin: 0, cursor: 'pointer', fontSize: '14px' }}>
                    السماح بالبيع بالسالب (تجاوز المخزون وإتمام البيع حتى لو كان الرصيد صفراً)
                  </label>
                </div>
              </div>

              {/* Settings Toggle: Require prebill check before complete */}
              <div className="form-group" style={{ background: 'var(--bg-card)', padding: '16px', borderRadius: 'var(--radius-md)', border: '1px solid rgba(16, 185, 129, 0.4)', marginTop: '16px' }}>
                <label style={{ fontWeight: 'bold', fontSize: '15px', display: 'block', marginBottom: '10px', color: '#34d399' }}>
                  🧾 سياسة طباعة شيك الحساب للعميل قبل إتمام الطلب:
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <input
                    type="checkbox"
                    id="require_check_print_before_checkout_settings"
                    style={{ width: '20px', height: '20px', cursor: 'pointer', accentColor: '#10b981' }}
                    checked={settings.require_check_print_before_checkout !== 'false' && vendorDevFeatures.require_check_print_before_checkout !== false}
                    onChange={(e) => {
                      const val = e.target.checked;
                      setSettings(prev => ({ ...prev, require_check_print_before_checkout: val ? 'true' : 'false' }));
                      setVendorDevFeatures(prev => ({ ...prev, require_check_print_before_checkout: val }));
                    }}
                  />
                  <label htmlFor="require_check_print_before_checkout_settings" style={{ margin: 0, cursor: 'pointer', fontSize: '14px', fontWeight: 'bold' }}>
                    إلزام طباعة شيك/فاتورة العميل قبل إتمام الطلب والتحصيل
                  </label>
                </div>
                <small style={{ color: 'var(--text-muted)', fontSize: '12px', display: 'block', marginTop: '6px' }}>
                  عند إيقاف هذا الخيار، يمكنك إتمام وتحصيل طلبات الصالة مباشرة بضغطة زر واحدة دون الحاجة لإخراج شيك حساب أولاً.
                </small>
              </div>

              {/* Tables Display: Show "All" Tab Toggle */}
              <div className="form-group" style={{ background: 'var(--bg-card)', padding: '16px', borderRadius: 'var(--radius-md)', border: '1px solid rgba(59, 130, 246, 0.4)', marginTop: '16px' }}>
                <label style={{ fontWeight: 'bold', fontSize: '15px', display: 'block', marginBottom: '10px', color: '#60a5fa' }}>
                  🪑 خيارات عرض شاشة الصالات:
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <input
                    type="checkbox"
                    id="show_all_tables_tab_settings"
                    style={{ width: '20px', height: '20px', cursor: 'pointer', accentColor: '#3b82f6' }}
                    checked={showAllTablesTab}
                    onChange={(e) => handleToggleShowAllTablesTab(e.target.checked)}
                  />
                  <label htmlFor="show_all_tables_tab_settings" style={{ margin: 0, cursor: 'pointer', fontSize: '14px', fontWeight: 'bold' }}>
                    إظهار تبويب "الكل" في شاشة الصالات والطاولات
                  </label>
                </div>
                <small style={{ color: 'var(--text-muted)', fontSize: '12px', display: 'block', marginTop: '6px' }}>
                  عند تفعيل هذا الخيار، يظهر تبويب "الكل" لعرض جميع طاولات الكافيه في قائمة واحدة. وعند إلغائه، يتم تصفح الطاولات حسب الصالة المحددة فقط.
                </small>
              </div>

              <button type="submit" className="btn btn-primary btn-lg" style={{ marginTop: '16px' }}>
                💾 حفظ وتحديث إعدادات الكافيه
              </button>
            </form>

            {/* 1. نظام كابتن الصالة والويتر (شاشات وكروت الويتر) */}
            {(settings.enable_waiter_system === 'true' || vendorDevFeatures.enable_waiter_system || (settings.enable_waiter_system === undefined && (settings.enable_waiter_qr === 'true' || vendorDevFeatures.enable_waiter_qr))) && (
              <div className="settings-card" style={{ marginTop: '24px', border: '1.5px solid #f59e0b', background: 'linear-gradient(135deg, rgba(120, 53, 15, 0.35), rgba(15, 23, 42, 0.85))' }}>
                <div className="card-header-styled" style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '10px' }}>
                  <span className="header-icon" style={{ background: 'rgba(245, 158, 11, 0.2)', color: '#fbbf24', border: '1px solid #f59e0b' }}>📱</span>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '17px', color: '#fbbf24' }}>نظام كابتن الصالة والويتر (Waiter System)</h3>
                    <small style={{ color: 'var(--text-muted)' }}>شاشات هواتف طاقم العمل والويترز للطلب المباشر من الطاولات وطباعة كروت كباتن الصالات</small>
                  </div>
                </div>
                <div style={{ marginTop: '14px', background: 'rgba(0,0,0,0.25)', padding: '14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: 'bold', color: 'var(--text-main)' }}>📱 رابط شاشة الويتر المباشر:</div>
                      <div style={{ fontSize: '13px', color: 'var(--accent-blue, #38bdf8)', direction: 'ltr', textAlign: 'right', marginTop: '4px', fontFamily: 'monospace' }}>
                        {qrInfo?.waiterUrl || (qrInfo?.localIp ? `http://${qrInfo.localIp}:${qrInfo.port || 3000}/waiter` : 'http://localhost:3000/waiter')}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      <a
                        href={qrInfo?.waiterUrl || (qrInfo?.localIp ? `http://${qrInfo.localIp}:${qrInfo.port || 3000}/waiter` : 'http://localhost:3000/waiter')}
                        target="_blank"
                        rel="noreferrer"
                        className="btn btn-primary"
                        style={{ textDecoration: 'none', fontWeight: 'bold', background: '#d97706', borderColor: '#b45309' }}
                      >
                        📱 فتح شاشة الويتر
                      </a>
                      <a
                        href={qrInfo?.waiterQrUrl || (qrInfo?.localIp ? `http://${qrInfo.localIp}:${qrInfo.port || 3000}/qr-waiter` : 'http://localhost:3000/qr-waiter')}
                        target="_blank"
                        rel="noreferrer"
                        className="btn btn-outline-light"
                        style={{ textDecoration: 'none', fontWeight: 'bold', borderColor: '#f59e0b', color: '#fbbf24' }}
                      >
                        🖨️ طباعة كروت الويتر والصالات فقط
                      </a>
                    </div>
                  </div>
                  <div style={{ marginTop: '12px', fontSize: '12.5px', color: 'var(--text-muted)', lineHeight: '1.6' }}>
                    💡 <strong>معلومة:</strong> ملف كروت الويتر يحتوي حصراً على كود كابتن الصالة العام وكروت أقسام الصالات، بدون أي كروت خاصة بالزبائن.
                  </div>
                </div>
              </div>
            )}

            {/* Taqfeela Mobile Hub v1 - ربط هواتف الويتر وتطبيق الموبايل (مفعّل حصراً من إعدادات المطور) */}
            {isMobileHubEnabled && (
            <div className="settings-card" style={{ marginTop: '24px', border: '1.5px solid #EE7F14', background: 'linear-gradient(135deg, rgba(238, 127, 20, 0.12), rgba(15, 23, 42, 0.9))' }}>
              <div className="card-header-styled" style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span className="header-icon" style={{ background: 'rgba(238, 127, 20, 0.2)', color: '#EE7F14', border: '1px solid #EE7F14', fontSize: '20px' }}>📱</span>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '18px', color: '#EE7F14', fontWeight: 'bold' }}>تطبيق الموبايل وربط هواتف الويتر (Taqfeela Mobile Hub)</h3>
                    <small style={{ color: 'var(--text-muted)' }}>ربط هواتف الأندرويد بكود QR، إرسال الطلبات المباشرة للطاولات، واكتشاف الأجهزة عبر الشبكة المحلية</small>
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => setShowPairingModal(true)}
                  style={{
                    background: '#EE7F14',
                    borderColor: '#EE7F14',
                    fontWeight: 'bold',
                    padding: '8px 18px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '14px'
                  }}
                >
                  <span>📲</span>
                  <span>ربط هاتف ويتر جديد (QR Code)</span>
                </button>
              </div>

              {/* Status and Network Info Bar */}
              <div style={{ marginTop: '16px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
                <div style={{ background: 'rgba(0,0,0,0.3)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>🌐 عنوان خادم الكاشير المحلي:</div>
                  <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#38bdf8', direction: 'ltr', textAlign: 'right', marginTop: '4px', fontFamily: 'monospace' }}>
                    http://{qrInfo?.localIp || '127.0.0.1'}:{qrInfo?.port || 3000}
                  </div>
                </div>
                <div style={{ background: 'rgba(0,0,0,0.3)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>📡 الاكتشاف التلقائي (mDNS/UDP Beacon):</div>
                  <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#10b981', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: '#10b981' }}></span>
                    <span>نشط على بورت 53535 (_taqfeela._tcp)</span>
                  </div>
                </div>
                <div style={{ background: 'rgba(0,0,0,0.3)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>📱 الأجهزة المقترنة حالياً:</div>
                  <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#f59e0b', marginTop: '4px' }}>
                    {pairedDevices.filter(d => (d.status === 'active' || !d.status) && !d.revoked_at).length} هاتف نشط
                  </div>
                </div>
              </div>

              {/* Direct auto-append setting */}
              <div style={{ marginTop: '16px', background: 'rgba(0,0,0,0.25)', padding: '14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', margin: 0 }}>
                  <input
                    type="checkbox"
                    checked={settings.waiter_auto_append_to_tables !== 'false'}
                    onChange={(e) => handleToggleAutoAppend(e.target.checked)}
                    style={{ width: '18px', height: '18px', accentColor: '#EE7F14' }}
                  />
                  <div>
                    <span style={{ fontSize: '14px', fontWeight: 'bold', color: 'var(--text-main)' }}>
                      ⚡ إضافة طلبات الويتر تلقائياً لسلة الطاولة (Auto-Append to Table Carts)
                    </span>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                      عند التفعيل، تُضاف طلبات الويتر فورياً إلى الطاولة المحددة بالكاشير وتُطبع بونات المطبخ والبار آلياً بدون الحاجة لضغط الكاشير على قبول الطلب.
                    </div>
                  </div>
                </label>
              </div>

              {/* Paired Devices Table */}
              <div style={{ marginTop: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <h4 style={{ margin: 0, fontSize: '14px', color: 'var(--text-main)' }}>📱 قائمة الهواتف والأجهزة المقترنة بالسيستم:</h4>
                  <button
                    type="button"
                    onClick={loadPairedDevices}
                    disabled={loadingDevices}
                    className="btn btn-sm btn-outline-secondary"
                    style={{ fontSize: '12px', padding: '4px 10px' }}
                  >
                    {loadingDevices ? '⏳ جاري التحديث...' : '🔄 تحديث القائمة'}
                  </button>
                </div>

                {pairedDevices.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '24px', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', color: 'var(--text-muted)', fontSize: '13px' }}>
                    لا توجد أجهزة مقترنة حالياً. اضغط على زر <strong>"ربط هاتف ويتر جديد (QR Code)"</strong> لمسح الكود وربط أول هاتف.
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto', background: 'rgba(0,0,0,0.2)', borderRadius: '8px' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'right' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-muted)' }}>
                          <th style={{ padding: '10px 12px' }}>اسم الجهاز</th>
                          <th style={{ padding: '10px 12px' }}>المنصة</th>
                          <th style={{ padding: '10px 12px' }}>تاريخ الاقتران</th>
                          <th style={{ padding: '10px 12px' }}>آخر نشاط</th>
                          <th style={{ padding: '10px 12px' }}>الحالة</th>
                          <th style={{ padding: '10px 12px', textAlign: 'center' }}>إجراءات</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pairedDevices.map((dev) => {
                          const isRevoked = dev.status === 'revoked' || !!dev.revoked_at;
                          return (
                            <tr key={dev.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', opacity: isRevoked ? 0.6 : 1, background: isRevoked ? 'rgba(239, 68, 68, 0.05)' : 'transparent' }}>
                              <td style={{ padding: '10px 12px', fontWeight: 'bold' }}>
                                📱 {dev.device_name || 'هاتف غير مسمى'}
                              </td>
                              <td style={{ padding: '10px 12px', direction: 'ltr', textAlign: 'right' }}>
                                {dev.platform || 'Android'}
                              </td>
                              <td style={{ padding: '10px 12px', fontSize: '12px', color: 'var(--text-muted)' }}>
                                {dev.paired_at ? new Date(dev.paired_at).toLocaleString('ar-EG', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}
                              </td>
                              <td style={{ padding: '10px 12px', fontSize: '12px', color: 'var(--text-muted)' }}>
                                {(dev.last_seen_at || dev.last_active_at) ? new Date(dev.last_seen_at || dev.last_active_at).toLocaleString('ar-EG', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}
                              </td>
                              <td style={{ padding: '10px 12px' }}>
                                {isRevoked ? (
                                  <span style={{ background: 'rgba(239, 68, 68, 0.2)', color: '#f87171', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold' }}>
                                    مفصول (ملغي)
                                  </span>
                                ) : (
                                  <span style={{ background: 'rgba(16, 185, 129, 0.2)', color: '#34d399', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold' }}>
                                    نشط ومقترن
                                  </span>
                                )}
                              </td>
                              <td style={{ padding: '10px 12px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                                {!isRevoked ? (
                                  <button
                                    type="button"
                                    onClick={() => handleRevokeDevice(dev.id, dev.device_name)}
                                    className="btn btn-sm btn-outline-danger"
                                    style={{ fontSize: '11px', padding: '3px 8px' }}
                                    title="فصل الجهاز عن الكاشير"
                                  >
                                    🚫 إلغاء الاقتران
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteDevice(dev.id, dev.device_name)}
                                    className="btn btn-sm btn-outline-secondary"
                                    style={{ fontSize: '11px', padding: '3px 8px', color: '#ef4444' }}
                                    title="حذف الجهاز نهائياً من السجل"
                                  >
                                    🗑️ حذف نهائي
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
            )}

            {/* 2. نظام باركود ومنيو الزبائن على الطاولات */}
            {(settings.enable_customer_qr === 'true' || vendorDevFeatures.enable_customer_qr || (settings.enable_customer_qr === undefined && (settings.enable_waiter_qr === 'true' || vendorDevFeatures.enable_waiter_qr))) && (
              <div className="settings-card" style={{ marginTop: '24px', border: '1.5px solid #10b981', background: 'linear-gradient(135deg, rgba(6, 78, 59, 0.35), rgba(15, 23, 42, 0.85))' }}>
                <div className="card-header-styled" style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '10px' }}>
                  <span className="header-icon" style={{ background: 'rgba(16, 185, 129, 0.2)', color: '#34d399', border: '1px solid #10b981' }}>🏷️</span>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '17px', color: '#34d399' }}>نظام باركود وقوائم الزبائن على الطاولات (Customer QR Menu)</h3>
                    <small style={{ color: 'var(--text-muted)' }}>روابط منيو الزبائن وطباعة بطاقات QR للطاولات للطلب الذاتي عبر شبكة الكافيه المحلية</small>
                  </div>
                </div>
                <div style={{ marginTop: '14px', background: 'rgba(0,0,0,0.25)', padding: '14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: 'bold', color: 'var(--text-main)' }}>🌐 عنوان سيرفر المنيو المحلي للزبائن:</div>
                      <div style={{ fontSize: '13px', color: 'var(--accent-blue, #38bdf8)', direction: 'ltr', textAlign: 'right', marginTop: '4px', fontFamily: 'monospace' }}>
                        {qrInfo?.url || 'http://localhost:3000/menu'}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      <a
                        href={qrInfo?.tablesUrl || 'http://localhost:3000/qr-tables'}
                        target="_blank"
                        rel="noreferrer"
                        className="btn btn-success"
                        style={{ textDecoration: 'none', fontWeight: 'bold' }}
                      >
                        🖨️ طباعة بطاقات باركود الطاولات للزبائن
                      </a>
                      <a
                        href={qrInfo?.url || 'http://localhost:3000/menu'}
                        target="_blank"
                        rel="noreferrer"
                        className="btn btn-outline-light"
                        style={{ textDecoration: 'none' }}
                      >
                        👁️ تجربة شاشة منيو الزبون
                      </a>
                    </div>
                  </div>
                  <div style={{ marginTop: '12px', fontSize: '12.5px', color: 'var(--text-muted)', lineHeight: '1.6' }}>
                    💡 <strong>معلومة:</strong> ملف كروت الطاولات مخصص للزبائن فقط ولا يتضمن أي كود خاص بكباتن الصالة أو الويتر.
                  </div>
                </div>
              </div>
            )}

            {/* Backup & System Maintenance Card (Admin Only) */}
            {currentUser?.role === 'admin' && (
              <div className="settings-card" style={{ marginTop: '24px', border: '1px solid rgba(59, 130, 246, 0.4)', background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.7), rgba(15, 23, 42, 0.9))' }}>
                <div className="card-header-styled">
                  <span className="header-icon">💾</span>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '17px', color: '#60a5fa' }}>النسخ الاحتياطي والصيانة لقاعدة البيانات</h3>
                    <small style={{ color: 'var(--text-muted)' }}>حفظ واسترجاع كافة بيانات المبيعات، المخزون، والموظفين بأمان تام</small>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '12px', marginTop: '16px', flexWrap: 'wrap' }}>
                  <button type="button" className="btn btn-primary" onClick={handleDialogBackup}>
                    💾 حفظ نسخة احتياطية الآن (تحديد المسار)
                  </button>
                  <button type="button" className="btn btn-secondary" onClick={handleDialogRestore} style={{ borderColor: 'rgba(239, 68, 68, 0.5)' }}>
                    📂 استرجاع نسخة احتياطية من ملف
                  </button>
                </div>
              </div>
            )}


            {/* Shift Schedules Configuration Card (Admin Only + enable_multi_shifts) */}
            {currentUser?.role === 'admin' && vendorDevFeatures.enable_multi_shifts && (
              <div className="settings-card" style={{ marginTop: '24px', border: '1px solid rgba(245, 158, 11, 0.4)' }}>
                <div className="card-header-styled">
                  <span className="header-icon">?</span>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '17px', color: '#f59e0b' }}>مواعيد ورديات الشيفتات (إعدادات الوردية)</h3>
                    <small style={{ color: 'var(--text-muted)' }}>تحديد أوقات فترات العمل في الكافيه، لتسهيل اختيار وقت الشيفت عند الفتح أو للموظفين</small>
                  </div>
                </div>

                <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {shiftSchedules.map((sch, idx) => (
                    <div key={sch.id || idx} style={{ display: 'flex', gap: '10px', alignItems: 'center', background: 'var(--bg-card)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)', flexWrap: 'wrap' }}>
                      <input
                        type="text"
                        style={{ width: '45px', textAlign: 'center', fontSize: '16px' }}
                        value={sch.icon || '?'}
                        title="أيقونة / رمز الشيفت"
                        onChange={(e) => {
                          const next = [...shiftSchedules];
                          next[idx] = { ...next[idx], icon: e.target.value };
                          setShiftSchedules(next);
                        }}
                      />
                      <input
                        type="text"
                        style={{ flex: 1, minWidth: '140px' }}
                        value={sch.name}
                        placeholder="اسم الشيفت (مثال: الشيفت الصباحي)"
                        onChange={(e) => {
                          const next = [...shiftSchedules];
                          next[idx] = { ...next[idx], name: e.target.value };
                          setShiftSchedules(next);
                        }}
                      />
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>من:</span>
                        <input
                          type="time"
                          value={sch.start}
                          onChange={(e) => {
                            const next = [...shiftSchedules];
                            next[idx] = { ...next[idx], start: e.target.value };
                            setShiftSchedules(next);
                          }}
                        />
                        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>إلى:</span>
                        <input
                          type="time"
                          value={sch.end}
                          onChange={(e) => {
                            const next = [...shiftSchedules];
                            next[idx] = { ...next[idx], end: e.target.value };
                            setShiftSchedules(next);
                          }}
                        />
                      </div>
                      {shiftSchedules.length > 1 && (
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          style={{ color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.4)' }}
                          onClick={() => {
                            setShiftSchedules(shiftSchedules.filter((_, i) => i !== idx));
                          }}
                        >
                          🗑️ حذف
                        </button>
                      )}
                    </div>
                  ))}

                  <div style={{ display: 'flex', gap: '10px', marginTop: '12px', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={async () => {
                        try {
                          await api.saveSettings({ ...settings, shift_schedules: JSON.stringify(shiftSchedules) });
                          showToast('✅ تم حفظ وتطبيق مواعيد ورديات الشيفتات بنجاح!');
                          refreshData();
                        } catch (err) {
                          showToast('❌ حدث خطأ أثناء حفظ مواعيد الشيفتات');
                        }
                      }}
                    >
                      💾 حفظ وتطبيق مواعيد الشيفتات الآن
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => {
                        const newId = `shift_${Date.now()}`;
                        setShiftSchedules([...shiftSchedules, { id: newId, name: `وردية ${shiftSchedules.length + 1}`, start: '08:00', end: '16:00', icon: '☕' }]);
                      }}
                    >
                      + إضافة فترة شيفت جديدة
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => setShiftSchedules(DEFAULT_SHIFT_SCHEDULES)}
                    >
                      🔄 استعادة الفترات الافتراضية
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Offline Commercial License Card */}
            <div className="settings-card" style={{ marginTop: '24px', border: '1px solid rgba(16, 185, 129, 0.4)' }}>
              <div className="card-header-styled">
                <span className="header-icon">🔐</span>
                <div>
                  <h3 style={{ margin: 0, fontSize: '17px', color: '#34d399' }}>معلومات ترخيص النظام (Commercial License)</h3>
                  <small style={{ color: 'var(--text-muted)' }}>نظام الحماية والربط بالعتاد (Hardware Machine ID)</small>
                </div>
              </div>
              <div style={{ marginTop: '14px', fontSize: '14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border-color)' }}>
                  <span>حالة الترخيص:</span>
                  <strong className={licenseData.isActivated ? 'text-green' : 'text-danger'}>
                    {licenseData.isActivated ? '🟢 نسخة تجارية مرخصة ومفعلة' : '🔴 غير مفعل / نسخة تجريبية'}
                  </strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border-color)' }}>
                  <span>معرف العتاد الخاص بالجهاز (Machine ID):</span>
                  <code style={{ background: 'var(--bg-main)', padding: '2px 8px', borderRadius: '4px', color: '#93c5fd' }}>
                    {licenseData.machineId || 'CAFE-MACHINE-001'}
                  </code>
                </div>
              </div>
            </div>

            {/* Developer Features Card */}
            <div className="settings-card" style={{ marginTop: '24px', border: '1.5px solid #a855f7', background: 'linear-gradient(135deg, rgba(30, 27, 75, 0.35), rgba(15, 23, 42, 0.65))' }}>
              <div className="card-header-styled" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span className="header-icon" style={{ background: 'rgba(168, 85, 247, 0.2)', color: '#c084fc', border: '1px solid #a855f7' }}>🛠️</span>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '17px', color: '#c084fc' }}>إعدادات المطور وتفعيل الخواص الخاصة (Developer Features)</h3>
                    <small style={{ color: 'var(--text-muted)' }}>التحكم في تشغيل وإيقاف وظائف النظام المتقدمة (البار، الشيك، نقل الطاولات، النوتة، وإلغاء الفواتير)</small>
                  </div>
                </div>
                {vendorDevUnlocked && (
                  <button
                    type="button"
                    className="btn btn-sm btn-secondary"
                    onClick={() => {
                      setVendorDevUnlocked(false);
                      setVendorDevPassword('');
                    }}
                    style={{ borderColor: 'rgba(239, 68, 68, 0.4)', color: '#f87171' }}
                  >
                    🔒 قفل الإعدادات
                  </button>
                )}
              </div>

              {!vendorDevUnlocked ? (
                <form onSubmit={handleUnlockVendorDev} style={{ marginTop: '16px' }}>
                  {licenseData?.machineId && (
                    <div style={{ background: 'rgba(168, 85, 247, 0.08)', border: '1px solid rgba(168, 85, 247, 0.3)', borderRadius: '8px', padding: '8px 12px', marginBottom: '10px' }}>
                      <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '3px' }}>🖥️ معرّف جهازك (Machine ID) — أرسله للمورد ليولّد كود فتح إعدادات المطور:</div>
                      <div style={{ fontFamily: 'monospace', fontSize: '13px', color: '#c084fc', fontWeight: 'bold', userSelect: 'all' }}>{licenseData?.machineId}</div>
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <input
                      type="text"
                      placeholder="الصق كود فتح إعدادات المطور من المورد"
                      value={vendorDevPassword}
                      onChange={(e) => setVendorDevPassword(e.target.value)}
                      style={{ flex: 1, minWidth: '240px', padding: '10px 14px', borderRadius: '8px', background: 'var(--bg-input, rgba(255,255,255,0.06))', color: 'var(--text-main)', border: '1px solid rgba(168, 85, 247, 0.4)', fontSize: '12px', fontFamily: 'monospace' }}
                    />
                    <button type="submit" className="btn" style={{ background: '#a855f7', color: '#fff', fontWeight: 'bold', padding: '10px 20px', borderRadius: '8px', cursor: 'pointer' }}>
                      🔓 فتح إعدادات المطور
                    </button>
                  </div>
                  {vendorDevError && <div style={{ color: '#ef4444', width: '100%', fontSize: '13px', fontWeight: 'bold', marginTop: '4px' }}>{vendorDevError}</div>}
                </form>
              ) : (
                <div style={{ marginTop: '18px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px' }}>
                    
                    {/* Toggle: Bar Order */}
                    <div style={{ background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: '10px', padding: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <strong style={{ fontSize: '15px', color: '#fbbf24', display: 'block', marginBottom: '4px' }}>☕ إرسال الطلب إلى البار</strong>
                        <small style={{ color: 'var(--text-muted)', fontSize: '12px', display: 'block' }}>إظهار زر إرسال الأصناف لطابعة البار/المطبخ في شاشة الـ POS</small>
                      </div>
                      <input
                        type="checkbox"
                        style={{ width: '22px', height: '22px', cursor: 'pointer', accentColor: '#f59e0b' }}
                        checked={vendorDevFeatures.enable_bar_order}
                        onChange={(e) => setVendorDevFeatures(prev => ({ ...prev, enable_bar_order: e.target.checked }))}
                      />
                    </div>

                    {/* Toggle: Guest Check */}
                    <div style={{ background: 'rgba(234, 179, 8, 0.08)', border: '1px solid rgba(234, 179, 8, 0.3)', borderRadius: '10px', padding: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <strong style={{ fontSize: '15px', color: '#facc15', display: 'block', marginBottom: '4px' }}>🧾 طباعة شيك العميل (طلب الحساب)</strong>
                        <small style={{ color: 'var(--text-muted)', fontSize: '12px', display: 'block' }}>إظهار زر طباعة شيك الحساب للعميل قبل إنهاء وتحصيل الفاتورة</small>
                      </div>
                      <input
                        type="checkbox"
                        style={{ width: '22px', height: '22px', cursor: 'pointer', accentColor: '#eab308' }}
                        checked={vendorDevFeatures.enable_guest_check}
                        onChange={(e) => setVendorDevFeatures(prev => ({ ...prev, enable_guest_check: e.target.checked }))}
                      />
                    </div>

                    {/* Toggle: Password required for table transfer */}
                    <div style={{ background: 'rgba(59, 130, 246, 0.08)', border: '1px solid rgba(59, 130, 246, 0.3)', borderRadius: '10px', padding: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <strong style={{ fontSize: '15px', color: '#60a5fa', display: 'block', marginBottom: '4px' }}>🔀 طلب باسورد الأدمن لنقل الطاولات</strong>
                        <small style={{ color: 'var(--text-muted)', fontSize: '12px', display: 'block' }}>اشتراط كلمة مرور المدير عند نقل الطلب أو الأصناف بين الطاولات</small>
                      </div>
                      <input
                        type="checkbox"
                        style={{ width: '22px', height: '22px', cursor: 'pointer', accentColor: '#3b82f6' }}
                        checked={vendorDevFeatures.require_password_transfer_tables}
                        onChange={(e) => setVendorDevFeatures(prev => ({ ...prev, require_password_transfer_tables: e.target.checked }))}
                      />
                    </div>

                    {/* Toggle: Cashier order cancellation */}
                    <div style={{ background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '10px', padding: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <strong style={{ fontSize: '15px', color: '#f87171', display: 'block', marginBottom: '4px' }}>❌ سماح الكاشير بإلغاء الفواتير</strong>
                        <small style={{ color: 'var(--text-muted)', fontSize: '12px', display: 'block' }}>تمكين الكاشير من إلغاء الفواتير المدفوعة دون إدخال كلمة سر الأدمن</small>
                      </div>
                      <input
                        type="checkbox"
                        style={{ width: '22px', height: '22px', cursor: 'pointer', accentColor: '#ef4444' }}
                        checked={vendorDevFeatures.allow_cashier_cancel_orders}
                        onChange={(e) => setVendorDevFeatures(prev => ({ ...prev, allow_cashier_cancel_orders: e.target.checked }))}
                      />
                    </div>

                    {/* Toggle: Notebook for Admin (Master Notebook Module Toggle) */}
                    <div style={{ background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: '10px', padding: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <strong style={{ fontSize: '15px', color: '#f59e0b', display: 'block', marginBottom: '4px' }}>📝 تفعيل موديول دفتر النوتة والآجل بالكامل (للمدير)</strong>
                        <small style={{ color: 'var(--text-muted)', fontSize: '12px', display: 'block' }}>إتاحة دفتر النوتة وحسابات الآجل للمدير في التبويبات والسلة. عند التعطيل يختفي موديول النوتة تماماً من السيستم</small>
                      </div>
                      <input
                        type="checkbox"
                        style={{ width: '22px', height: '22px', cursor: 'pointer', accentColor: '#f59e0b' }}
                        checked={vendorDevFeatures.enable_notebook_for_admin !== false}
                        onChange={(e) => setVendorDevFeatures(prev => ({ ...prev, enable_notebook_for_admin: e.target.checked }))}
                      />
                    </div>

                    {/* Toggle: Notebook for Cashier */}
                    <div style={{ background: 'rgba(168, 85, 247, 0.08)', border: '1px solid rgba(168, 85, 247, 0.3)', borderRadius: '10px', padding: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', opacity: vendorDevFeatures.enable_notebook_for_admin === false ? 0.5 : 1 }}>
                      <div>
                        <strong style={{ fontSize: '15px', color: '#c084fc', display: 'block', marginBottom: '4px' }}>📒 إظهار دفتر النوتة والآجل للكاشير</strong>
                        <small style={{ color: 'var(--text-muted)', fontSize: '12px', display: 'block' }}>تمكين الكاشير من تسجيل الفواتير على حساب العملاء في دفتر النوتة (يتطلب تفعيل موديول النوتة للمدير أولاً)</small>
                      </div>
                      <input
                        type="checkbox"
                        disabled={vendorDevFeatures.enable_notebook_for_admin === false}
                        style={{ width: '22px', height: '22px', cursor: vendorDevFeatures.enable_notebook_for_admin === false ? 'not-allowed' : 'pointer', accentColor: '#a855f7' }}
                        checked={vendorDevFeatures.show_notebook_to_cashier}
                        onChange={(e) => setVendorDevFeatures(prev => ({ ...prev, show_notebook_to_cashier: e.target.checked }))}
                      />
                    </div>

                    {/* Toggle: Stock Alert */}
                    <div style={{ background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: '10px', padding: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <strong style={{ fontSize: '15px', color: '#34d399', display: 'block', marginBottom: '4px' }}>📦 تنبيهات المخزون عند الطلب</strong>
                        <small style={{ color: 'var(--text-muted)', fontSize: '12px', display: 'block' }}>إظهار تنبيه للكاشير عند محاولة طلب صنف شارف رصيده على النفاد</small>
                      </div>
                      <input
                        type="checkbox"
                        style={{ width: '22px', height: '22px', cursor: 'pointer', accentColor: '#10b981' }}
                        checked={vendorDevFeatures.show_stock_alert_on_order}
                        onChange={(e) => setVendorDevFeatures(prev => ({ ...prev, show_stock_alert_on_order: e.target.checked }))}
                      />
                    </div>

                    {/* Toggle: Multi-Shift System */}
                    <div style={{ background: 'rgba(99, 102, 241, 0.08)', border: '1px solid rgba(99, 102, 241, 0.3)', borderRadius: '10px', padding: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <strong style={{ fontSize: '15px', color: '#818cf8', display: 'block', marginBottom: '4px' }}>⏱️ نظام الورديات والشيفتات المتعددة</strong>
                        <small style={{ color: 'var(--text-muted)', fontSize: '12px', display: 'block' }}>تفعيل تقسيم فترات الشيفتات (صباحي / مسائي). عند التعطيل يعمل البرنامج بنظام اليومية المستمرة (24 ساعة) بدون إجبار على فترات</small>
                      </div>
                      <input
                        type="checkbox"
                        style={{ width: '22px', height: '22px', cursor: 'pointer', accentColor: '#6366f1' }}
                        checked={vendorDevFeatures.enable_multi_shifts}
                        onChange={(e) => setVendorDevFeatures(prev => ({ ...prev, enable_multi_shifts: e.target.checked }))}
                      />
                    </div>

                    {/* Toggle: Show Orders History to Cashier */}
                    <div style={{ background: 'rgba(59, 130, 246, 0.08)', border: '1px solid rgba(59, 130, 246, 0.3)', borderRadius: '10px', padding: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <strong style={{ fontSize: '15px', color: '#60a5fa', display: 'block', marginBottom: '4px' }}>📜 إظهار سجل الفواتير للكاشير</strong>
                        <small style={{ color: 'var(--text-muted)', fontSize: '12px', display: 'block' }}>إظهار أو إخفاء زر وتبويب سجل الفواتير والمبيعات السابقة من واجهة الكاشير</small>
                      </div>
                      <input
                        type="checkbox"
                        style={{ width: '22px', height: '22px', cursor: 'pointer', accentColor: '#3b82f6' }}
                        checked={vendorDevFeatures.show_orders_to_cashier}
                        onChange={(e) => setVendorDevFeatures(prev => ({ ...prev, show_orders_to_cashier: e.target.checked }))}
                      />
                    </div>

                    {/* Toggle: Require check print before checkout */}
                    <div style={{ background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: '10px', padding: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <strong style={{ fontSize: '15px', color: '#34d399', display: 'block', marginBottom: '4px' }}>🔒 إلزام طباعة فاتورة/شيك العميل قبل إتمام الطلب</strong>
                        <small style={{ color: 'var(--text-muted)', fontSize: '12px', display: 'block' }}>منع إنهاء وتحصيل الطلب أو إغلاق الطاولة إلا بعد استخراج وطباعة فاتورة/شيك للعميل أولاً</small>
                      </div>
                      <input
                        type="checkbox"
                        style={{ width: '22px', height: '22px', cursor: 'pointer', accentColor: '#10b981' }}
                        checked={vendorDevFeatures.require_check_print_before_checkout}
                        onChange={(e) => setVendorDevFeatures(prev => ({ ...prev, require_check_print_before_checkout: e.target.checked }))}
                      />
                    </div>

                    {/* Toggle 1: Waiter System */}
                    <div style={{ background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: '10px', padding: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <strong style={{ fontSize: '15px', color: '#fbbf24', display: 'block', marginBottom: '4px' }}>📱 نظام كابتن الصالة والويتر (Waiter System)</strong>
                        <small style={{ color: 'var(--text-muted)', fontSize: '12px', display: 'block' }}>إتاحة شاشات كابتن الصالة للموبايل وطباعة كروت كباتن الصالات (ميزة مستقلة بسعر منفصل)</small>
                      </div>
                      <input
                        type="checkbox"
                        style={{ width: '22px', height: '22px', cursor: 'pointer', accentColor: '#f59e0b' }}
                        checked={vendorDevFeatures.enable_waiter_system}
                        onChange={(e) => setVendorDevFeatures(prev => ({
                          ...prev,
                          enable_waiter_system: e.target.checked,
                          enable_waiter_qr: e.target.checked || prev.enable_customer_qr
                        }))}
                      />
                    </div>

                    {/* Toggle 2: Customer Table QR Menu */}
                    <div style={{ background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: '10px', padding: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <strong style={{ fontSize: '15px', color: '#34d399', display: 'block', marginBottom: '4px' }}>🏷️ نظام منيو وكروت الزبائن على الطاولات (Customer QR)</strong>
                        <small style={{ color: 'var(--text-muted)', fontSize: '12px', display: 'block' }}>إتاحة طلب المنيو الذاتي للزبائن بالباركود وطباعة كروت الطاولات فقط (ميزة مستقلة بسعر منفصل)</small>
                      </div>
                      <input
                        type="checkbox"
                        style={{ width: '22px', height: '22px', cursor: 'pointer', accentColor: '#10b981' }}
                        checked={vendorDevFeatures.enable_customer_qr}
                        onChange={(e) => setVendorDevFeatures(prev => ({
                          ...prev,
                          enable_customer_qr: e.target.checked,
                          enable_waiter_qr: e.target.checked || prev.enable_waiter_system
                        }))}
                      />
                    </div>

                    {/* Toggle 3: Taqfeela Mobile Hub (Android App + QR Pairing) */}
                    <div style={{ background: 'rgba(238, 127, 20, 0.1)', border: '1px solid rgba(238, 127, 20, 0.4)', borderRadius: '10px', padding: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <strong style={{ fontSize: '15px', color: '#EE7F14', display: 'block', marginBottom: '4px' }}>📲 تطبيق الموبايل وربط هواتف الويتر (Mobile Hub & QR Pairing)</strong>
                        <small style={{ color: 'var(--text-muted)', fontSize: '12px', display: 'block' }}>تفعيل قسم تطبيق الموبايل، إنشاء أكواد الاقتران والـ QR، وإدارة الهواتف المربوطة (ميزة مستقلة خاصة بالمطور فقط)</small>
                      </div>
                      <input
                        type="checkbox"
                        style={{ width: '22px', height: '22px', cursor: 'pointer', accentColor: '#EE7F14' }}
                        checked={Boolean(vendorDevFeatures.enable_mobile_hub)}
                        onChange={(e) => setVendorDevFeatures(prev => ({ ...prev, enable_mobile_hub: e.target.checked }))}
                      />
                    </div>

                    {/* Toggle: Enable Take Away */}
                    <div style={{ background: 'rgba(251, 146, 60, 0.08)', border: '1px solid rgba(251, 146, 60, 0.3)', borderRadius: '10px', padding: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <strong style={{ fontSize: '15px', color: '#fb923c', display: 'block', marginBottom: '4px' }}>🛍️ تفعيل خيار التيك أواي</strong>
                        <small style={{ color: 'var(--text-muted)', fontSize: '12px', display: 'block' }}>إظهار أو إخفاء زر "تيك أواي" من شاشة الكاشير والأدمن — عند التعطيل لا يظهر لأي مستخدم</small>
                      </div>
                      <input
                        type="checkbox"
                        style={{ width: '22px', height: '22px', cursor: 'pointer', accentColor: '#f97316' }}
                        checked={vendorDevFeatures.enable_takeaway !== false}
                        onChange={(e) => setVendorDevFeatures(prev => ({ ...prev, enable_takeaway: e.target.checked }))}
                      />
                    </div>

                    {/* Toggle: Shift Status Bar (فودافون كاش وكاش الدرج) */}
                    <div style={{ background: 'rgba(96, 165, 250, 0.08)', border: '1px solid rgba(96, 165, 250, 0.3)', borderRadius: '10px', padding: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <strong style={{ fontSize: '15px', color: '#60a5fa', display: 'block', marginBottom: '4px' }}>📊 إظهار كاش الدرج وفودافون كاش في الشريط العلوي</strong>
                        <small style={{ color: 'var(--text-muted)', fontSize: '12px', display: 'block' }}>إظهار مبيعات فودافون كاش وكاش الدرج في شريط الشيفت بالهيدر (إجمالي المبيعات والطلبات يظهران بشكل افتراضي)</small>
                      </div>
                      <input
                        type="checkbox"
                        style={{ width: '22px', height: '22px', cursor: 'pointer', accentColor: '#3b82f6' }}
                        checked={Boolean(vendorDevFeatures.show_shift_status_bar)}
                        onChange={(e) => setVendorDevFeatures(prev => ({ ...prev, show_shift_status_bar: e.target.checked }))}
                      />
                    </div>

                    {/* Toggle: Bar Ticket in Receipt / Pre-bill modal */}
                    <div style={{ background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: '10px', padding: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <strong style={{ fontSize: '15px', color: '#fbbf24', display: 'block', marginBottom: '4px' }}>☕ زر طباعة بون البار في شاشة الفاتورة والشيك</strong>
                        <small style={{ color: 'var(--text-muted)', fontSize: '12px', display: 'block' }}>إظهار زر (طباعة بون البار) داخل نافذة الفاتورة وطباعة الشيك للعميل</small>
                      </div>
                      <input
                        type="checkbox"
                        style={{ width: '22px', height: '22px', cursor: 'pointer', accentColor: '#f59e0b' }}
                        checked={Boolean(vendorDevFeatures.show_bar_ticket_in_receipt)}
                        onChange={(e) => setVendorDevFeatures(prev => ({ ...prev, show_bar_ticket_in_receipt: e.target.checked }))}
                      />
                    </div>
                  </div>

                  {/* Waiter System Card in Dev Mode */}
                  {vendorDevFeatures.enable_waiter_system && (
                    <div style={{ marginTop: '20px', border: '1px solid rgba(245, 158, 11, 0.5)', background: 'linear-gradient(135deg, rgba(120, 53, 15, 0.35), rgba(15, 23, 42, 0.9))', borderRadius: '10px', padding: '16px' }}>
                      <div className="card-header-styled" style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '10px' }}>
                        <span className="header-icon" style={{ color: '#fbbf24' }}>📱</span>
                        <div>
                          <h3 style={{ margin: 0, fontSize: '16px', color: '#fbbf24' }}>نظام كابتن الصالة والويتر (خاص بطاقم العمل)</h3>
                          <small style={{ color: 'var(--text-muted)' }}>روابط شاشات هواتف الويترز وطباعة كروت كباتن الصالات فقط</small>
                        </div>
                      </div>
                      <div style={{ marginTop: '12px', background: 'rgba(0,0,0,0.25)', padding: '12px', borderRadius: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                          <div>
                            <div style={{ fontSize: '13px', fontWeight: 'bold', color: 'var(--text-main)' }}>📱 رابط شاشة الويتر المباشر:</div>
                            <div style={{ fontSize: '12.5px', color: 'var(--accent-blue, #38bdf8)', direction: 'ltr', textAlign: 'right', marginTop: '4px', fontFamily: 'monospace' }}>
                              {qrInfo?.waiterUrl || (qrInfo?.localIp ? `http://${qrInfo.localIp}:${qrInfo.port || 3000}/waiter` : 'http://localhost:3000/waiter')}
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            <a
                              href={qrInfo?.waiterUrl || (qrInfo?.localIp ? `http://${qrInfo.localIp}:${qrInfo.port || 3000}/waiter` : 'http://localhost:3000/waiter')}
                              target="_blank"
                              rel="noreferrer"
                              className="btn btn-primary"
                              style={{ textDecoration: 'none', fontWeight: 'bold', background: '#d97706', borderColor: '#b45309' }}
                            >
                              📱 فتح شاشة الويتر
                            </a>
                            <a
                              href={qrInfo?.waiterQrUrl || (qrInfo?.localIp ? `http://${qrInfo.localIp}:${qrInfo.port || 3000}/qr-waiter` : 'http://localhost:3000/qr-waiter')}
                              target="_blank"
                              rel="noreferrer"
                              className="btn btn-outline-light"
                              style={{ textDecoration: 'none', fontWeight: 'bold', borderColor: '#f59e0b', color: '#fbbf24' }}
                            >
                              🖨️ طباعة كروت الويتر والصالات فقط
                            </a>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Customer Table QR Card in Dev Mode */}
                  {vendorDevFeatures.enable_customer_qr && (
                    <div style={{ marginTop: '20px', border: '1px solid rgba(16, 185, 129, 0.5)', background: 'linear-gradient(135deg, rgba(6, 78, 59, 0.4), rgba(15, 23, 42, 0.9))', borderRadius: '10px', padding: '16px' }}>
                      <div className="card-header-styled" style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '10px' }}>
                        <span className="header-icon" style={{ color: '#34d399' }}>🏷️</span>
                        <div>
                          <h3 style={{ margin: 0, fontSize: '16px', color: '#34d399' }}>نظام كروت وقوائم الزبائن على الطاولات (Customer QR Menu)</h3>
                          <small style={{ color: 'var(--text-muted)' }}>روابط منيو الزبائن وطباعة بطاقات QR الخاصة بالطاولات فقط</small>
                        </div>
                      </div>
                      <div style={{ marginTop: '12px', background: 'rgba(0,0,0,0.25)', padding: '12px', borderRadius: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                          <div>
                            <div style={{ fontSize: '13px', fontWeight: 'bold', color: 'var(--text-main)' }}>🌐 عنوان سيرفر المنيو للزبائن:</div>
                            <div style={{ fontSize: '12.5px', color: 'var(--accent-blue, #38bdf8)', direction: 'ltr', textAlign: 'right', marginTop: '4px', fontFamily: 'monospace' }}>
                              {qrInfo?.url || 'http://localhost:3000/menu'}
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            <a
                              href={qrInfo?.tablesUrl || 'http://localhost:3000/qr-tables'}
                              target="_blank"
                              rel="noreferrer"
                              className="btn btn-success"
                              style={{ textDecoration: 'none', fontWeight: 'bold' }}
                            >
                              🖨️ طباعة بطاقات باركود الطاولات للزبائن
                            </a>
                            <a
                              href={qrInfo?.url || 'http://localhost:3000/menu'}
                              target="_blank"
                              rel="noreferrer"
                              className="btn btn-outline-light"
                              style={{ textDecoration: 'none' }}
                            >
                              👁️ تجربة شاشة المنيو
                            </a>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {vendorDevError && <div style={{ color: '#ef4444', fontSize: '13px', fontWeight: 'bold', marginTop: '10px' }}>{vendorDevError}</div>}

                  <div style={{ marginTop: '16px', display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={handleSaveVendorDevFeatures}
                      disabled={vendorDevSaving}
                      style={{ background: 'linear-gradient(135deg, #a855f7, #7c3aed)', border: 'none', padding: '10px 24px', fontWeight: 'bold', fontSize: '14px' }}
                    >
                      {vendorDevSaving ? '⏳ جاري الحفظ...' : '💾 حفظ وتطبيق خواص المطور'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* System Reset / Maintenance Card */}
            {currentUser?.role === 'admin' && (
              <div className="settings-card" style={{ marginTop: '24px', border: '1px solid rgba(239, 68, 68, 0.4)' }}>
                <div className="card-header-styled">
                  <span className="header-icon">⚠️</span>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '17px', color: '#f87171' }}>إعادة ضبط النظام والتهيئة للبيع (System Reset)</h3>
                    <small style={{ color: 'var(--text-muted)' }}>تصفير العمليات لتسليم النظام لعميل جديد أو إعادة تشغيل الكافيه</small>
                  </div>
                </div>
                <div style={{ marginTop: '16px' }}>
                  <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px', lineHeight: '1.6' }}>
                    هذه العمليات حساسة ومحمية بكلمة مرور الأدمن. يرجى اختيار نوع التصفير المطلوب بعناية:
                  </p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px' }}>

                    {/* ===== NEW: مسح الفلوس والمصروفات ===== */}
                    <div style={{ background: 'rgba(6, 182, 212, 0.08)', border: '2px solid rgba(6, 182, 212, 0.45)', borderRadius: '10px', padding: '16px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                      <div>
                        <div style={{ fontSize: '15px', fontWeight: 'bold', color: '#22d3ee', marginBottom: '8px' }}>
                          🗑️ مسح الفلوس والمصروفات — ابدأ على نضافة
                        </div>
                        <p style={{ fontSize: '12.5px', color: 'var(--text-muted)', lineHeight: '1.6', margin: 0 }}>
                          يحذف <strong>كل الفواتير، المبيعات، المصروفات، الشيفتات، وحركات الخزينة</strong> ويعيد العداد من أول وجديد.<br />
                          <span style={{ color: '#16a34a', fontWeight: 'bold' }}>✅ يُبقي: المنيو، الأصناف، الموظفين، الطاولات، إعدادات الكافيه</span>
                        </p>
                      </div>
                      <button
                        type="button"
                        id="btn-clear-financial-data"
                        className="btn"
                        style={{ marginTop: '14px', fontWeight: 'bold', background: 'linear-gradient(135deg, #0891b2, #0e7490)', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 16px', cursor: 'pointer', fontSize: '14px' }}
                        onClick={() => {
                          setSystemResetType('transactions_only');
                          setSystemResetPassword('');
                          setSystemResetError('');
                          setSystemResetModal(true);
                        }}
                      >
                        🗑️ امسح الفلوس والمصروفات وابدأ من أول وجديد
                      </button>
                    </div>

                    <div style={{ background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: '10px', padding: '16px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                      <div>
                        <div style={{ fontSize: '15px', fontWeight: 'bold', color: '#fbbf24', marginBottom: '6px' }}>
                          🧹 تصفير المعاملات فقط (مع الحفاظ على المنيو)
                        </div>
                        <p style={{ fontSize: '12.5px', color: 'var(--text-muted)', lineHeight: '1.5', margin: 0 }}>
                          يفرغ كافة الفواتير، الورديات، اليوميات، حركات الخزينة والمصروفات وحسابات النوتة والآجل، لكنه <strong>يحافظ على قائمة المنيو والأصناف والأقسام والطاولات والإعدادات</strong> جاهزة للعمل فوراً. (مثالي لتسليم نسخة جاهزة بأسماء الأصناف لكافيه جديد).
                        </p>
                      </div>
                      <button
                        type="button"
                        className="btn btn-warning"
                        style={{ marginTop: '14px', fontWeight: 'bold' }}
                        onClick={() => {
                          setSystemResetType('transactions_only');
                          setSystemResetPassword('');
                          setSystemResetError('');
                          setSystemResetModal(true);
                        }}
                      >
                        🧹 تصفير الفواتير والعمليات (إبقاء المنيو)
                      </button>
                    </div>

                    <div style={{ background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '10px', padding: '16px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                      <div>
                        <div style={{ fontSize: '15px', fontWeight: 'bold', color: '#f87171', marginBottom: '6px' }}>
                          💣 إعادة ضبط المصنع الشامل (مسح كامل)
                        </div>
                        <p style={{ fontSize: '12.5px', color: 'var(--text-muted)', lineHeight: '1.5', margin: 0 }}>
                          يمسح كافة العمليات والفواتير وأيضاً <strong>يحذف كافة الأصناف والمنيو المضافة</strong> ويعيد النظام كأول يوم تنصيب خالياً تماماً، مع الحفاظ على ترخيص البرنامج.
                        </p>
                      </div>
                      <button
                        type="button"
                        className="btn btn-danger"
                        style={{ marginTop: '14px', fontWeight: 'bold' }}
                        onClick={() => {
                          setSystemResetType('full_factory');
                          setSystemResetPassword('');
                          setSystemResetError('');
                          setSystemResetModal(true);
                        }}
                      >
                        💣 إعادة ضبط المصنع الشامل
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
            {isMobileHubEnabled && (
              <MobilePairingModal
                isOpen={showPairingModal}
                onClose={() => {
                  setShowPairingModal(false);
                  loadPairedDevices();
                }}
                showToast={showToast}
              />
            )}
          </div>
        </SectionErrorBoundary>
  );
}
