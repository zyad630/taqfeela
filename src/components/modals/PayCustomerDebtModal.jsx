import React from 'react';

export default function PayCustomerDebtModal({
  handleConfirmPayCustomerDebts,
  payCustomerAmountInput,
  payCustomerModalData,
  payCustomerNotesInput,
  setPayCustomerAmountInput,
  setPayCustomerModalData,
  setPayCustomerNotesInput,
  settings
}) {
  return (
    <div className="modal-overlay" onClick={() => setPayCustomerModalData(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h3>💵 سداد حساب العميل: {payCustomerModalData.customer_name}</h3>
            <div className="debt-summary-pill">
              <div><span>إجمالي المبالغ:</span> <strong>{(Number(payCustomerModalData.total_amount) || 0).toFixed(2)} {settings.currency || 'ج.م'}</strong></div>
              <div><span>المدفوع سابقاً:</span> <strong className="text-green">{(Number(payCustomerModalData.total_paid) || 0).toFixed(2)} {settings.currency || 'ج.م'}</strong></div>
              <div><span>المتبقي المطلوب:</span> <strong className="text-danger">{(Number(payCustomerModalData.total_remaining) || 0).toFixed(2)} {settings.currency || 'ج.م'}</strong></div>
            </div>

            <form onSubmit={handleConfirmPayCustomerDebts}>
              <div className="form-group">
                <label>المبلغ المدفوع الآن ({settings.currency || 'ج.م'}):</label>
                <input
                  type="number"
                  step="0.5"
                  required
                  min="0.5"
                  max={Number(payCustomerModalData.total_remaining) || 99999}
                  placeholder={`أقصى مبلغ: ${Number(payCustomerModalData.total_remaining) || 0}`}
                  value={payCustomerAmountInput}
                  onChange={(e) => setPayCustomerAmountInput(e.target.value)}
                  autoFocus
                />
              </div>

              {payCustomerAmountInput !== '' && (
                <div className="remaining-preview">
                  <span>المتبقي بعد هذا السداد: </span>
                  <strong>{Math.max(0, (Number(payCustomerModalData.total_remaining) || 0) - Number(payCustomerAmountInput)).toFixed(2)} {settings.currency || 'ج.م'}</strong>
                </div>
              )}

              <div className="form-group">
                <label>ملاحظات السداد (اختياري):</label>
                <input
                  type="text"
                  placeholder="مثال: سداد نوتة نقدي"
                  value={payCustomerNotesInput}
                  onChange={(e) => setPayCustomerNotesInput(e.target.value)}
                />
              </div>

              <div className="modal-actions">
                <button type="submit" className="btn btn-primary">
                  ✅ تأكيد السداد وإضافته ليومية وكاش اليوم
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => setPayCustomerModalData(null)}>
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
  );
}
