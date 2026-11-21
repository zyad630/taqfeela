import React from 'react';
import { formatTableDisplay } from '../../utils/hall.js';

export default function BarTicketModal({
  barTicketOrder,
  printBarTicket,
  setBarTicketOrder,
  tables
}) {
  return (
    <div className="modal-overlay" onClick={() => setBarTicketOrder(null)}>
          <div className="receipt-modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '420px' }}>
            <div className="receipt-preview" id="printable-bar-ticket" style={{ border: '2px solid #000', padding: '2mm', background: '#fff', color: '#000' }}>
              <div className="receipt-header" style={{ textAlign: 'center', borderBottom: '2px solid #000', paddingBottom: '8px' }}>
                <h2 style={{ fontSize: '24px', fontWeight: '900', margin: '0 0 6px 0', color: '#000' }}>☕ بون تحضير - البار</h2>

                <div className="bar-table-badge" style={{
                  border: '2.5px solid #000',
                  borderRadius: '6px',
                  padding: '6px 8px',
                  margin: '6px 0',
                  background: '#fff',
                  color: '#000'
                }}>
                  <div style={{ fontSize: '23px', fontWeight: '900', color: '#000', lineHeight: '1.2' }}>
                    {barTicketOrder.orderType === 'dine_in'
                      ? (() => {
                          const td = formatTableDisplay(barTicketOrder, tables);
                          return td.startsWith('طاولة:') ? `🪑 ${td}` : `📍 ${td}`;
                        })()
                      : (barTicketOrder.orderType === 'takeaway' ? '🛍️ تيك أواي' : (barTicketOrder.orderType === 'delivery' ? '🛵 طلب دليفري' : 'طلب خارجي'))}
                  </div>
                  <div style={{ fontSize: '14px', fontWeight: '800', color: '#000', marginTop: '4px' }}>
                    {barTicketOrder.orderType === 'dine_in'
                      ? (formatTableDisplay(barTicketOrder, tables) === barTicketOrder.hall ? 'مكان مستقل' : `📍 الصالة: ${barTicketOrder.hall || 'الصالة الرئيسية'}`)
                      : 'طلب تسليم خارجي'}
                  </div>
                </div>

                {barTicketOrder.customerName && (
                  <div style={{ fontSize: '15px', fontWeight: 'bold', color: '#000', marginTop: '4px' }}>
                    العميل: <strong>{barTicketOrder.customerName}</strong>
                  </div>
                )}
                <div style={{ fontSize: '13px', fontWeight: '700', marginTop: '4px', color: '#000', display: 'flex', justifyContent: 'space-between', borderTop: '1px dashed #000', paddingTop: '4px' }}>
                  <span>بون #{barTicketOrder.id}</span>
                  <span>⏰ {barTicketOrder.time}</span>
                  <span>كاشير: {barTicketOrder.cashierName}</span>
                </div>
              </div>

              {/* Items List specifically formatted for barista preparation */}
              <div style={{ margin: '10px 0' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #000', textAlign: 'right' }}>
                      <th style={{ padding: '6px 2px', fontSize: '16px', fontWeight: '900', color: '#000' }}>الصنف المطلوب</th>
                      <th style={{ padding: '6px 2px', fontSize: '18px', fontWeight: '900', textAlign: 'center', width: '75px', color: '#000' }}>العدد</th>
                    </tr>
                  </thead>
                  <tbody>
                    {barTicketOrder.items?.map((it, idx) => (
                      <tr key={idx} style={{ borderBottom: '1.5px dashed #000' }}>
                        <td style={{ padding: '8px 2px', fontSize: '17px', fontWeight: '900', color: '#000' }}>
                          {it.product_name || it.name}
                          {it.notes && (
                            <div style={{ fontSize: '13.5px', color: '#000', fontWeight: '900', marginTop: '4px', border: '1.5px solid #000', padding: '2px 6px', borderRadius: '3px', background: '#fff' }}>
                              ⚠️ ملاحظة: {it.notes}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '8px 2px', fontSize: '24px', fontWeight: '900', textAlign: 'center', color: '#000' }}>
                          × {it.printQty || it.qty}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {barTicketOrder.orderNotes && (
                <div style={{ border: '1.5px solid #000', padding: '6px 8px', borderRadius: '4px', fontSize: '14px', fontWeight: '800', color: '#000', margin: '8px 0', background: '#fff' }}>
                  <strong>ملاحظات عامة:</strong> {barTicketOrder.orderNotes}
                </div>
              )}

              <div style={{ textAlign: 'center', borderTop: '2px solid #000', paddingTop: '6px', marginTop: '8px', fontSize: '13px', fontWeight: '900', color: '#000' }}>
                ** برجاء سرعة التحضير والتسليم ☕ **
              </div>
            </div>

            <div className="modal-actions" style={{ marginTop: '16px' }}>
              <button
                className="btn btn-warning"
                style={{ fontWeight: 'bold' }}
                onClick={() => printBarTicket(barTicketOrder)}
              >
                🖨️ إعادة طباعة بون البار
              </button>
              <button className="btn btn-secondary" onClick={() => setBarTicketOrder(null)}>إغلاق</button>
            </div>
          </div>
        </div>
  );
}
