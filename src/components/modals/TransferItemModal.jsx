import React from 'react';
import { isSameHall } from '../../utils/hall.js';

export default function TransferItemModal({
  handleConfirmTransferItem,
  sections,
  setTransferItemAdminPassword,
  setTransferItemModal,
  setTransferItemQty,
  setTransferItemTargetId,
  tableCartsMap,
  tables,
  transferItemAdminPassword,
  transferItemError,
  transferItemModal,
  transferItemQty,
  transferItemTargetId
}) {
  return (
    <div className="modal-overlay" onClick={() => setTransferItemModal(null)}>
          <div className="modal-card" style={{ maxWidth: '440px', width: '92%' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
              <span style={{ fontSize: '24px' }}>🔀</span>
              <div>
                <h3 style={{ margin: 0, fontSize: '17px' }}>نقل صنف إلى طاولة أخرى</h3>
                <p style={{ margin: '2px 0 0 0', fontSize: '13px', color: 'var(--text-muted)' }}>
                  الصنف: <strong>{transferItemModal.item.name}</strong> (من طاولة: {transferItemModal.sourceTable.name})
                </p>
              </div>
            </div>

            {transferItemError && (
              <div style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid #ef4444', color: '#fca5a5', padding: '10px', borderRadius: '8px', fontSize: '13px', marginBottom: '14px' }}>
                {transferItemError}
              </div>
            )}

            {/* Quantity Selector if item.qty > 1 */}
            {transferItemModal.item.qty > 1 && (
              <div className="form-group" style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', marginBottom: '6px', fontWeight: 'bold' }}>
                  الكمية المراد نقلها (المتاح: {transferItemModal.item.qty}):
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ width: '40px', height: '40px', fontSize: '18px' }}
                    onClick={() => setTransferItemQty(prev => Math.max(1, prev - 1))}
                  >
                    -
                  </button>
                  <input
                    type="number"
                    min="1"
                    max={transferItemModal.item.qty}
                    value={transferItemQty}
                    onChange={(e) => setTransferItemQty(Math.max(1, Math.min(transferItemModal.item.qty, parseInt(e.target.value) || 1)))}
                    style={{ flex: 1, textAlign: 'center', padding: '8px', fontSize: '16px', fontWeight: 'bold', borderRadius: '8px', background: 'var(--bg-card)', color: 'var(--text-main)', border: '1px solid var(--border-color)' }}
                  />
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ width: '40px', height: '40px', fontSize: '18px' }}
                    onClick={() => setTransferItemQty(prev => Math.min(transferItemModal.item.qty, prev + 1))}
                  >
                    +
                  </button>
                </div>
              </div>
            )}

            <div className="form-group" style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '6px', fontWeight: 'bold' }}>اختر الطاولة المطلوب نقل الصنف إليها:</label>
              <select
                value={transferItemTargetId}
                onChange={(e) => setTransferItemTargetId(e.target.value)}
                style={{ width: '100%', padding: '10px 12px', fontSize: '14px', borderRadius: '8px', background: 'var(--bg-card)', color: 'var(--text-main)', border: '1px solid var(--border-color)' }}
                autoFocus
              >
                <option value="">-- اضغط لاختيار الطاولة المستهدفة --</option>
                {sections.map((sec) => {
                  const secTables = tables.filter((t) => isSameHall(t.hall, sec.name) && t.id !== transferItemModal.sourceTable.id);
                  if (secTables.length === 0) return null;
                  return (
                    <optgroup key={sec.id} label={`📍 ${sec.name}`}>
                      {secTables.map((tbl) => {
                        const hasOtherCart = (tableCartsMap[tbl.id]?.cart?.length || 0) > 0;
                        return (
                          <option key={tbl.id} value={tbl.id}>
                            {hasOtherCart ? '🔴 ' : '🟢 '}{tbl.name} {hasOtherCart ? '(مشغولة - سيُضاف الصنف لطلبها)' : '(شاغرة ومتاحة)'}
                          </option>
                        );
                      })}
                    </optgroup>
                  );
                })}
                {tables.filter((t) => !sections.some((s) => isSameHall(s.name, t.hall)) && t.id !== transferItemModal.sourceTable.id).length > 0 && (
                  <optgroup label="طاولات أخرى">
                    {tables.filter((t) => !sections.some((s) => isSameHall(s.name, t.hall)) && t.id !== transferItemModal.sourceTable.id).map((tbl) => {
                      const hasOtherCart = (tableCartsMap[tbl.id]?.cart?.length || 0) > 0;
                      return (
                        <option key={tbl.id} value={tbl.id}>
                          {hasOtherCart ? '🔴 ' : '🟢 '}{tbl.name} {hasOtherCart ? '(مشغولة - سيُضاف الصنف لطلبها)' : '(شاغرة ومتاحة)'}
                        </option>
                      );
                    })}
                  </optgroup>
                )}
              </select>
            </div>

            {/* Pre-Bill Printed Admin Password Warning & Input */}
            {tableCartsMap[transferItemModal.sourceTable.id]?.printedCheck && (
              <div style={{ background: 'rgba(245, 158, 11, 0.12)', border: '1.5px solid #f59e0b', padding: '12px', borderRadius: '8px', marginBottom: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#fbbf24', fontWeight: 'bold', fontSize: '13px', marginBottom: '6px' }}>
                  <span>⚠️</span>
                  <span>تم طباعة الفاتورة الأولية للعميل مسبقاً</span>
                </div>
                <p style={{ margin: '0 0 10px 0', fontSize: '12px', color: 'var(--text-muted)' }}>
                  بما أن الشيك طُبع مسبقاً للعميل، يتطلب نقل الصنف تأكيد كلمة سر الأدمن لمنع أي تلاعب في الحسابات:
                </p>
                <input
                  type="password"
                  placeholder="أدخل كلمة مرور الأدمن للتأكيد"
                  value={transferItemAdminPassword}
                  onChange={(e) => setTransferItemAdminPassword(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--text-main)', fontSize: '14px' }}
                />
              </div>
            )}

            <div style={{ background: 'rgba(59, 130, 246, 0.08)', padding: '10px 12px', borderRadius: '8px', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '16px' }}>
              ℹ️ سيتم خصم الصنف من طاولة <strong>{transferItemModal.sourceTable.name}</strong> وإضافته فوراً للطاولة المختارة مع بقائه مسجلاً كصنف مُرسل للبار.
            </div>

            <div className="modal-actions" style={{ display: 'flex', gap: '10px' }}>
              <button
                type="button"
                className="btn btn-primary"
                style={{ flex: 1, fontWeight: 'bold' }}
                onClick={handleConfirmTransferItem}
                disabled={!transferItemTargetId}
              >
                ✅ تأكيد نقل الصنف
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setTransferItemModal(null)}
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
  );
}
