import React from 'react';

export default function NoteModal({
  cart,
  noteModal,
  noteModalText,
  selectedTable,
  setCart,
  setNoteModal,
  setNoteModalText,
  setTableCartsMap,
  orderType,
  activeTakeawayId,
  setTakeawayTabs
}) {
  return (
    (() => {
        // Always read live notes from cart so clear button is accurate
        const liveItem = cart.find(it => it.id === noteModal.item.id);
        const hasNote = !!(liveItem?.notes);
        const saveNote = (text) => {
          const trimmed = (text ?? noteModalText).trim();
          setCart(prev => prev.map(it => it.id === noteModal.item.id ? { ...it, notes: trimmed } : it));
          if (selectedTable) {
            setTableCartsMap(tm => ({
              ...tm,
              [selectedTable.id]: {
                ...(tm[selectedTable.id] || {}),
                cart: (tm[selectedTable.id]?.cart || []).map(it => it.id === noteModal.item.id ? { ...it, notes: trimmed } : it)
              }
            }));
          }
          if (orderType === 'takeaway' && activeTakeawayId && setTakeawayTabs) {
            setTakeawayTabs(prev => {
              const next = prev.map(t => t.id === activeTakeawayId
                ? { ...t, cart: (t.cart || []).map(it => it.id === noteModal.item.id ? { ...it, notes: trimmed } : it) }
                : t);
              try {
                localStorage.setItem('cafepos_takeaway_tabs', JSON.stringify(next));
              } catch (_) {}
              return next;
            });
          }
          setNoteModal(null);
        };
        return (
          <div
            className="modal-overlay"
            style={{ zIndex: 99997, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)' }}
            onClick={() => setNoteModal(null)}
          >
            <div
              className="modal-content"
              style={{ maxWidth: 420, width: '94%', borderRadius: 16, padding: '28px 24px', background: 'var(--bg-card, #1e293b)', border: '1px solid rgba(255,255,255,0.1)' }}
              onClick={e => e.stopPropagation()}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <span style={{ fontSize: 22 }}>📝</span>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 15 }}>ملاحظة للبار</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{noteModal.item?.name}</div>
                </div>
              </div>
              <textarea
                autoFocus
                dir="rtl"
                rows={4}
                placeholder="مثال: سكر خفيف، زيادة ثلج، بن فاتح، بدون شطة..."
                value={noteModalText}
                onChange={e => setNoteModalText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && e.ctrlKey) saveNote(); }}
                style={{
                  width: '100%', boxSizing: 'border-box', borderRadius: 10, padding: '12px 14px',
                  fontSize: 14, background: 'var(--bg-input, rgba(255,255,255,0.05))', color: 'var(--text-main, #f1f5f9)',
                  border: '1.5px solid var(--border-color, rgba(255,255,255,0.15))', resize: 'vertical',
                  outline: 'none', fontFamily: 'inherit', direction: 'rtl'
                }}
              />
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6, textAlign: 'right' }}>
                Ctrl+Enter للحفظ السريع
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ flex: 1, fontWeight: 700, borderRadius: 10 }}
                  onClick={() => saveNote()}
                >
                  ✅ حفظ الملاحظة
                </button>
                {hasNote && (
                  <button
                    type="button"
                    className="btn btn-outline-danger btn-sm"
                    style={{ fontWeight: 700, borderRadius: 10, padding: '0 14px' }}
                    onClick={() => saveNote('')}
                  >
                    🗑️ مسح
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  style={{ fontWeight: 600, borderRadius: 10, padding: '0 14px' }}
                  onClick={() => setNoteModal(null)}
                >
                  إلغاء
                </button>
              </div>
            </div>
          </div>
        );
      })()
  );
}
