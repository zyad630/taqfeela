const fs = require('fs');
const path = require('path');

const appFile = path.join(__dirname, '..', 'src', 'App.jsx');
let content = fs.readFileSync(appFile, 'utf8');

console.log('Read App.jsx, length:', content.length);

// 1. Add shiftSchedules state
if (!content.includes('shiftSchedules, setShiftSchedules')) {
  content = content.replace(
    /const \[shiftTypeInput, setShiftTypeInput\] = useState\([^)]+\);/,
    `const DEFAULT_SHIFT_SCHEDULES = [
    { id: 'shift_morning', name: 'الشيفت الصباحي', start: '06:00', end: '14:00', icon: '☀️' },
    { id: 'shift_evening', name: 'الشيفت المسائي', start: '14:00', end: '22:00', icon: '🌆' },
    { id: 'shift_night', name: 'الشيفت الليلي', start: '22:00', end: '06:00', icon: '🌙' }
  ];
  const [shiftSchedules, setShiftSchedules] = useState(DEFAULT_SHIFT_SCHEDULES);
  const [shiftTypeInput, setShiftTypeInput] = useState('الشيفت الصباحي (06:00 - 14:00)');`
  );
}

// 2. Add shift_schedules loader in refreshData
if (!content.includes('setts?.shift_schedules')) {
  content = content.replace(
    'setSettings(setts || {});',
    `setSettings(setts || {});
      if (setts?.shift_schedules) {
        try {
          const parsed = typeof setts.shift_schedules === 'string' ? JSON.parse(setts.shift_schedules) : setts.shift_schedules;
          if (Array.isArray(parsed) && parsed.length > 0) {
            setShiftSchedules(parsed);
          }
        } catch (e) {}
      }`
  );
}

// 3. Update clearCart to reset split states
content = content.replace(
  'setPaidAmount(\'\');',
  `setPaidAmount('');
    setSplitCash('');
    setSplitWallet('');
    setSplitCard('');`
);

// 4. Update handleCheckout for split payments
content = content.replace(
  'const isNotebook = orderType === \'notebook\';',
  `const isNotebook = orderType === \'notebook\';
    if (paymentMethod === 'split' && !isNotebook) {
      const sCash = Number(splitCash) || 0;
      const sWallet = Number(splitWallet) || 0;
      const sCard = Number(splitCard) || 0;
      const sum = Math.round((sCash + sWallet + sCard) * 100) / 100;
      if (Math.abs(sum - cartTotal) > 0.01) {
        showToast(\`⚠️ مجموع المبالغ المقسمة (\${sum} \${settings.currency || 'ج.م'}) لا يساوي إجمالي الفاتورة (\${cartTotal} \${settings.currency || 'ج.م'}). يرجى ضبط المبالغ.\`);
        return;
      }
    }`
);

// In payload of createOrder:
content = content.replace(
  'tax: 0,',
  `tax: 0,
      cashAmount: paymentMethod === 'split' ? (Number(splitCash) || 0) : (paymentMethod === 'cash' ? cartTotal : 0),
      walletAmount: paymentMethod === 'split' ? (Number(splitWallet) || 0) : (paymentMethod === 'wallet' ? cartTotal : 0),
      cardAmount: paymentMethod === 'split' ? (Number(splitCard) || 0) : (paymentMethod === 'card' ? cartTotal : 0),`
);

// 5. Update handleSaveSettings to include shift_schedules
content = content.replace(
  'await api.saveSettings(settings);',
  'await api.saveSettings({ ...settings, shift_schedules: JSON.stringify(shiftSchedules) });'
);

// 6. Update handleConfirmCloseShift for error handling & negative deficit input
const oldCloseShiftFn = `  async function handleConfirmCloseShift() {
    if (!shift) return;
    const actual = actualCashInput !== '' ? parseFloat(actualCashInput) : null;
    const res = await api.closeShift(shift.id, actual, closeNotesInput);
    setCloseSummary(res);
    setShift(null);
    setCloseShiftModal(false);
    try { if (api.notifyShiftState) api.notifyShiftState(false); } catch (_) {}
    clearCart();
    refreshData();
  }`;

const newCloseShiftFn = `  async function handleConfirmCloseShift() {
    if (!shift) return;
    try {
      let actual = null;
      if (actualCashInput !== '') {
        const val = parseFloat(actualCashInput);
        if (isNaN(val)) {
          showToast('⚠️ يرجى إدخال رقم صحيح لمبلغ الكاش');
          return;
        }
        if (val < 0) {
          // Negative entered as deficit
          actual = (shift.expected_cash || 0) + val;
        } else {
          actual = val;
        }
      }
      const res = await api.closeShift(shift.id, actual, closeNotesInput);
      setCloseSummary(res);
      setShift(null);
      setCloseShiftModal(false);
      try { if (api.notifyShiftState) api.notifyShiftState(false); } catch (_) {}
      clearCart();
      refreshData();
      showToast('🔒 تم تقفيل الشيفت وحفظ الحسابات بنجاح');
    } catch (err) {
      console.error(err);
      showToast(\`❌ فشل تقفيل الشيفت: \${err.message || 'خطأ غير معروف'}\`);
    }
  }`;

content = content.replace(oldCloseShiftFn, newCloseShiftFn);

// 7. Update Shift Opening Presets in UI to use dynamic shiftSchedules
const oldShiftPresets = content.match(/\{\/\* 3 Shifts Preset Selection[\s\S]*?<\/div>\s*<\/div>/);
if (oldShiftPresets) {
  const newShiftPresets = `{/* Shift Schedule Preset Selection */}
          <div className="shift-preset-selector">
            <label>اختر فترة ونوع الشيفت ({shiftSchedules.length} شيفتات):</label>
            <div className="shifts-preset-grid">
              {shiftSchedules.map((s) => {
                const title = \`\${s.name} (\${s.start} - \${s.end})\`;
                const isActive = shiftTypeInput.includes(s.name) || shiftTypeInput === title;
                return (
                  <button
                    key={s.id}
                    type="button"
                    className={\`shift-preset-btn \${isActive ? 'active' : ''}\`}
                    onClick={() => setShiftTypeInput(title)}
                  >
                    <span className="preset-icon">{s.icon || '⏰'}</span>
                    <strong>{s.name}</strong>
                    <small>{s.start} - {s.end}</small>
                  </button>
                );
              })}
            </div>
          </div>`;
  content = content.replace(oldShiftPresets[0], newShiftPresets);
}

// 8. Update POS Payment Method buttons to include Split Payment
const oldPaymentGrid = content.match(/\{\/\* Payment Method \*\/\}[\s\S]*?<\/div>\s*<\/div>/);
if (oldPaymentGrid && oldPaymentGrid[0].includes('payment-grid')) {
  const newPaymentGrid = `{/* Payment Method */}
                  <div className="payment-grid">
                    <button
                      className={\`pay-btn \${paymentMethod === 'cash' ? 'active' : ''}\`}
                      onClick={() => setPaymentMethod('cash')}
                    >
                      💵 كاش
                    </button>
                    <button
                      className={\`pay-btn \${paymentMethod === 'wallet' ? 'active' : ''}\`}
                      onClick={() => setPaymentMethod('wallet')}
                    >
                      📱 محفظة
                    </button>
                    <button
                      className={\`pay-btn \${paymentMethod === 'card' ? 'active' : ''}\`}
                      onClick={() => setPaymentMethod('card')}
                    >
                      💳 فيزا
                    </button>
                    <button
                      className={\`pay-btn \${paymentMethod === 'split' ? 'active' : ''}\`}
                      onClick={() => {
                        setPaymentMethod('split');
                        if (!splitCash && !splitWallet) {
                          const half = Math.round((cartTotal / 2) * 100) / 100;
                          setSplitCash(half);
                          setSplitWallet(Math.round((cartTotal - half) * 100) / 100);
                        }
                      }}
                    >
                      🔀 مجزأ
                    </button>
                  </div>

                  {/* Split Payment UI */}
                  {paymentMethod === 'split' && (
                    <div className="split-payment-box">
                      <div className="split-row">
                        <label>💵 كاش (نقدي):</label>
                        <input
                          type="number"
                          placeholder="0"
                          value={splitCash}
                          onChange={(e) => setSplitCash(e.target.value)}
                        />
                      </div>
                      <div className="split-row">
                        <label>📱 محفظة (فودافون/إنستاباي):</label>
                        <input
                          type="number"
                          placeholder="0"
                          value={splitWallet}
                          onChange={(e) => setSplitWallet(e.target.value)}
                        />
                      </div>
                      <div className="split-row">
                        <label>💳 فيزا (اختياري):</label>
                        <input
                          type="number"
                          placeholder="0"
                          value={splitCard}
                          onChange={(e) => setSplitCard(e.target.value)}
                        />
                      </div>
                      {(() => {
                        const sum = Math.round(((Number(splitCash) || 0) + (Number(splitWallet) || 0) + (Number(splitCard) || 0)) * 100) / 100;
                        const diff = Math.round((cartTotal - sum) * 100) / 100;
                        const isMatch = Math.abs(diff) < 0.01;
                        return (
                          <div>
                            <div className={\`split-diff-badge \${isMatch ? 'text-green' : 'text-danger'}\`} style={{ background: isMatch ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)' }}>
                              {isMatch ? \`✅ المجموع مطابق: \${sum} \${settings.currency || 'ج.م'}\` : (
                                diff > 0 
                                  ? \`⚠️ متبقي للتوزيع: \${diff} \${settings.currency || 'ج.م'}\` 
                                  : \`⚠️ زيادة عن الفاتورة: \${Math.abs(diff)} \${settings.currency || 'ج.م'}\`
                              )}
                            </div>
                            <div className="split-quick-actions">
                              <button
                                type="button"
                                className="split-quick-btn"
                                onClick={() => {
                                  const c = Number(splitCash) || 0;
                                  const card = Number(splitCard) || 0;
                                  setSplitWallet(Math.max(0, Math.round((cartTotal - c - card) * 100) / 100));
                                }}
                              >
                                وضع الباقي بالمحفظة
                              </button>
                              <button
                                type="button"
                                className="split-quick-btn"
                                onClick={() => {
                                  const w = Number(splitWallet) || 0;
                                  const card = Number(splitCard) || 0;
                                  setSplitCash(Math.max(0, Math.round((cartTotal - w - card) * 100) / 100));
                                }}
                              >
                                وضع الباقي كاش
                              </button>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  )}`;
  content = content.replace(oldPaymentGrid[0], newPaymentGrid);
}

// 9. Add Shift Schedules Configuration Card in Settings Tab
const shiftScheduleSettingsCard = `
            {/* Shift Schedules Configuration Card (Admin Only) */}
            {currentUser?.role === 'admin' && (
              <div className="settings-card" style={{ marginTop: '24px', border: '1px solid rgba(245, 158, 11, 0.4)' }}>
                <div className="card-header-styled">
                  <span className="header-icon">⏰</span>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '17px', color: '#f59e0b' }}>إدارة مواعيد وفترات الشيفتات (ساعات العمل)</h3>
                    <small style={{ color: 'var(--text-muted)' }}>تحديد أوقات بداية ونهاية كل شيفت، وإضافة فترات عمل لتنعكس تلقائياً في النظام</small>
                  </div>
                </div>

                <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {shiftSchedules.map((sch, idx) => (
                    <div key={sch.id || idx} style={{ display: 'flex', gap: '10px', alignItems: 'center', background: 'var(--bg-card)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)', flexWrap: 'wrap' }}>
                      <input
                        type="text"
                        style={{ width: '45px', textAlign: 'center', fontSize: '16px' }}
                        value={sch.icon || '⏰'}
                        title="رمز / أيقونة الشيفت"
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
                        placeholder="اسم الشيفت (مثلاً: الشيفت الصباحي)"
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

                  <div style={{ display: 'flex', gap: '10px', marginTop: '6px', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => {
                        const newId = \`shift_\${Date.now()}\`;
                        setShiftSchedules([...shiftSchedules, { id: newId, name: \`شيفت \${shiftSchedules.length + 1}\`, start: '08:00', end: '16:00', icon: '⏱️' }]);
                      }}
                    >
                      ➕ إضافة فترة شيفت جديدة
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => setShiftSchedules(DEFAULT_SHIFT_SCHEDULES)}
                    >
                      🔄 استعادة الشيفتات الافتراضية
                    </button>
                  </div>
                </div>
              </div>
            )}
`;

if (!content.includes('إدارة مواعيد وفترات الشيفتات')) {
  content = content.replace(
    '{/* Offline Commercial License Card */}',
    shiftScheduleSettingsCard + '\n            {/* Offline Commercial License Card */}'
  );
}

// 10. Update Close Shift modal input and diff alert
const oldCloseShiftInputGroup = content.match(/<div className="form-group">\s*<label>[^<]*ط§ظ„ظƒط§ط´ ط§ظ„ظپط¹ظ„ظٹ[^<]*<\/label>[\s\S]*?<\/div>\s*<\/div>/);
if (oldCloseShiftInputGroup) {
  const newCloseShiftInputGroup = `<div className="form-group">
              <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>الكاش الفعلي الموجود في الدرج الآن:</span>
                <small style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
                  (أدخل عد الدرج الفعلي، أو اكتب قيمة العجز بالسالب مثل 50-)
                </small>
              </label>
              <input
                type="number"
                placeholder={shift.expected_cash || 0}
                value={actualCashInput}
                onChange={(e) => setActualCashInput(e.target.value)}
                autoFocus
              />
              {actualCashInput !== '' && (() => {
                const rawVal = parseFloat(actualCashInput) || 0;
                const diff = rawVal < 0 ? rawVal : (rawVal - (shift.expected_cash || 0));
                const isShortage = diff < -0.01;
                const isSurplus = diff > 0.01;
                return (
                  <div className={\`diff-alert \${isShortage ? 'text-danger' : (isSurplus ? 'text-green' : '')}\`} style={{ marginTop: '8px', padding: '8px 12px', borderRadius: '6px', background: isShortage ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)', fontWeight: 'bold' }}>
                    الفارق: {diff.toFixed(2)} {settings.currency || 'ج.م'}
                    {isShortage && \` ❌ (عجز / تقصير في الدرج بمقدار \${Math.abs(diff).toFixed(2)})\`}
                    {isSurplus && \` 🟢 (فائض / زيادة في الدرج بمقدار \${diff.toFixed(2)})\`}
                    {!isShortage && !isSurplus && ' ✅ (مطابق تماماً بدون عجز أو زيادة)'}
                  </div>
                );
              })()}
            </div>`;
  content = content.replace(oldCloseShiftInputGroup[0], newCloseShiftInputGroup);
}

// 11. Update Receipt Payment Method label
content = content.replace(
  `<span>{receiptOrder.paymentMethod === 'card' ? '💳 فيزا / ماستر' : receiptOrder.paymentMethod === 'wallet' ? '📱 محفظة فودافون كاش' : '💵 كاش نقدي'}</span>`,
  `<span>
    {receiptOrder.paymentMethod === 'card' || receiptOrder.payment_method === 'card' ? '💳 فيزا / ماستر' : 
     receiptOrder.paymentMethod === 'wallet' || receiptOrder.payment_method === 'wallet' ? '📱 محفظة إلكترونية' : 
     receiptOrder.paymentMethod === 'split' || receiptOrder.payment_method === 'split' ? \`🔀 مجزأ (كاش: \${receiptOrder.cashAmount || receiptOrder.cash_amount || 0} | محفظة: \${receiptOrder.walletAmount || receiptOrder.wallet_amount || 0}\${Number(receiptOrder.cardAmount || receiptOrder.card_amount) > 0 ? \` | فيزا: \${receiptOrder.cardAmount || receiptOrder.card_amount}\` : ''})\` : 
     receiptOrder.paymentMethod === 'notebook' || receiptOrder.payment_method === 'notebook' ? '📖 نوتة حسابات' : '💵 كاش نقدي'}
  </span>`
);

// 12. Update Orders Table payment badge
content = content.replace(
  `{ord.payment_method === 'wallet' && '📱 محفظة'}`,
  `{ord.payment_method === 'wallet' && '📱 محفظة'}
                                      {ord.payment_method === 'split' && (
                                        <span title={\`كاش: \${ord.cash_amount || 0} | محفظة: \${ord.wallet_amount || 0} | فيزا: \${ord.card_amount || 0}\`}>
                                          🔀 مجزأ (\${ord.cash_amount || 0}ك + \${ord.wallet_amount || 0}م)
                                        </span>
                                      )}`
);

fs.writeFileSync(appFile, content, 'utf8');
console.log('Successfully updated App.jsx, new length:', content.length);
