import React from 'react';

export default function PayDebtModal({
  handleConfirmPayDebt,
  pendingPayDebt,
  payAmountInput,
  payDebtData,
  payNotesInput,
  setPayAmountInput,
  setPayDebtData,
  setPayNotesInput,
  settings
}) {
  return (
    <div className="modal-overlay" onClick={() => setPayDebtData(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h3>💵 سداد دفعة من نوتة: {payDebtData.customer_name}</h3>
            <div className="debt-summary-pill">
              <div><span>المبلغ الإجمالي:</span> <strong>{payDebtData.total_amount} {settings.currency || 'ج.م'}</strong></div>
              <div><span>المدفوع سابقاً:</span> <strong className="text-green">{payDebtData.paid_amount || 0} {settings.currency || 'ج.م'}</strong></div>
              <div><span>المتبقي المطلوب:</span> <strong className="text-danger">{payDebtData.remaining_amount} {settings.currency || 'ج.م'}</strong></div>
            </div>

            <form onSubmit={handleConfirmPayDebt}>
              <div className="form-group">
                <label>المبلغ المدفوع الآن ({settings.currency || 'ج.م'}):</label>
                <input
                  type="number"
                  step="0.5"
                  required
                  min="0.5"
                  max={payDebtData.remaining_amount}
                  placeholder={`أقصى مبلغ: ${payDebtData.remaining_amount}`}
                  value={payAmountInput}
                  onChange={(e) => setPayAmountInput(e.target.value)}
                  autoFocus
                />
              </div>

              {payAmountInput !== '' && (
                <div className="remaining-preview">
                  <span>المتبقي بعد هذا السداد: </span>
                  <strong>{Math.max(0, payDebtData.remaining_amount - Number(payAmountInput))} {settings.currency || 'ج.م'}</strong>
                </div>
              )}

              <div className="form-group">
                <label>ملاحظات السداد (اختياري):</label>
                <input
                  type="text"
                  placeholder="مثال: دفع كاش مع فنجان قهوة"
                  value={payNotesInput}
                  onChange={(e) => setPayNotesInput(e.target.value)}
                />
              </div>

              <div className="modal-actions">
                <button type="submit" className="btn btn-primary" disabled={pendingPayDebt}>
                  {pendingPayDebt ? '⏳ جاري السداد...' : '✅ تأكيد السداد وإضافته ليومية اليوم'}
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => setPayDebtData(null)}>
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
  );
}
