import React from 'react';
import { isSameHall } from '../../utils/hall.js';

export default function TransferTableModal({
  handleTransferTableOrder,
  sections,
  setTransferModal,
  setTransferTargetId,
  tableCartsMap,
  tables,
  transferModal,
  transferTargetId,
  pendingTransferTable
}) {
  return (
    <div className="modal-overlay" onClick={() => setTransferModal(null)}>
          <div className="modal-card" style={{ maxWidth: '440px', width: '92%' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
              <span style={{ fontSize: '24px' }}>🔀</span>
              <div>
                <h3 style={{ margin: 0, fontSize: '17px' }}>نقل الطلب لطاولة أخرى</h3>
                <p style={{ margin: '2px 0 0 0', fontSize: '13px', color: 'var(--text-muted)' }}>
                  من: <strong>{transferModal.sourceTable.name}</strong> ({transferModal.sourceTable.hall || 'عام'})
                </p>
              </div>
            </div>

            <div className="form-group" style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '6px', fontWeight: 'bold' }}>اختر الطاولة المطلوب النقل إليها:</label>
              <select
                value={transferTargetId}
                onChange={(e) => setTransferTargetId(e.target.value)}
                style={{ width: '100%', padding: '10px 12px', fontSize: '14px', borderRadius: '8px', background: 'var(--bg-card)', color: 'var(--text-main)', border: '1px solid var(--border-color)' }}
                autoFocus
              >
                <option value="">-- اضغط لاختيار الطاولة المستهدفة --</option>
                {sections.map((sec) => {
                  const secTables = tables.filter((t) => isSameHall(t.hall, sec.name) && t.id !== transferModal.sourceTable.id);
                  if (secTables.length === 0) return null;
                  return (
                    <optgroup key={sec.id} label={`📍 ${sec.name}`}>
                      {secTables.map((tbl) => {
                        const hasOtherCart = (tableCartsMap[tbl.id]?.cart?.length || 0) > 0;
                        return (
                          <option key={tbl.id} value={tbl.id}>
                            {hasOtherCart ? '🔴 ' : '🟢 '}{tbl.name} {hasOtherCart ? '(مشغولة - سيتم دمج الطلبين معاً)' : '(شاغرة ومتاحة)'}
                          </option>
                        );
                      })}
                    </optgroup>
                  );
                })}
                {tables.filter((t) => !sections.some((s) => isSameHall(s.name, t.hall)) && t.id !== transferModal.sourceTable.id).length > 0 && (
                  <optgroup label="طاولات أخرى">
                    {tables.filter((t) => !sections.some((s) => isSameHall(s.name, t.hall)) && t.id !== transferModal.sourceTable.id).map((tbl) => {
                      const hasOtherCart = (tableCartsMap[tbl.id]?.cart?.length || 0) > 0;
                      return (
                        <option key={tbl.id} value={tbl.id}>
                          {hasOtherCart ? '🔴 ' : '🟢 '}{tbl.name} {hasOtherCart ? '(مشغولة - سيتم دمج الطلبين معاً)' : '(شاغرة ومتاحة)'}
                        </option>
                      );
                    })}
                  </optgroup>
                )}
              </select>
            </div>

            <div style={{ background: 'rgba(255,255,255,0.04)', padding: '12px', borderRadius: '8px', fontSize: '12.5px', color: 'var(--text-muted)', marginBottom: '18px' }}>
              💡 إذا كانت الطاولة المستهدفة تحتوي على طلب مسبق، سيتم <strong>دمج الأصناف تلقائياً</strong> وإضافة طلب هذه الطاولة إليها دون فقدان أي صنف.
            </div>

            <div className="modal-actions" style={{ display: 'flex', gap: '10px' }}>
              <button
                type="button"
                className="btn btn-primary"
                style={{ flex: 1, fontWeight: 'bold' }}
                onClick={handleTransferTableOrder}
                disabled={!transferTargetId || pendingTransferTable}
              >
                {pendingTransferTable ? '⏳ جاري نقل الطلب...' : '✅ تأكيد نقل الطلب'}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setTransferModal(null)}
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
  );
}
