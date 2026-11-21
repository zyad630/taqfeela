import React from 'react';
import { fmtMoney, lineTotal } from '../../utils/money.js';
import { formatCairoDateTime } from '../../utils/dateTime.js';
import { formatTableDisplay } from '../../utils/hall.js';

export default function PreBillCheckPrint({
  preBillCheckData,
  settings,
  tables
}) {
  return (
    <div
      id="printable-prebill-check"
      className="receipt-preview printable-prebill-check"
      style={{ position: 'fixed', top: '-99999px', left: '-99999px', zIndex: -1, pointerEvents: 'none', width: '80mm', fontFamily: 'monospace', fontSize: '13px', color: '#000', background: '#fff', padding: '8px' }}
    >
          <div style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '15px', marginBottom: '4px' }}>{settings.cafe_name || 'تقفيلة'}</div>
          <div style={{ textAlign: 'center', borderBottom: '1px dashed #000', paddingBottom: '4px', marginBottom: '4px' }}>🧾 شيك حساب العميل</div>
          {preBillCheckData.orderType === 'dine_in' && (
            <div><strong>{formatTableDisplay(preBillCheckData, tables)}</strong></div>
          )}
          <div>التاريخ: {formatCairoDateTime(preBillCheckData.createdAt || Date.now())}</div>
          {preBillCheckData.orderType === 'dine_in' && (
            <div>نوع الطلب: {(() => {
              const h = (preBillCheckData.hall || '').trim();
              if (!h || h === 'indoor') return 'صالة داخلية';
              if (h === 'outdoor') return 'صالة خارجية';
              if (h.includes('صالة') || h.includes('صاله')) return h;
              return `صالة داخلية - ${h}`;
            })()}</div>
          )}
          <div>الكاشير: {preBillCheckData.cashierName}</div>
          {preBillCheckData.customerName && <div>العميل: {preBillCheckData.customerName}</div>}
          <div style={{ borderTop: '1px dashed #000', margin: '6px 0' }}></div>
          {(preBillCheckData.items || []).map((it, idx) => (
            <div key={idx} style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>{it.qty}x {it.name}</span>
              <span>{fmtMoney(lineTotal(it.price, it.qty))}</span>
            </div>
          ))}
          <div style={{ borderTop: '1px dashed #000', margin: '6px 0' }}></div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>المجموع:</span>
            <span>{fmtMoney(preBillCheckData.subtotal)} {settings.currency || 'ج.م'}</span>
          </div>
          {preBillCheckData.discount > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#c00' }}>
              <span>خصم:</span>
              <span>-{fmtMoney(preBillCheckData.discount)} {settings.currency || 'ج.م'}</span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '15px' }}>
            <span>الإجمالي:</span>
            <strong>{fmtMoney(preBillCheckData.total)} {settings.currency || 'ج.م'}</strong>
          </div>
          <div style={{ textAlign: 'center', borderTop: '1px dashed #000', paddingTop: '4px', fontSize: '11px' }}>شكراً لزيارتكم ونتمنى لكم يوماً سعيداً ☕</div>
        </div>
  );
}
