import React from 'react';

export default function CustomerDetailsModal({
  setPayCustomerAmountInput,
  setPayCustomerModalData,
  setPayCustomerNotesInput,
  setViewCustomerDetails,
  settings,
  viewCustomerDetails
}) {
  return (
    <div className="modal-overlay" onClick={() => setViewCustomerDetails(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '900px', maxHeight: '80vh', overflowY: 'auto' }}>
            <h3>👤 تفاصيل العميل: {viewCustomerDetails.customer_name}</h3>
            <div className="debt-summary-pill">
              <div><span>رقم الهاتف:</span> <strong>{viewCustomerDetails.customer_phone || 'غير مسجل'}</strong></div>
              <div><span>عدد الفواتير:</span> <strong>{viewCustomerDetails.debt_count}</strong></div>
              <div><span>إجمالي المبالغ:</span> <strong>{viewCustomerDetails.total_amount.toFixed(2)} {settings.currency || 'ج.م'}</strong></div>
              <div><span>المدفوع:</span> <strong className="text-green">{viewCustomerDetails.total_paid.toFixed(2)} {settings.currency || 'ج.م'}</strong></div>
              <div><span>المتبقي:</span> <strong className={viewCustomerDetails.total_remaining > 0 ? 'text-danger' : 'text-green'}>{viewCustomerDetails.total_remaining.toFixed(2)} {settings.currency || 'ج.م'}</strong></div>
            </div>

            <h4 style={{ marginTop: '20px' }}>📋 سجل الفواتير</h4>
            <table className="custom-table">
              <thead>
                <tr>
                  <th>رقم الفاتورة</th>
                  <th>التاريخ</th>
                  <th>المبلغ</th>
                  <th>المدفوع</th>
                  <th>المتبقي</th>
                  <th>الحالة</th>
                </tr>
              </thead>
              <tbody>
                {viewCustomerDetails.debts && viewCustomerDetails.debts.map((debt) => (
                  <tr key={debt.id}>
                    <td>{debt.invoice_no || '-'}</td>
                    <td>{new Date(debt.created_at).toLocaleString('ar-EG', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                    <td><strong>{debt.total_amount} {settings.currency || 'ج.م'}</strong></td>
                    <td className="text-green">{debt.paid_amount || 0} {settings.currency || 'ج.م'}</td>
                    <td>
                      <strong className={debt.remaining_amount > 0 ? 'text-danger' : 'text-green'}>
                        {debt.remaining_amount} {settings.currency || 'ج.م'}
                      </strong>
                    </td>
                    <td>
                      {debt.status === 'unpaid' && <span className="badge badge-danger">غير مسدد</span>}
                      {debt.status === 'partial' && <span className="badge badge-warning">مسدد جزئياً</span>}
                      {debt.status === 'paid' && <span className="badge badge-success">تم السداد</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <h4 style={{ marginTop: '20px' }}>💰 سجل المدفوعات</h4>
            <table className="custom-table">
              <thead>
                <tr>
                  <th>التاريخ</th>
                  <th>المبلغ</th>
                  <th>طريقة الدفع</th>
                  <th>الكاشير</th>
                  <th>ملاحظات</th>
                </tr>
              </thead>
              <tbody>
                {viewCustomerDetails.payments && viewCustomerDetails.payments.map((payment, idx) => (
                  <tr key={idx}>
                    <td>{new Date(payment.created_at).toLocaleString('ar-EG', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                    <td className="text-green"><strong>{payment.amount} {settings.currency || 'ج.م'}</strong></td>
                    <td>{payment.payment_method === 'cash' ? 'نقدي' : payment.payment_method === 'card' ? 'فيزا' : payment.payment_method === 'wallet' ? 'محفظة' : '-'}</td>
                    <td>{payment.cashier_name || '-'}</td>
                    <td>{payment.notes || '-'}</td>
                  </tr>
                ))}
                {(!viewCustomerDetails.payments || viewCustomerDetails.payments.length === 0) && (
                  <tr>
                    <td colSpan="5" className="text-center" style={{ padding: '20px' }}>
                      لا توجد مدفوعات مسجلة
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            <div className="modal-actions" style={{ marginTop: '20px' }}>
              {Number(viewCustomerDetails.total_remaining) > 0 && (
                <button
                  type="button"
                  className="btn btn-success"
                  style={{ background: 'linear-gradient(135deg, #10b981, #059669)', color: '#fff', border: 'none' }}
                  onClick={() => {
                    const cust = viewCustomerDetails;
                    setPayCustomerModalData(cust);
                    setPayCustomerAmountInput(cust.total_remaining);
                    setPayCustomerNotesInput('');
                  }}
                >
                  💵 سداد من حساب العميل ({Number(viewCustomerDetails.total_remaining).toFixed(2)} {settings.currency || 'ج.م'})
                </button>
              )}
              <button type="button" className="btn btn-secondary" onClick={() => setViewCustomerDetails(null)}>
                إغلاق
              </button>
            </div>
          </div>
        </div>
  );
}
