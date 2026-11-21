import React from 'react';
import { formatCairoDateTime } from '../../utils/dateTime.js';

export default function ExpensesPrintModal({
  currentUser,
  expensesPrintData,
  handlePrintExpenses,
  setExpensesPrintData,
  settings,
  shift
}) {
  return (
    <div className="modal-overlay" onClick={() => setExpensesPrintData(null)}>
          <div className="receipt-modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '420px' }}>
            <div className="receipt-preview" id="printable-expenses" dir="rtl">
              <div className="receipt-header">
                <h2>{settings.cafe_name || 'كافيه التكية'}</h2>
                <p>{settings.cafe_address || 'شارع الجمهورية'}</p>
                {settings.cafe_phone && <p>هاتف: {settings.cafe_phone}</p>}
                <div className="receipt-divider"></div>
                <div style={{ fontSize: '15px', fontWeight: '900', textAlign: 'center', background: '#000', color: '#fff', padding: '4px 8px', borderRadius: '4px', margin: '4px 0' }}>
                  {expensesPrintData.isSingle ? '💸 سند صرف نقدية (مصروف)' : '📋 بيان مصروفات الشيفت'}
                </div>
                <div className="receipt-meta">
                  <div>التاريخ: <strong>{formatCairoDateTime(Date.now())}</strong></div>
                  <div>الموظف / الكاشير: <strong>{currentUser?.name || shift?.cashier_name || 'كاشير'}</strong></div>
                  <div>الشيفت: <strong>{shift?.shift_type || 'الشيفت الحالي'}</strong></div>
                </div>
                <div className="receipt-divider"></div>
              </div>

              {expensesPrintData.isSingle ? (
                <div style={{ padding: '6px 0' }}>
                  <div style={{ fontSize: '14px', marginBottom: '8px' }}>
                    بند / صنف المصروف: <strong>{expensesPrintData.item?.category || expensesPrintData.item?.description || 'مصروف عام'}</strong>
                  </div>
                  <div style={{ fontSize: '20px', fontWeight: '900', border: '2px dashed #000', padding: '10px', textAlign: 'center', margin: '10px 0' }}>
                    المبلغ: {expensesPrintData.item?.amount} {settings.currency || 'ج.م'}
                  </div>
                  {expensesPrintData.item?.notes && (
                    <div style={{ fontSize: '13px', margin: '6px 0', border: '1px solid #ccc', padding: '4px 6px' }}>
                      ملاحظات: {expensesPrintData.item.notes}
                    </div>
                  )}
                  <div style={{ fontSize: '12.5px', marginTop: '20px', display: 'flex', justifyContent: 'space-between' }}>
                    <span>توقيع المستلم: ....................</span>
                    <span>توقيع الكاشير: ....................</span>
                  </div>
                </div>
              ) : (
                <div>
                  <table className="receipt-table">
                    <thead>
                      <tr>
                        <th style={{ width: '48%' }}>البند</th>
                        <th style={{ width: '26%', textAlign: 'center' }}>المبلغ</th>
                        <th style={{ width: '26%', textAlign: 'left' }}>الموظف</th>
                      </tr>
                    </thead>
                    <tbody>
                      {expensesPrintData.items?.map((exp, idx) => (
                        <tr key={idx}>
                          <td>
                            <strong>{exp.category || exp.description || 'مصروف'}</strong>
                            {exp.notes && <div style={{ fontSize: '11px', color: '#000' }}>{exp.notes}</div>}
                          </td>
                          <td style={{ textAlign: 'center', fontWeight: '900' }}>
                            {exp.amount} {settings.currency || 'ج.م'}
                          </td>
                          <td style={{ textAlign: 'left', fontSize: '11.5px' }}>
                            {exp.user_name || 'كاشير'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  <div className="receipt-divider"></div>

                  <div className="receipt-totals">
                    <div className="r-row r-grand">
                      <strong>إجمالي المصروفات:</strong>
                      <strong>{expensesPrintData.total} {settings.currency || 'ج.م'}</strong>
                    </div>
                    <div className="r-row">
                      <span>عدد بنود الصرف:</span>
                      <span>{expensesPrintData.items?.length || 0} حركة</span>
                    </div>
                  </div>

                  <div style={{ fontSize: '12px', marginTop: '18px', display: 'flex', justifyContent: 'space-between' }}>
                    <span>توقيع الكاشير: ................</span>
                    <span>اعتماد الإدارة: ................</span>
                  </div>
                </div>
              )}

              <div className="receipt-footer">
                <p>نظام تقفيلة لإدارة الكافيهات</p>
              </div>
            </div>

            <div className="modal-actions" style={{ marginTop: '16px' }}>
              <button className="btn btn-primary" onClick={handlePrintExpenses}>🖨️ طباعة</button>
              <button className="btn btn-secondary" onClick={() => setExpensesPrintData(null)}>إغلاق</button>
            </div>
          </div>
        </div>
  );
}
