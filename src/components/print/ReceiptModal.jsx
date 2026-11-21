import React from 'react';
import { fmtMoney, lineTotal } from '../../utils/money.js';
import { formatCairoDateTime } from '../../utils/dateTime.js';
import { formatTableDisplay } from '../../utils/hall.js';

export default function ReceiptModal({
  currentUser,
  printBarTicketFromReceipt,
  printReceipt,
  receiptOrder,
  setReceiptOrder,
  settings,
  tables,
  vendorDevFeatures
}) {
  const is58 = settings.receipt_paper_width === '58';
  return (
    <div className="modal-overlay" onClick={() => setReceiptOrder(null)}>
      <div className="receipt-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="receipt-scroll">
          <div className={`receipt-preview ${is58 ? 'paper-58 receipt-paper-58' : ''}`} id="printable-receipt" dir="rtl">
              <div className="receipt-header">
                <h2 className="receipt-cafe-name">{settings.cafe_name || 'اسم الكافيه'}</h2>
                {(settings.cafe_address || settings.cafe_phone) && (
                  <p className="receipt-cafe-contact">
                    {settings.cafe_address ? settings.cafe_address : ''}
                    {settings.cafe_address && settings.cafe_phone ? ' - ' : ''}
                    {settings.cafe_phone ? `هاتف: ${settings.cafe_phone}` : ''}
                  </p>
                )}

                <div className="receipt-title-badge">
                  <span>{receiptOrder.isPreBillCheck ? (receiptOrder.orderType === 'dine_in' ? 'شيك حساب طاولة' : 'شيك حساب') : 'فاتورة مبيعات نقدية'}</span>
                </div>

                <div className="receipt-meta-grid">
                  {receiptOrder.orderType !== 'takeaway' && !receiptOrder.isPreBillCheck && (receiptOrder.invoiceNo || receiptOrder.invoice_no || receiptOrder.orderId) && (
                  <div className="receipt-meta-row">
                    <span>رقم الفاتورة:</span>
                    <strong>#{receiptOrder.invoiceNo || receiptOrder.invoice_no || receiptOrder.orderId}</strong>
                  </div>
                  )}
                  <div className="receipt-meta-row">
                    <span>التاريخ والوقت:</span>
                    <span>{formatCairoDateTime(receiptOrder.createdAt || receiptOrder.created_at || Date.now())}</span>
                  </div>
                  <div className="receipt-meta-row">
                    <span>الكاشير:</span>
                    <span>{receiptOrder.cashierName || receiptOrder.cashier_name || currentUser?.name || 'كاشير'}</span>
                  </div>
                  <div className="receipt-meta-row">
                    <span>نوع الطلب:</span>
                    <strong>{receiptOrder.orderType === 'dine_in' ? (
                      (() => {
                        const h = (receiptOrder.table_hall || receiptOrder.hall || '').trim();
                        if (!h || h === 'indoor') return 'صالة داخلية';
                        if (h === 'outdoor') return 'صالة خارجية';
                        if (h.includes('صالة') || h.includes('صاله')) return h;
                        return `صالة داخلية - ${h}`;
                      })()
                    ) : (receiptOrder.orderType === 'delivery' ? 'توصيل دليفري' : 'تيك أواي')}</strong>
                  </div>

                  {receiptOrder.orderType === 'dine_in' && (receiptOrder.tableName || receiptOrder.table_name || receiptOrder.tableNumber || receiptOrder.table_number) && (
                    <div className="receipt-table-box" style={{ justifyContent: 'center', textAlign: 'center' }}>
                      <span className="tbl-name" style={{ textAlign: 'center', width: '100%' }}>
                        {formatTableDisplay(receiptOrder, tables)}
                      </span>
                    </div>
                  )}

                  {(() => {
                    const cName = (receiptOrder.customerName || receiptOrder.customer_name || '').trim();
                    const empName = (currentUser?.name || '').trim();
                    const empUser = (currentUser?.username || '').trim();
                    const cashier = (receiptOrder.cashierName || receiptOrder.cashier_name || '').trim();
                    if (!cName) return null;
                    if (cName === empName || cName === empUser || cName === cashier || cName === 'كاشير' || cName === 'عميل' || cName.toLowerCase() === 'زياد') return null;
                    return (
                      <div className="receipt-meta-row">
                        <span>العميل:</span>
                        <strong>{cName}</strong>
                      </div>
                    );
                  })()}
                  {(receiptOrder.customerPhone || receiptOrder.customer_phone) && (
                    <div className="receipt-meta-row">
                      <span>الهاتف:</span>
                      <span>{receiptOrder.customerPhone || receiptOrder.customer_phone}</span>
                    </div>
                  )}
                  {(receiptOrder.customerAddress || receiptOrder.customer_address) && (
                    <div className="receipt-meta-row">
                      <span>العنوان:</span>
                      <span>{receiptOrder.customerAddress || receiptOrder.customer_address}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="receipt-divider"></div>

              <table className="receipt-table">
                <thead>
                  <tr>
                    <th className="th-item">الصنف</th>
                    <th className="th-qty">العدد</th>
                    <th className="th-price">السعر</th>
                    <th className="th-total">الإجمالي</th>
                  </tr>
                </thead>
                <tbody>
                  {receiptOrder.items?.map((it, idx) => (
                    <tr key={idx}>
                      <td className="td-item">
                        <div className="item-title">{it.product_name || it.name}</div>
                        {it.notes && (
                          <div className="item-note">
                            * {it.notes}
                          </div>
                        )}
                      </td>
                      <td className="td-qty">{it.qty}</td>
                      <td className="td-price">{fmtMoney(it.unit_price || it.price)}</td>
                      <td className="td-total">{fmtMoney(lineTotal(it.unit_price || it.price, it.qty))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="receipt-divider"></div>

              {receiptOrder.notes && (
                <div className="receipt-order-notes">
                  ملاحظات الفاتورة: {receiptOrder.notes}
                </div>
              )}

              <div className="receipt-totals">
                <div className="r-row">
                  <span>المجموع الفرعي:</span>
                  <span>{fmtMoney(receiptOrder.subtotal)} {settings.currency || 'ج.م'}</span>
                </div>
                {receiptOrder.discount > 0 && (
                  <div className="r-row r-discount">
                    <span>الخصم الممنوح:</span>
                    <span>-{receiptOrder.discount} {settings.currency || 'ج.م'}</span>
                  </div>
                )}
                <div className="r-row r-grand">
                  <span>الإجمالي المطلوب:</span>
                  <strong>{fmtMoney(receiptOrder.total)} {settings.currency || 'ج.م'}</strong>
                </div>
                {receiptOrder.paymentMethod !== 'pending_check' && (
                  <div className="r-row">
                    <span>طريقة الدفع:</span>
                    <span>
                      {receiptOrder.paymentMethod === 'wallet'
                        ? 'فودافون كاش (محفظة)'
                        : receiptOrder.paymentMethod === 'split'
                        ? 'دفع مقسم (نقدي + محفظة)'
                        : receiptOrder.paymentMethod === 'card'
                        ? 'بطاقة دفع / فيزا'
                        : 'نقدي (خزنة)'}
                    </span>
                  </div>
                )}
                {receiptOrder.changeDue > 0 && (
                  <div className="r-row r-change">
                    <span>المتبقي للعميل:</span>
                    <strong>{receiptOrder.changeDue} {settings.currency || 'ج.م'}</strong>
                  </div>
                )}
              </div>

              <div className="receipt-divider"></div>

              <div className="receipt-footer">
                <p className="receipt-thanks">
                  {settings.receipt_footer && !settings.receipt_footer.includes('☕')
                    ? settings.receipt_footer
                    : (settings.receipt_footer ? settings.receipt_footer.replace(/☕|💵|📱|❤️/g, '').trim() : 'شكراً لزيارتكم ونتشرف دائماً بخدمتكم')}
                </p>
                <div className="receipt-system-branding">
                  نظام تقفيلة لإدارة الكافيهات والمحلات
                </div>
              </div>
            </div>
          </div>

          <div className="receipt-actions modal-actions" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
            <button className="btn btn-primary" onClick={printReceipt}>
              {receiptOrder.isPreBillCheck ? '🖨️ طباعة الشيك الآن' : '🖨️ طباعة الفاتورة'}
            </button>
            {vendorDevFeatures.show_bar_ticket_in_receipt && (
              <button
                className="btn btn-warning"
                style={{ fontWeight: 'bold' }}
                onClick={() => printBarTicketFromReceipt(receiptOrder)}
              >
                ☕ طباعة بون البار
              </button>
            )}
            <button className="btn btn-secondary" onClick={() => setReceiptOrder(null)}>إغلاق</button>
          </div>
        </div>
      </div>
  );
}
