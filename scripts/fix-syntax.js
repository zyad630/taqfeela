const fs = require('fs');
const path = require('path');
const p = path.join(__dirname, '..', 'src', 'App.jsx');
let s = fs.readFileSync(p, 'utf8');

const targetStr = `                    </div>
                  )}
                      <button className="btn btn-sm btn-outline-light">`;

const replacementStr = `                    </div>
                  )}

                  {/* Cash Change Calculator */}
                  {paymentMethod === 'cash' && (
                    <div className="change-calculator">
                      <div className="calc-row">
                        <span>المبلغ المدفوع من العميل:</span>
                        <input
                          type="number"
                          placeholder={cartTotal}
                          value={paidAmount}
                          onChange={(e) => setPaidAmount(e.target.value)}
                        />
                      </div>
                      {paidAmount && Number(paidAmount) >= cartTotal && (
                        <div className="calc-row change-highlight">
                          <span>الباقي للعميل:</span>
                          <strong>{changeDue} {settings.currency || 'ج.م'}</strong>
                        </div>
                      )}
                    </div>
                  )}

                  <button className="btn btn-success btn-checkout" onClick={handleCheckout}>
                    ✅ إتمام الطلب وحفظ الفاتورة ({cartTotal} {settings.currency || 'ج.م'})
                  </button>
                </div>
              )}
            </aside>
          </div>
        )}

        {/* ================= TABLES SCREEN ================= */}
        {activeTab === 'tables' && (
          <div className="tables-view">
            <div className="view-header flex-between">
              <div>
                <h2>🪑 إدارة الصالات وخريطة الطاولات</h2>
                <p>متابعة الطاولات المشغولة والمتاحة وتسجيل الطلبات المباشرة لكل طاولة</p>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  className={\`tab-filter-btn \${activeHallFilter === 'all' ? 'active' : ''}\`}
                  onClick={() => setActiveHallFilter('all')}
                >
                  الكل ({tables.length})
                </button>
                <button
                  className={\`tab-filter-btn \${activeHallFilter === 'indoor' ? 'active' : ''}\`}
                  onClick={() => setActiveHallFilter('indoor')}
                >
                  الصالة الداخلية ({tables.filter((t) => t.hall === 'indoor').length})
                </button>
                <button
                  className={\`tab-filter-btn \${activeHallFilter === 'outdoor' ? 'active' : ''}\`}
                  onClick={() => setActiveHallFilter('outdoor')}
                >
                  الحديقة الخارجية ({tables.filter((t) => t.hall === 'outdoor').length})
                </button>
              </div>
            </div>

            <div className="tables-grid">
              {tables
                .filter((t) => activeHallFilter === 'all' || t.hall === activeHallFilter)
                .map((tbl) => {
                  const hasPending = (tableCartsMap[tbl.id]?.cart?.length || 0) > 0;
                  const isOccupied = tbl.status === 'occupied';
                  return (
                    <div
                      key={tbl.id}
                      className={\`table-card \${isOccupied ? 'table-occupied' : 'table-available'} \${hasPending ? 'table-has-cart' : ''}\`}
                      onClick={() => handleSelectTable(tbl)}
                    >
                      <div className="table-card-header">
                        <span className="table-num">{tbl.number}</span>
                        <span className={\`table-status-pill \${isOccupied ? 'pill-occupied' : 'pill-available'}\`}>
                          {isOccupied ? 'مشغولة' : 'متاحة'}
                        </span>
                      </div>
                      <h4 className="table-title">{tbl.name}</h4>
                      <div className="table-details">
                        <span>👥 سعة: {tbl.capacity} أفراد</span>
                        <span>{tbl.hall === 'indoor' ? '🏢 داخلية' : '🌳 خارجية'}</span>
                      </div>
                      {hasPending && (
                        <div className="pending-badge">
                          🛒 طلب معلق ({tableCartsMap[tbl.id].cart.reduce((sum, it) => sum + it.qty, 0)} صنف)
                        </div>
                      )}
                      <button className="btn btn-sm btn-outline-light">`;

if (s.includes(targetStr)) {
  s = s.replace(targetStr, replacementStr);
  fs.writeFileSync(p, s, 'utf8');
  console.log('Fixed POS and Tables Screen syntax successfully!');
} else {
  console.error('Target string not found for syntax fix!');
}
