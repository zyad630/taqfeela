import React from 'react';
import { fmtMoney, subMoney } from '../../utils/money.js';

export default function MenuTab({
  categories,
  filteredMenuProducts,
  handleDeleteProduct,
  menuActiveCategoryFilter,
  menuLowStockOnly,
  menuSearchQuery,
  products,
  setCategoryManagerModal,
  setMenuActiveCategoryFilter,
  setMenuLowStockOnly,
  setMenuSearchQuery,
  setProductForm,
  setProductModal,
  settings
}) {
  return (
    <div className="menu-view">
            <div className="view-header flex-between">
              <div>
                <h2>📦 إدارة قائمة الأصناف والمخزون</h2>
                <p>إضافة وتعديل الأسعار والكميات وتتبع الأرصدة</p>
              </div>
              <div className="header-btn-group" style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setCategoryManagerModal(true)}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  📂 إدارة وترتيب الأقسام
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => {
                    setProductForm({ id: null, name: '', price: '', cost: '', category_id: categories[0]?.id || 1, stock_qty: 100, low_stock_threshold: 10 });
                    setProductModal(true);
                  }}
                >
                  + إضافة صنف جديد
                </button>
              </div>
            </div>

            {/* Inventory Search, Category Chips & Low Stock Filter */}
            <div style={{
              background: 'var(--bg-card, #1e293b)',
              padding: '16px',
              borderRadius: '12px',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              marginBottom: '18px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px'
            }}>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: '260px', position: 'relative' }}>
                  <input
                    type="text"
                    className="search-input"
                    placeholder="🔍 ابحث في المخزون بالاسم أو السعر أو القسم..."
                    value={menuSearchQuery}
                    onChange={(e) => setMenuSearchQuery(e.target.value)}
                    style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', background: 'var(--bg-input, var(--bg-card))', border: '1px solid var(--border-color)', color: 'var(--text-main)' }}
                  />
                  {menuSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setMenuSearchQuery('')}
                      style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
                    >✕</button>
                  )}
                </div>

                <label className={`menu-low-stock-toggle ${menuLowStockOnly ? 'active' : ''}`}>
                  <input
                    type="checkbox"
                    checked={menuLowStockOnly}
                    onChange={(e) => setMenuLowStockOnly(e.target.checked)}
                  />
                  <span>
                    ⚠️ النواقص والمنخفض فقط
                  </span>
                </label>

                <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginLeft: 'auto' }}>
                  المعروض: <strong style={{ color: '#10b981' }}>{filteredMenuProducts.length}</strong> من أصل {products.length} صنف
                </div>
              </div>

              {/* Category Filter Chips */}
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--text-muted)' }}>القسم:</span>
                <button
                  type="button"
                  onClick={() => setMenuActiveCategoryFilter('all')}
                  className={`menu-cat-chip ${menuActiveCategoryFilter === 'all' ? 'active' : ''}`}
                >
                  الكل ({products.length})
                </button>
                {categories.map((cat) => {
                  const count = products.filter(p => p.category_id === cat.id).length;
                  const isSelected = String(menuActiveCategoryFilter) === String(cat.id);
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setMenuActiveCategoryFilter(isSelected ? 'all' : cat.id)}
                      className={`menu-cat-chip ${isSelected ? 'active' : ''}`}
                    >
                      <span>{cat.icon || '☕'}</span>
                      <span>{cat.name}</span>
                      <span style={{ opacity: 0.8, fontSize: '11px' }}>({count})</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="table-container">
              <table className="custom-table">
                <thead>
                  <tr>
                    <th>الصنف</th>
                    <th>القسم</th>
                    <th>سعر البيع</th>
                    <th>سعر التكلفة</th>
                    <th>المخزون الحالي</th>
                    <th>حد التنبيه</th>
                    <th>الربح التقديري</th>
                    <th>إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMenuProducts.length === 0 ? (
                    <tr>
                      <td colSpan="8" className="text-center" style={{ padding: '36px', color: 'var(--text-muted)' }}>
                        <div style={{ fontSize: '28px', marginBottom: '8px' }}>🔍</div>
                        لا توجد أصناف مطابقة للبحث أو الفلتر المحدد
                      </td>
                    </tr>
                  ) : (
                    filteredMenuProducts.map((p) => (
                      <tr key={p.id}>
                        <td><strong>{p.name}</strong></td>
                        <td><span className="badge-cat">{p.category_name || 'عام'}</span></td>
                        <td><strong className="text-green">{fmtMoney(p.price)} {settings.currency || 'ج.م'}</strong></td>
                        <td>{fmtMoney(p.cost || 0)} {settings.currency || 'ج.م'}</td>
                        <td>
                          <span className={`stock-pill ${p.stock_qty <= p.low_stock_threshold ? 'stock-low' : 'stock-ok'}`}>
                            {p.stock_qty}
                          </span>
                        </td>
                        <td>{p.low_stock_threshold}</td>
                        <td>{fmtMoney(subMoney(p.price, p.cost || 0))} {settings.currency || 'ج.م'}</td>
                        <td>
                          <button
                            className="btn btn-sm btn-warning"
                            onClick={() => {
                              setProductForm({ ...p });
                              setProductModal(true);
                            }}
                          >
                            تعديل
                          </button>
                          <button className="btn btn-sm btn-danger ml-1" onClick={() => handleDeleteProduct(p.id)}>
                            حذف
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
  );
}
