import React from 'react';

export default function ProductModal({
  categories,
  handleSaveProduct,
  productForm,
  setProductForm,
  setProductModal,
  settings
}) {
  return (
    <div className="modal-overlay" onClick={() => setProductModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h3>{productForm.id ? '✏️ تعديل صنف' : '+ إضافة صنف جديد'}</h3>
            <form onSubmit={handleSaveProduct}>
              <div className="form-group">
                <label>اسم الصنف / المشروب:</label>
                <input
                  type="text"
                  required
                  placeholder="مثال: كابتشينو كراميل"
                  value={productForm.name}
                  onChange={(e) => setProductForm({ ...productForm, name: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label>القسم:</label>
                <select
                  value={productForm.category_id}
                  onChange={(e) => setProductForm({ ...productForm, category_id: e.target.value })}
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>سعر البيع ({settings.currency || 'ج.م'}):</label>
                  <input
                    type="number"
                    step="0.5"
                    required
                    value={productForm.price !== undefined && productForm.price !== null ? productForm.price : ''}
                    onChange={(e) => setProductForm({ ...productForm, price: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>سعر التكلفة ({settings.currency || 'ج.م'}):</label>
                  <input
                    type="number"
                    step="0.5"
                    value={productForm.cost !== undefined && productForm.cost !== null ? productForm.cost : ''}
                    onChange={(e) => setProductForm({ ...productForm, cost: e.target.value })}
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>كمية المخزون:</label>
                  <input
                    type="number"
                    value={productForm.stock_qty !== undefined && productForm.stock_qty !== null ? productForm.stock_qty : ''}
                    onChange={(e) => setProductForm({ ...productForm, stock_qty: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>حد تنبيه النقص:</label>
                  <input
                    type="number"
                    value={productForm.low_stock_threshold !== undefined && productForm.low_stock_threshold !== null ? productForm.low_stock_threshold : ''}
                    onChange={(e) => setProductForm({ ...productForm, low_stock_threshold: e.target.value })}
                  />
                </div>
              </div>

              <div className="modal-actions">
                <button type="submit" className="btn btn-primary">حفظ الصنف</button>
                <button type="button" className="btn btn-secondary" onClick={() => setProductModal(false)}>إلغاء</button>
              </div>
            </form>
          </div>
        </div>
  );
}
