import React from 'react';

export default function PrinterWizardModal({
  availablePrinters,
  handleSavePrinterWizard,
  refreshPrinters,
  setShowPrinterWizard,
  setWizardPrinters,
  testPrintStation,
  wizardPrinters
}) {
  return (
    <div className="modal-overlay" style={{ zIndex: 99999, background: 'rgba(0, 0, 0, 0.8)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div
            className="modal-content"
            style={{
              width: '100%',
              maxWidth: '880px',
              maxHeight: '94vh',
              overflowY: 'auto',
              background: 'var(--bg-card, #1e293b)',
              borderRadius: '16px',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 35px rgba(59, 130, 246, 0.2)',
              padding: '24px 28px',
              color: 'var(--text-main, #f8fafc)'
            }}
          >
            {/* Header */}
            <div style={{ textAlign: 'center', marginBottom: '18px', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', paddingBottom: '14px' }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '52px', height: '52px', borderRadius: '14px', background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)', fontSize: '26px', marginBottom: '8px', boxShadow: '0 4px 16px rgba(59, 130, 246, 0.35)' }}>
                🖨️
              </div>
              <h2 style={{ fontSize: '21px', fontWeight: '800', margin: '0 0 6px 0', color: '#fff' }}>
                تهيئة وتحديد طابعات النظام (Select Printer)
              </h2>
              <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-muted, #94a3b8)', maxWidth: '620px', marginInline: 'auto', lineHeight: '1.6' }}>
                اختر الطابعة الخاصة بكل قسم من قائمة طابعات الويندوز المكتشفة أدناه بنقرة زر واحدة، أو افتح نافذة طباعة الويندوز الأصلية لتجربة ومعاينة الطابعات.
              </p>
            </div>

            {/* نافذة اختيار طابعات الويندوز الأصلية (على غرار نافذة الويندوز Select Printer) */}
            <div style={{ background: 'var(--bg-body, #0f172a)', borderRadius: '12px', border: '1px solid var(--border-color, #334155)', padding: '14px', marginBottom: '18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '12px', borderBottom: '1px solid var(--border-color, #334155)', paddingBottom: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '18px' }}>🖥️</span>
                  <strong style={{ fontSize: '14px', color: '#f8fafc' }}>طابعات الويندوز المكتشفة بالجهاز (Select Printer):</strong>
                  <span style={{ fontSize: '11px', background: 'rgba(59, 130, 246, 0.2)', color: '#60a5fa', padding: '2px 8px', borderRadius: '12px', fontWeight: 'bold' }}>
                    {availablePrinters.length} طابعة متاحة
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <button
                    type="button"
                    className="btn btn-outline-secondary btn-sm"
                    style={{ fontSize: '11px', padding: '5px 10px', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}
                    onClick={refreshPrinters}
                    title="إعادة فحص واكتشاف طابعات الويندوز"
                  >
                    <span>🔄</span> تحديث الفحص
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline-primary btn-sm"
                    style={{ fontSize: '11px', padding: '5px 12px', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '5px', fontWeight: '700' }}
                    onClick={() => {
                      window.print();
                    }}
                    title="فتح نافذة طباعة الويندوز الأصلية (Print Dialog)"
                  >
                    <span>🖨️</span> فتح نافذة طباعة الويندوز (Print)
                  </button>
                </div>
              </div>

              {availablePrinters.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '20px 12px', color: 'var(--text-muted, #94a3b8)' }}>
                  <div style={{ fontSize: '28px', marginBottom: '6px' }}>🔍</div>
                  <div style={{ fontWeight: '600', fontSize: '13px', marginBottom: '4px', color: '#f8fafc' }}>
                    لم يتم التعرف على طابعات الويندوز تلقائياً حتى الآن
                  </div>
                  <div style={{ fontSize: '12px', marginBottom: '12px' }}>
                    تأكد من توصيل الطابعة عبر الـ USB أو الشبكة وتشغيلها، ثم اضغط زر التحديث أدناه.
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'center', gap: '8px' }}>
                    <button type="button" className="btn btn-primary btn-sm" onClick={refreshPrinters} style={{ fontSize: '12px', borderRadius: '6px' }}>
                      🔄 فحص واكتشاف الطابعات الآن
                    </button>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => window.print()} style={{ fontSize: '12px', borderRadius: '6px' }}>
                      🖨️ فتح نافذة الويندوز للاختيار
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted, #94a3b8)', marginBottom: '8px' }}>
                    💡 اضغط على الزر المقابل لأي طابعة لتعيينها مباشرة للكاشير أو البار أو الشيشة:
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '8px', maxHeight: '200px', overflowY: 'auto', padding: '2px' }}>
                    {availablePrinters.map((p, idx) => {
                      const isCashier = wizardPrinters.printer_name === p.name;
                      const isBar = wizardPrinters.bar_printer_name === p.name;
                      const isShisha = wizardPrinters.shisha_printer_name === p.name;
                      return (
                        <div
                          key={idx}
                          style={{
                            background: (isCashier || isBar || isShisha) ? 'rgba(59, 130, 246, 0.12)' : 'var(--bg-card, #1e293b)',
                            border: (isCashier || isBar || isShisha) ? '1.5px solid #3b82f6' : '1px solid var(--border-color, #334155)',
                            borderRadius: '8px',
                            padding: '8px 10px',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'space-between'
                          }}
                        >
                          <div style={{ marginBottom: '6px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden' }}>
                                <span style={{ fontSize: '16px' }}>🖨️</span>
                                <span style={{ fontSize: '12px', fontWeight: 'bold', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden', color: '#fff' }} title={p.name}>
                                  {p.name}
                                </span>
                              </div>
                              {p.isDefault && (
                                <span style={{ fontSize: '9px', background: '#10b981', color: '#fff', padding: '1px 5px', borderRadius: '4px', whiteSpace: 'nowrap' }}>
                                  الافتراضية ⭐
                                </span>
                              )}
                            </div>
                            <div style={{ display: 'flex', gap: '4px', marginTop: '4px', flexWrap: 'wrap' }}>
                              {isCashier && <span style={{ fontSize: '9px', background: '#3b82f6', color: '#fff', padding: '1px 5px', borderRadius: '3px' }}>✓ كاشير</span>}
                              {isBar && <span style={{ fontSize: '9px', background: '#f59e0b', color: '#fff', padding: '1px 5px', borderRadius: '3px' }}>✓ بار</span>}
                              {isShisha && <span style={{ fontSize: '9px', background: '#a855f7', color: '#fff', padding: '1px 5px', borderRadius: '3px' }}>✓ شيشة</span>}
                            </div>
                          </div>

                          {/* Quick Assign Buttons */}
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px', borderTop: '1px solid rgba(255, 255, 255, 0.06)', paddingTop: '6px' }}>
                            <button
                              type="button"
                              style={{
                                fontSize: '11px',
                                padding: '3px 2px',
                                borderRadius: '4px',
                                border: '1px solid #3b82f6',
                                background: isCashier ? '#3b82f6' : 'transparent',
                                color: isCashier ? '#fff' : '#60a5fa',
                                cursor: 'pointer',
                                fontWeight: isCashier ? 'bold' : 'normal'
                              }}
                              onClick={() => setWizardPrinters(prev => ({ ...prev, printer_name: p.name }))}
                            >
                              {isCashier ? '✓ كاشير' : '+ كاشير'}
                            </button>
                            <button
                              type="button"
                              style={{
                                fontSize: '11px',
                                padding: '3px 2px',
                                borderRadius: '4px',
                                border: '1px solid #f59e0b',
                                background: isBar ? '#f59e0b' : 'transparent',
                                color: isBar ? '#fff' : '#fbbf24',
                                cursor: 'pointer',
                                fontWeight: isBar ? 'bold' : 'normal'
                              }}
                              onClick={() => setWizardPrinters(prev => ({ ...prev, bar_printer_name: p.name }))}
                            >
                              {isBar ? '✓ بار' : '+ بار'}
                            </button>
                            <button
                              type="button"
                              style={{
                                fontSize: '11px',
                                padding: '3px 2px',
                                borderRadius: '4px',
                                border: '1px solid #a855f7',
                                background: isShisha ? '#a855f7' : 'transparent',
                                color: isShisha ? '#fff' : '#c084fc',
                                cursor: 'pointer',
                                fontWeight: isShisha ? 'bold' : 'normal'
                              }}
                              onClick={() => setWizardPrinters(prev => ({ ...prev, shisha_printer_name: p.name }))}
                            >
                              {isShisha ? '✓ شيشة' : '+ شيشة'}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Stations Selected Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px', marginBottom: '18px' }}>
              {/* 1. Cashier Printer */}
              <div style={{ background: 'rgba(59, 130, 246, 0.06)', borderRadius: '12px', border: '1px solid rgba(59, 130, 246, 0.25)', padding: '14px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                    <span style={{ fontSize: '18px' }}>🧾</span>
                    <strong style={{ fontSize: '14px', color: '#60a5fa' }}>1. طابعة الكاشير</strong>
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted, #94a3b8)', marginBottom: '8px' }}>
                    فواتير حساب العميل وشيكات الطاولات.
                  </div>
                  <div style={{ marginBottom: '8px' }}>
                    <select
                      style={{ width: '100%', padding: '7px 9px', borderRadius: '7px', background: 'var(--bg-input, #0f172a)', border: '1px solid var(--border-color, #334155)', color: '#fff', fontSize: '12px' }}
                      value={wizardPrinters.printer_name}
                      onChange={(e) => setWizardPrinters(prev => ({ ...prev, printer_name: e.target.value }))}
                    >
                      <option value="">-- طابعة الويندوز الافتراضية --</option>
                      {availablePrinters.map((p, idx) => (
                        <option key={idx} value={p.name}>
                          {p.name} {p.isDefault ? '(الافتراضية)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div style={{ fontSize: '11px', color: '#93c5fd', marginBottom: '10px' }}>
                    الطابعة المحددة: <strong>{wizardPrinters.printer_name || 'الافتراضية للويندوز'}</strong>
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-outline-primary btn-sm"
                  style={{ width: '100%', borderRadius: '7px', padding: '6px', fontSize: '12px', fontWeight: '600', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                  onClick={() => testPrintStation('طابعة الكاشير (فواتير)', wizardPrinters.printer_name)}
                >
                  <span>🖨️</span> تجربة طباعة الكاشير
                </button>
              </div>

              {/* 2. Bar/Kitchen Printer */}
              <div style={{ background: 'rgba(245, 158, 11, 0.06)', borderRadius: '12px', border: '1px solid rgba(245, 158, 11, 0.25)', padding: '14px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                    <span style={{ fontSize: '18px' }}>☕</span>
                    <strong style={{ fontSize: '14px', color: '#fbbf24' }}>2. طابعة البار والمطبخ</strong>
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted, #94a3b8)', marginBottom: '8px' }}>
                    بونات المشروبات والوجبات عند الإرسال للبار.
                  </div>
                  <div style={{ marginBottom: '8px' }}>
                    <select
                      style={{ width: '100%', padding: '7px 9px', borderRadius: '7px', background: 'var(--bg-input, #0f172a)', border: '1px solid var(--border-color, #334155)', color: '#fff', fontSize: '12px' }}
                      value={wizardPrinters.bar_printer_name}
                      onChange={(e) => setWizardPrinters(prev => ({ ...prev, bar_printer_name: e.target.value }))}
                    >
                      <option value="">-- نفس طابعة الكاشير الافتراضية --</option>
                      {availablePrinters.map((p, idx) => (
                        <option key={idx} value={p.name}>
                          {p.name} {p.isDefault ? '(الافتراضية)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div style={{ fontSize: '11px', color: '#fde68a', marginBottom: '10px' }}>
                    الطابعة المحددة: <strong>{wizardPrinters.bar_printer_name || 'نفس طابعة الكاشير'}</strong>
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-outline-warning btn-sm"
                  style={{ width: '100%', borderRadius: '7px', padding: '6px', fontSize: '12px', fontWeight: '600', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', color: '#fbbf24', borderColor: '#fbbf24' }}
                  onClick={() => testPrintStation('طابعة البار والمطبخ', wizardPrinters.bar_printer_name)}
                >
                  <span>🖨️</span> تجربة طباعة البار
                </button>
              </div>

              {/* 3. Shisha Printer */}
              <div style={{ background: 'rgba(168, 85, 247, 0.06)', borderRadius: '12px', border: '1px solid rgba(168, 85, 247, 0.25)', padding: '14px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                    <span style={{ fontSize: '18px' }}>💨</span>
                    <strong style={{ fontSize: '14px', color: '#c084fc' }}>3. طابعة قسم الشيشة</strong>
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted, #94a3b8)', marginBottom: '8px' }}>
                    بونات طلبات الشيشة والمعسل الموجهة للركن.
                  </div>
                  <div style={{ marginBottom: '8px' }}>
                    <select
                      style={{ width: '100%', padding: '7px 9px', borderRadius: '7px', background: 'var(--bg-input, #0f172a)', border: '1px solid var(--border-color, #334155)', color: '#fff', fontSize: '12px' }}
                      value={wizardPrinters.shisha_printer_name}
                      onChange={(e) => setWizardPrinters(prev => ({ ...prev, shisha_printer_name: e.target.value }))}
                    >
                      <option value="">-- افتراضية الشيشة (اسمها: شيشة) --</option>
                      {availablePrinters.map((p, idx) => (
                        <option key={idx} value={p.name}>
                          {p.name} {p.isDefault ? '(الافتراضية)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div style={{ fontSize: '11px', color: '#e9d5ff', marginBottom: '10px' }}>
                    الطابعة المحددة: <strong>{wizardPrinters.shisha_printer_name || 'افتراضية الشيشة'}</strong>
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-outline-info btn-sm"
                  style={{ width: '100%', borderRadius: '7px', padding: '6px', fontSize: '12px', fontWeight: '600', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', color: '#c084fc', borderColor: '#c084fc' }}
                  onClick={() => testPrintStation('طابعة قسم الشيشة', wizardPrinters.shisha_printer_name)}
                >
                  <span>🖨️</span> تجربة طباعة الشيشة
                </button>
              </div>
            </div>

            {/* Silent Printing Feature Banner */}
            <div style={{ background: 'rgba(16, 185, 129, 0.08)', borderRadius: '10px', border: '1px solid rgba(16, 185, 129, 0.25)', padding: '10px 14px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <input
                type="checkbox"
                id="wizard_silent_print"
                style={{ width: '18px', height: '18px', accentColor: '#10b981', cursor: 'pointer' }}
                checked={wizardPrinters.silent_print === '1'}
                onChange={(e) => setWizardPrinters(prev => ({ ...prev, silent_print: e.target.checked ? '1' : '0' }))}
              />
              <label htmlFor="wizard_silent_print" style={{ margin: 0, cursor: 'pointer', fontSize: '13px', color: '#34d399', fontWeight: '600', lineHeight: '1.4' }}>
                ⚡ تفعيل الطباعة المباشرة الصامتة (Silent Print) فائقة السرعة
                <span style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted, #94a3b8)', fontWeight: 'normal', marginTop: '2px' }}>
                  تطبع الفواتير والبونات فوراً دون إظهار نافذة إعدادات الويندوز في كل طلب لتسريع وتيرة العمل.
                </span>
              </label>
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ padding: '10px 24px', borderRadius: '10px', fontWeight: '700', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 4px 14px rgba(59, 130, 246, 0.4)' }}
                  onClick={handleSavePrinterWizard}
                >
                  <span>💾</span> حفظ الإعدادات ومتابعة العمل
                </button>
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  style={{ borderRadius: '8px', padding: '8px 16px', fontSize: '12px' }}
                  onClick={() => {
                    sessionStorage.setItem('skip_printer_wizard', 'true');
                    setShowPrinterWizard(false);
                  }}
                >
                  تخطي الآن (سأضبطها لاحقاً)
                </button>
                <button
                  type="button"
                  className="btn btn-outline-secondary btn-sm"
                  style={{ borderRadius: '8px', padding: '8px 12px', fontSize: '11px', opacity: 0.8 }}
                  onClick={() => {
                    handleSavePrinterWizard();
                  }}
                  title="اعتماد الإعدادات الافتراضية وعدم إظهار هذه النافذة مجدداً"
                >
                  عدم الإظهار مجدداً
                </button>
              </div>
            </div>
          </div>
        </div>
  );
}
