import React from 'react';

export default function BarVoidTicketModal({
  barVoidTicket,
  printBarVoidTicket,
  setBarVoidTicket
}) {
  return (
    <div className="modal-overlay" onClick={() => setBarVoidTicket(null)}>
          <div className="receipt-modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '420px' }}>
            <div className="receipt-preview" id="printable-bar-void" style={{ border: '2px solid #000', padding: '2mm', background: '#fff', color: '#000' }}>
              <div style={{ textAlign: 'center', borderBottom: '2px solid #000', paddingBottom: '8px' }}>
                <h2 style={{ fontSize: '22px', fontWeight: '900', margin: '0 0 6px 0', color: '#000' }}>
                  ⚠️ إشعار إلغاء للبار (VOID)
                </h2>
                <div className="bar-table-badge" style={{
                  border: '2.5px solid #000',
                  borderRadius: '6px',
                  padding: '5px 8px',
                  margin: '6px 0',
                  background: '#fff',
                  color: '#000'
                }}>
                  <div style={{ fontSize: '22px', fontWeight: '900', color: '#000' }}>
                    🪑 {barVoidTicket.tableName}
                  </div>
                  {barVoidTicket.hall && (
                    <div style={{ fontSize: '14px', fontWeight: '800', color: '#000', marginTop: '2px' }}>
                      📍 {barVoidTicket.hall}
                    </div>
                  )}
                </div>
                <div style={{ fontSize: '13px', marginTop: '4px', color: '#000', fontWeight: '700' }}>
                  الوقت: {barVoidTicket.time} | الكاشير: {barVoidTicket.cashierName}
                </div>
              </div>

              <div style={{ margin: '12px 0', padding: '8px', border: '2px solid #000', borderRadius: '4px', background: '#fff' }}>
                <div style={{ fontSize: '15px', fontWeight: '900', color: '#000', marginBottom: '4px' }}>
                  نوع الإجراء: {barVoidTicket.actionType}
                </div>
                <div style={{ fontSize: '17px', fontWeight: '900', color: '#000' }}>
                  الصنف: {barVoidTicket.itemName}
                </div>
                <div style={{ fontSize: '22px', fontWeight: '900', color: '#000', marginTop: '4px' }}>
                  الكمية الملغاة: × {barVoidTicket.cancelledQty}
                </div>
                {barVoidTicket.newQty > 0 && (
                  <div style={{ fontSize: '14px', marginTop: '4px', color: '#000', fontWeight: 'bold' }}>
                    الكمية المتبقية المطلوبة: × {barVoidTicket.newQty}
                  </div>
                )}
              </div>

              <div style={{ textAlign: 'center', borderTop: '2px solid #000', paddingTop: '6px', fontSize: '13px', fontWeight: '900', color: '#000' }}>
                ** لا تقم بتحضير الكمية الملغاة أعلاه **
              </div>
            </div>

            <div className="modal-actions" style={{ marginTop: '16px' }}>
              <button
                type="button"
                className="btn btn-danger"
                style={{ fontWeight: 'bold' }}
                onClick={() => printBarVoidTicket(barVoidTicket)}
              >
                🖨️ طباعة إشعار الإلغاء
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setBarVoidTicket(null)}>إغلاق</button>
            </div>
          </div>
        </div>
  );
}
