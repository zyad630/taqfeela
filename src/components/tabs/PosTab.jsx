import React from 'react';
import { fmtMoney, lineTotal } from '../../utils/money.js';
import api from '../../api';
import { isSameHall } from '../../utils/hall.js';

export default function PosTab({
  activeCategory,
  activeTakeawayId,
  addToCart,
  cart,
  cartSubtotal,
  cartTotal,
  categories,
  changeDue,
  clearCart,
  closeTakeawayTab,
  createNewTakeawayTab,
  currentUser,
  customerAddress,
  customerName,
  customerPhone,
  customerSuggestions,
  debtsGroupedList,
  debtsList,
  discountAmount,
  handleCheckout,
  handleCustomerAddressChange,
  handleCustomerPhoneChange,
  handleOpenTransferItemModal,
  handlePrintPreBillCheck,
  handleRequestAdminAuth,
  handleSendToBar,
  pendingSendToBar,
  isCheckingOut,
  loadDebts,
  mutationSeqRef,
  orderNotes,
  orderType,
  paidAmount,
  paymentMethod,
  prevTableCartsRef,
  removeFromCart,
  saveTableCartTimeoutRef,
  searchQuery,
  sections,
  selectCustomerSuggestion,
  selectedTable,
  setActiveCategory,
  setCart,
  setCategoryManagerModal,
  setCustomerAddress,
  setCustomerName,
  setCustomerPhone,
  setCustomerSuggestions,
  setDiscountAmount,
  setNoteModal,
  setNoteModalText,
  setNotebookModal,
  setOrderNotes,
  setOrderType,
  setPaidAmount,
  setPaymentMethod,
  setSearchQuery,
  setShowCustomerSuggestions,
  setSplitCash,
  setSplitWallet,
  setTableCartsMap,
  setTakeawayTabs,
  setTransferModal,
  setTransferTargetId,
  settings,
  showCustomerSuggestions,
  showToast,
  splitCash,
  splitWallet,
  switchTable,
  switchTakeawayTab,
  tableCartsMap,
  tables,
  takeawayTabs,
  toggleHoldTakeawayTab,
  updateQty,
  vendorDevFeatures,
  visibleProducts
}) {
  return (
    <div className="pos-layout">
            {/* Categories Sidebar */}
            <aside className="cat-sidebar">
              {currentUser?.role === 'admin' && (
                <button
                  type="button"
                  className="btn-category-mgr"
                  onClick={() => setCategoryManagerModal(true)}
                  title="ترتيب وإدارة أقسام المنيو"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    padding: '8px 10px',
                    marginBottom: '8px',
                    background: 'rgba(245, 158, 11, 0.12)',
                    border: '1px dashed #f59e0b',
                    borderRadius: '8px',
                    color: '#fbbf24',
                    fontSize: '12px',
                    fontWeight: 'bold',
                    cursor: 'pointer'
                  }}
                >
                  <span>⚙️</span>
                  <span>ترتيب الأقسام</span>
                </button>
              )}
              <button
                className={`cat-item ${activeCategory === null ? 'active' : ''}`}
                onClick={() => setActiveCategory(null)}
              >
                <span className="cat-icon">⭐</span>
                <span className="cat-name">كل الأصناف</span>
              </button>
              {categories.map((c) => (
                <button
                  key={c.id}
                  className={`cat-item ${activeCategory === c.id ? 'active' : ''}`}
                  onClick={() => setActiveCategory(c.id)}
                >
                  <span className="cat-icon">{c.icon || '☕'}</span>
                  <span className="cat-name">{c.name}</span>
                </button>
              ))}
            </aside>

            {/* Products Grid */}
            <section className="products-section">
              <div className="search-bar-wrap">
                <input
                  type="text"
                  className="search-input"
                  placeholder="🔍 ابحث عن مشروب أو صنف (اكتب الاسم أو السعر)..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                {searchQuery && (
                  <button className="clear-search" onClick={() => setSearchQuery('')}>✕</button>
                )}
              </div>

              <div className="products-grid">
                {visibleProducts.length === 0 ? (
                  <div className="no-items">لا توجد أصناف مطابقة للبحث</div>
                ) : (
                  visibleProducts.map((p) => {
                    const isDepleted = p.stock_qty <= 0;
                    return (
                      <div
                        key={p.id}
                        className={`product-card ${isDepleted ? 'out-of-stock' : ''}`}
                        onClick={() => addToCart(p)}
                        title={`إضافة ${p.name} إلى السلة${vendorDevFeatures.show_stock_alert_on_order ? ` (الرصيد: ${p.stock_qty})` : ''}`}
                      >
                        <div className="p-header">
                          <span className="p-icon">{p.category_icon || '☕'}</span>
                          {vendorDevFeatures.show_stock_alert_on_order && (
                            <span className={`p-stock-badge ${isDepleted ? 'depleted' : p.stock_qty <= p.low_stock_threshold ? 'low' : ''}`}>
                              {p.stock_qty < 0 ? `⚠️ رصيد سالب: ${p.stock_qty}` : (isDepleted ? `⚠️ نفد (${p.stock_qty})` : `متبقي: ${p.stock_qty}`)}
                            </span>
                          )}
                        </div>
                        <h3 className="p-title">{p.name}</h3>
                        <div className="p-footer">
                          <span className="p-price">{p.price} {settings.currency || 'ج.م'}</span>
                          <span className="p-add-btn">+</span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </section>

            {/* Cart & Checkout Panel */}
            <aside className="cart-sidebar">
              <div className="cart-header">
                <div className="cart-header-title-wrap">
                  <h2>🧾 سلة الطلب</h2>
                  {(vendorDevFeatures.enable_notebook_for_admin !== false && (currentUser?.role === 'admin' || vendorDevFeatures.show_notebook_to_cashier)) && (
                    <button
                      type="button"
                      className="btn-notebook-badge"
                      onClick={() => {
                        loadDebts();
                        setNotebookModal(true);
                      }}
                      title="فتح دفتر النوتة والعملاء الآجل"
                    >
                      📝 دفتر النوتة
                      {(Array.isArray(debtsList) ? debtsList : []).filter((d) => d.status !== 'paid').length > 0 && (
                        <span className="badge-debt-count">
                          {(Array.isArray(debtsList) ? debtsList : []).filter((d) => d.status !== 'paid').length}
                        </span>
                      )}
                    </button>
                  )}
                </div>
                {cart.length > 0 && (
                  <button
                    type="button"
                    className={`btn-text-danger ${cart.some((it) => (Number(it.sent_qty) || 0) > 0) ? 'locked-sent-btn' : ''}`}
                    onClick={() => clearCart(false)}
                    title={cart.some((it) => (Number(it.sent_qty) || 0) > 0) ? "إفراغ السلة (يتطلب كلمة سر الأدمن لوجود أصناف أُرسلت للبار)" : "إفراغ السلة"}
                  >
                    {cart.some((it) => (Number(it.sent_qty) || 0) > 0) ? '🔒 إفراغ السلة (بإذن الأدمن)' : 'إفراغ السلة'}
                  </button>
                )}
              </div>

              {/* Order Type Selector */}
              <div className="order-type-tabs">
                {vendorDevFeatures.enable_takeaway !== false && (
                <button
                  className={`type-tab ${orderType === 'takeaway' ? 'active' : ''}`}
                  onClick={() => {
                    if (selectedTable) switchTable(null);
                    setOrderType('takeaway');
                    if (paymentMethod === 'notebook') setPaymentMethod('cash');
                    const curTab = takeawayTabs.find((t) => t.id === activeTakeawayId) || takeawayTabs[0];
                    if (curTab) {
                      setCart(curTab.cart || []);
                      setCustomerName(curTab.customerName || '');
                      setCustomerPhone(curTab.customerPhone || '');
                      setCustomerAddress(curTab.customerAddress || '');
                      setDiscountAmount(curTab.discountAmount || 0);
                      setOrderNotes(curTab.orderNotes || '');
                    }
                  }}
                >
                  🛍️ تيك أواي
                </button>
                )}
                <button
                  className={`type-tab ${orderType === 'dine_in' ? 'active' : ''}`}
                  onClick={() => {
                    if (orderType === 'takeaway') {
                      setTakeawayTabs((prev) => {
                        const next = prev.map((t) => (t.id === activeTakeawayId ? {
                          ...t,
                          cart: [...cart],
                          customerName,
                          customerPhone,
                          customerAddress,
                          discountAmount,
                          orderNotes
                        } : t));
                        try { localStorage.setItem('cafepos_takeaway_tabs', JSON.stringify(next)); } catch (_) {}
                        return next;
                      });
                    }
                    setOrderType('dine_in');
                    if (paymentMethod === 'notebook') setPaymentMethod('cash');
                    if (selectedTable) {
                      const saved = tableCartsMap[selectedTable.id] || tableCartsMap[String(selectedTable.id)];
                      setCart(saved?.cart || []);
                      setCustomerName(saved?.customerName || '');
                      setDiscountAmount(saved?.discountAmount || 0);
                      setOrderNotes(saved?.orderNotes || '');
                    } else {
                      setCart([]);
                      setCustomerName('');
                      setCustomerPhone('');
                      setCustomerAddress('');
                      setDiscountAmount(0);
                      setOrderNotes('');
                      setPaidAmount('');
                    }
                  }}
                >
                  ☕ صالة {selectedTable ? `(${selectedTable.name})` : ''}
                </button>
                {(vendorDevFeatures.enable_notebook_for_admin !== false && (currentUser?.role === 'admin' || vendorDevFeatures.show_notebook_to_cashier)) && (
                  <button
                    className={`type-tab ${orderType === 'notebook' ? 'active' : ''}`}
                    onClick={() => {
                      if (orderType === 'takeaway') {
                        setTakeawayTabs((prev) => {
                          const next = prev.map((t) => (t.id === activeTakeawayId ? {
                            ...t,
                            cart: [...cart],
                            customerName,
                            customerPhone,
                            customerAddress,
                            discountAmount,
                            orderNotes
                          } : t));
                          try { localStorage.setItem('cafepos_takeaway_tabs', JSON.stringify(next)); } catch (_) {}
                          return next;
                        });
                      }
                      if (selectedTable) switchTable(null);
                      setOrderType('notebook');
                      setPaymentMethod('notebook');
                    }}
                  >
                    📝 نوتة (آجل)
                  </button>
                )}
              </div>

              {/* Multi-Takeaway Sessions Bar */}
              {orderType === 'takeaway' && (
                <div className="takeaway-multi-bar">
                  <div className="takeaway-bar-header">
                    <div className="takeaway-bar-title">
                      <span className="takeaway-badge-indicator">🛍️</span>
                      <span>طلبات تيك أواي ({takeawayTabs.length})</span>
                    </div>
                    <div className="takeaway-bar-actions">
                      <button
                        type="button"
                        className="takeaway-add-btn"
                        onClick={createNewTakeawayTab}
                        title="فتح طلب تيك أواي جديد إضافي"
                      >
                        ➕ جديد
                      </button>
                      <button
                        type="button"
                        className={`takeaway-hold-btn ${takeawayTabs.find((t) => t.id === activeTakeawayId)?.isHeld ? 'is-held' : ''}`}
                        onClick={() => toggleHoldTakeawayTab(activeTakeawayId)}
                        title="تعليق / استئناف الطلب الحالي"
                      >
                        {takeawayTabs.find((t) => t.id === activeTakeawayId)?.isHeld ? '▶️ استئناف' : '⏳ تعليق'}
                      </button>
                    </div>
                  </div>
                  <div className="takeaway-tabs-grid">
                    {takeawayTabs.map((tab, idx) => {
                      const isActive = tab.id === activeTakeawayId;
                      const count = (isActive ? cart : (tab.cart || [])).reduce((sum, item) => sum + (item.qty || 1), 0);
                      const name = (isActive ? customerName : tab.customerName)?.trim() || tab.name || `طلب ${idx + 1}`;
                      return (
                        <button
                          key={tab.id}
                          type="button"
                          className={`takeaway-session-tab ${isActive ? 'active' : ''} ${tab.isHeld ? 'held' : ''}`}
                          onClick={() => switchTakeawayTab(tab.id)}
                          title={tab.isHeld ? 'طلب معلق - اضغط للاستئناف' : 'اضغط للتبديل لهذا الطلب'}
                        >
                          <span className="tab-title-text">{tab.isHeld ? '⏳ ' : '🛍️ '}{name}</span>
                          {count > 0 && <span className="takeaway-tab-badge">{count}</span>}
                          {takeawayTabs.length > 1 && (
                            <span
                              className="takeaway-tab-close"
                              title="إلغاء هذا الطلب"
                              onClick={(e) => {
                                e.stopPropagation();
                                closeTakeawayTab(tab.id);
                              }}
                            >
                              ×
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Table Selector if Dine-in */}
              {orderType === 'dine_in' && (
                <div className="table-quick-select">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <label style={{ margin: 0 }}>اختر الطاولة:</label>
                    {selectedTable && cart.length > 0 && (
                      <button
                        type="button"
                        style={{ fontSize: '12px', fontWeight: 'bold', cursor: 'pointer', background: 'none', border: 'none', color: '#f59e0b', padding: '0 4px' }}
                        onClick={() => {
                          setTransferModal({ sourceTable: selectedTable });
                          setTransferTargetId('');
                        }}
                        title="نقل طلب هذه الطاولة لطاولة أخرى"
                      >
                        🔀 نقل الطلب لطاولة أخرى
                      </button>
                    )}
                  </div>
                  <select
                    value={selectedTable?.id || ''}
                    onChange={(e) => {
                      const t = tables.find((x) => x.id === Number(e.target.value));
                      switchTable(t || null);
                    }}
                  >
                    <option value="">-- اضغط لاختيار الطاولة --</option>
                    {sections.map((sec) => {
                      const secTables = tables.filter((t) => isSameHall(t.hall, sec.name));
                      if (secTables.length === 0) return null;
                      return (
                        <optgroup key={sec.id} label={`📍 ${sec.name}`}>
                          {secTables.map((tbl) => {
                            const tblCart = tableCartsMap[tbl.id]?.cart || [];
                            const tblCust = (tableCartsMap[tbl.id]?.customerName || '').trim();
                            const hasPending = tblCart.length > 0 || Boolean(tblCust);
                            const isCheckPrinted = Boolean(tableCartsMap[tbl.id]?.printedCheck && tblCart.length > 0);
                            return (
                              <option key={tbl.id} value={tbl.id}>
                                {isCheckPrinted ? '🔔 ' : hasPending ? '🔴 ' : '🟢 '}
                                {tbl.name}{tblCust ? ` (👤 ${tblCust})` : ''} {isCheckPrinted ? `(🔔 بانتظار التحصيل - شيك مطبوع)` : hasPending ? (tblCart.length > 0 ? `(مشغول - ${tblCart.length} أصناف)` : `(مشغول)`) : tbl.status === 'occupied' ? '(مشغولة)' : '(متاحة)'}
                              </option>
                            );
                          })}
                        </optgroup>
                      );
                    })}
                    {tables.filter((t) => !sections.some((s) => isSameHall(s.name, t.hall))).length > 0 && (
                      <optgroup label="طاولات أخرى">
                        {tables.filter((t) => !sections.some((s) => isSameHall(s.name, t.hall))).map((tbl) => {
                          const tblCart = tableCartsMap[tbl.id]?.cart || [];
                          const tblCust = (tableCartsMap[tbl.id]?.customerName || '').trim();
                          const hasPending = tblCart.length > 0 || Boolean(tblCust);
                          const isCheckPrinted = Boolean(tableCartsMap[tbl.id]?.printedCheck && tblCart.length > 0);
                          return (
                            <option key={tbl.id} value={tbl.id}>
                              {isCheckPrinted ? '🔔 ' : hasPending ? '🔴 ' : '🟢 '}
                              {tbl.name}{tblCust ? ` (👤 ${tblCust})` : ''} {isCheckPrinted ? `(🔔 بانتظار التحصيل - شيك مطبوع)` : hasPending ? (tblCart.length > 0 ? `(مشغول - ${tblCart.length} أصناف)` : `(مشغول)`) : tbl.status === 'occupied' ? '(مشغولة)' : '(متاحة)'}
                            </option>
                          );
                        })}
                      </optgroup>
                    )}
                  </select>
                </div>
              )}

              {/* Customer Inputs based on Order Type */}
              {orderType === 'notebook' ? (
                <div className="notebook-customer-inputs">
                  <div className="cart-input-row">
                    <input
                      type="text"
                      list="notebook-customers-datalist"
                      required
                      placeholder="اسم الزبون / صاحب النوتة * (مطلوب لتسجيل النوتة)"
                      value={customerName}
                      onChange={(e) => {
                        const val = e.target.value;
                        setCustomerName(val);
                        const match = (debtsGroupedList || []).find((c) => c.customer_name?.toLowerCase() === val.toLowerCase());
                        if (match && match.customer_phone) {
                          setCustomerPhone(match.customer_phone);
                        }
                      }}
                      style={{
                        border: !customerName.trim() ? '2px solid #f59e0b' : '1px solid rgba(255,255,255,0.2)',
                        background: !customerName.trim() ? 'rgba(245,158,11,0.1)' : undefined
                      }}
                    />
                    <datalist id="notebook-customers-datalist">
                      {(debtsGroupedList || []).map((c, i) => (
                        <option key={i} value={c.customer_name}>
                          {c.customer_phone ? `${c.customer_name} (${c.customer_phone})` : c.customer_name}
                        </option>
                      ))}
                    </datalist>
                  </div>
                  <div className="cart-input-row">
                    <input
                      type="text"
                      placeholder="رقم هاتف الزبون (اختياري)"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                    />
                  </div>
                  <div className="table-quick-select">
                    <select
                      value={selectedTable?.id || ''}
                      onChange={(e) => {
                        const t = tables.find((x) => x.id === Number(e.target.value));
                        switchTable(t || null);
                      }}
                    >
                      <option value="">-- بدون طاولة (طلب خارجي / حساب) --</option>
                      {sections.map((sec) => {
                        const secTables = tables.filter((t) => isSameHall(t.hall, sec.name));
                        if (secTables.length === 0) return null;
                        return (
                          <optgroup key={sec.id} label={`📍 ${sec.name}`}>
                            {secTables.map((tbl) => {
                              const tblCust = (tableCartsMap[tbl.id]?.customerName || '').trim();
                              const hasPending = (tableCartsMap[tbl.id]?.cart?.length || 0) > 0 || Boolean(tblCust);
                              return (
                                <option key={tbl.id} value={tbl.id}>
                                  {hasPending ? '🔴 ' : ''}{tbl.name}{tblCust ? ` (👤 ${tblCust})` : ''}{tableCartsMap[tbl.id]?.cart?.length ? ` (مشغول - ${tableCartsMap[tbl.id].cart.length} أصناف)` : hasPending ? ' (مشغول)' : ''}
                                </option>
                              );
                            })}
                          </optgroup>
                        );
                      })}
                      {tables.filter((t) => !sections.some((s) => isSameHall(s.name, t.hall))).length > 0 && (
                        <optgroup label="طاولات غير مصنفة">
                          {tables.filter((t) => !sections.some((s) => isSameHall(s.name, t.hall))).map((tbl) => {
                            const tblCust = (tableCartsMap[tbl.id]?.customerName || '').trim();
                            const hasPending = (tableCartsMap[tbl.id]?.cart?.length || 0) > 0 || Boolean(tblCust);
                            return (
                              <option key={tbl.id} value={tbl.id}>
                                {hasPending ? '🔴 ' : ''}{tbl.name}{tblCust ? ` (👤 ${tblCust})` : ''}{tableCartsMap[tbl.id]?.cart?.length ? ` (مشغول - ${tableCartsMap[tbl.id].cart.length} أصناف)` : hasPending ? ' (مشغول)' : ''}
                              </option>
                            );
                          })}
                        </optgroup>
                      )}
                    </select>
                  </div>
                </div>
              ) : orderType === 'takeaway' ? (
                <div className="customer-crm-box">
                  {/* Row 1: Phone (with search autocomplete) & Customer Name */}
                  <div className="customer-crm-row">
                    <div style={{ position: 'relative', flex: 1.1 }}>
                      <input
                        type="tel"
                        className="customer-crm-input"
                        placeholder="📱 رقم هاتف العميل (للبحث)"
                        value={customerPhone}
                        onChange={(e) => handleCustomerPhoneChange(e.target.value)}
                        onFocus={() => { if (customerSuggestions.length > 0) setShowCustomerSuggestions(true); }}
                      />
                      {showCustomerSuggestions && customerSuggestions.length > 0 && (
                        <div className="customer-autocomplete-dropdown">
                          <div className="cust-sugg-header">🔍 عملاء مسجلون سابقاً:</div>
                          {customerSuggestions.map((cust) => (
                            <div
                              key={cust.id}
                              className="customer-suggestion-item"
                              onClick={() => selectCustomerSuggestion(cust)}
                            >
                              <div className="cust-sugg-top">
                                <span className="cust-sugg-name">👤 {cust.name || 'عميل'}</span>
                                {cust.phone && <span className="cust-sugg-phone">📱 {cust.phone}</span>}
                              </div>
                              {cust.address && <div className="cust-sugg-addr">📍 {cust.address}</div>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <div style={{ flex: 1 }}>
                      <input
                        type="text"
                        className="customer-crm-input"
                        placeholder="👤 اسم العميل (اختياري)"
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                      />
                    </div>
                  </div>

                  {/* Row 2: Full width Address & Clear button */}
                  <div className="customer-crm-row">
                    <input
                      type="text"
                      className="customer-crm-input"
                      placeholder="📍 العنوان بالتفصيل (اسم الشارع، العمارة، الشقة...)"
                      value={customerAddress}
                      onChange={(e) => handleCustomerAddressChange(e.target.value)}
                      style={{ flex: 1 }}
                    />
                    {(customerPhone || customerName || customerAddress) && (
                      <button
                        type="button"
                        className="customer-clear-btn"
                        onClick={() => {
                          setCustomerPhone('');
                          setCustomerName('');
                          setCustomerAddress('');
                          setCustomerSuggestions([]);
                          setShowCustomerSuggestions(false);
                        }}
                        title="مسح بيانات العميل الحالية"
                      >
                        ✕
                      </button>
                    )}
                  </div>

                  {/* Address registered confirmation chip */}
                  {customerAddress.trim() && (
                    <div className="customer-auto-badge">
                      <span>📍 العنوان مسجل للفاتورة: <strong>{customerAddress.trim()}</strong></span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="cart-input-row">
                  <input
                    type="text"
                    placeholder="اسم العميل (اختياري)"
                    value={customerName}
                    onChange={(e) => {
                      const val = e.target.value;
                      setCustomerName(val);
                      if (selectedTable) {
                        setTableCartsMap((prev) => {
                          const currentEntry = prev[selectedTable.id] || { cart: [], discountAmount: 0, orderNotes: '' };
                          const nextMap = {
                            ...prev,
                            [selectedTable.id]: {
                              ...currentEntry,
                              customerName: val
                            }
                          };
                          try {
                            localStorage.setItem('cafepos_table_carts', JSON.stringify(nextMap));
                          } catch (_) {}
                          return nextMap;
                        });
                        if (api.saveTableCart) {
                          if (saveTableCartTimeoutRef.current) clearTimeout(saveTableCartTimeoutRef.current);
                          saveTableCartTimeoutRef.current = setTimeout(() => {
                            const entry = (tableCartsMap[selectedTable.id] || {});
                            api.saveTableCart(selectedTable.id, {
                              cart: cart,
                              customerName: val,
                              discountAmount,
                              orderNotes,
                              printedCheck: entry.printedCheck || false
                            }).then((res) => {
                              if (res && res.conflict && res.current) {
                                const sc = res.current;
                                mutationSeqRef.current += 1;
                                setTableCartsMap((p) => ({ ...p, [selectedTable.id]: sc, [String(selectedTable.id)]: sc }));
                                prevTableCartsRef.current = { ...prevTableCartsRef.current, [selectedTable.id]: sc, [String(selectedTable.id)]: sc };
                              }
                            }).catch(() => {});
                          }, 400);
                        }
                      }
                    }}
                  />
                </div>
              )}

              {/* Cart Items List */}
              <div className="cart-items-scroll">
                {cart.length === 0 ? (
                  <div className="cart-empty">
                    <span className="empty-icon">☕</span>
                    <p>السلة فارغة</p>
                    <small>اضغط على أي صنف من القائمة لإضافته للطلب</small>
                  </div>
                ) : (
                  cart.map((item) => {
                    const sentQty = Number(item.sent_qty) || 0;
                    const unsentQty = item.qty - sentQty;
                    const isFullySent = sentQty > 0 && unsentQty === 0;
                    const isPartiallySent = sentQty > 0 && unsentQty > 0;

                    return (
                      <div className={`cart-item-card ${isFullySent ? 'item-sent-locked' : ''}`} key={item.id}>
                        <div className="cart-item-row-top">
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                            <span className="item-name-bold">{item.name}</span>
                            {isFullySent && (
                              <span style={{ fontSize: '11px', background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold' }}>
                                🔒 تم إرساله للبار ({sentQty})
                              </span>
                            )}
                            {isPartiallySent && (
                              <span style={{ fontSize: '11px', background: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold' }}>
                                🔒 مرسل ({sentQty}) + 🟢 جديد ({unsentQty})
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                setNoteModalText(item.notes || '');
                                setNoteModal({ item });
                              }}
                              style={{
                                fontSize: '11.5px',
                                padding: '2px 8px',
                                background: item.notes ? '#fef3c7' : 'rgba(255,255,255,0.08)',
                                color: item.notes ? '#92400e' : 'var(--text-muted, #94a3b8)',
                                border: item.notes ? '1.5px solid #f59e0b' : '1px dashed rgba(255,255,255,0.2)',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                fontWeight: item.notes ? '800' : '500',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                transition: 'all 0.15s'
                              }}
                              title="إضافة أو تعديل ملاحظة خاصة للبار لهذا الصنف"
                            >
                              <span>{item.notes ? '📝' : '➕'}</span>
                              <span>{item.notes ? item.notes : 'ملاحظة'}</span>
                              {item.notes && (
                                <span
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setCart((prev) => prev.map((it) => (it.id === item.id ? { ...it, notes: '' } : it)));
                                    if (selectedTable) {
                                      setTableCartsMap((tm) => ({
                                        ...tm,
                                        [selectedTable.id]: {
                                          ...(tm[selectedTable.id] || {}),
                                          cart: (tm[selectedTable.id]?.cart || []).map((it) => (it.id === item.id ? { ...it, notes: '' } : it))
                                        }
                                      }));
                                    }
                                  }}
                                  style={{ marginRight: '4px', color: '#ef4444', fontWeight: 'bold', fontSize: '12px' }}
                                  title="حذف الملاحظة"
                                >
                                  ×
                                </span>
                              )}
                            </button>
                          </div>
                          <span className="item-unit-price-small">{fmtMoney(item.price)} {settings.currency || 'ج.م'} للواحد</span>
                        </div>
                        <div className="cart-item-row-bottom">
                          {sentQty > 0 ? (
                            <button
                              type="button"
                              className="item-del-left"
                              style={{
                                background: 'rgba(239, 68, 68, 0.1)',
                                color: '#ef4444',
                                border: '1px solid rgba(239, 68, 68, 0.3)',
                                borderRadius: '50%',
                                width: '22px',
                                height: '22px',
                                fontSize: '11px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: 'pointer'
                              }}
                              onClick={() => removeFromCart(item.id)}
                              title="حذف هذا الصنف المرسل للبار (يتطلب إذن كلمة سر الأدمن)"
                            >
                              🔒×
                            </button>
                          ) : (
                            <button className="item-del-left" onClick={() => removeFromCart(item.id)}>×</button>
                          )}
                          {selectedTable && sentQty > 0 && (
                            <button
                              type="button"
                              className="item-transfer-btn"
                              onClick={() => handleOpenTransferItemModal(item)}
                              title="نقل هذا الصنف المرسل إلى طاولة أخرى"
                              style={{
                                background: 'rgba(59, 130, 246, 0.12)',
                                color: '#3b82f6',
                                border: '1px solid rgba(59, 130, 246, 0.3)',
                                borderRadius: '6px',
                                padding: '2px 7px',
                                fontSize: '11px',
                                fontWeight: 'bold',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '3px',
                                marginRight: '6px'
                              }}
                            >
                              <span>🔀</span>
                              <span>نقل لطاولة</span>
                            </button>
                          )}
                          <div className="item-total-price-bold">
                            {fmtMoney(lineTotal(item.price, item.qty))} {settings.currency || 'ج.م'}
                          </div>
                          <div className="qty-picker">
                            <button onClick={() => updateQty(item.id, 1)} title="زيادة الكمية">+</button>
                            <span className="qty-number">{item.qty}</span>
                            <button
                              type="button"
                              onClick={() => updateQty(item.id, -1)}
                              style={item.qty <= sentQty ? {
                                background: '#fef3c7',
                                color: '#b45309',
                                borderColor: '#f59e0b',
                                fontWeight: 'bold'
                              } : {}}
                              title={item.qty <= sentQty ? "إنقاص الكمية المرسلة للبار (يتطلب إذن كلمة سر الأدمن)" : "إنقاص الكمية"}
                            >
                              {item.qty <= sentQty ? '🔒-' : '-'}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Cart Calculations & Summary */}
              {cart.length > 0 && (
                <div className="cart-checkout-box">
                  <div className="calc-row">
                    <span>المجموع الفرعي:</span>
                    <span>{fmtMoney(cartSubtotal)} {settings.currency || 'ج.م'}</span>
                  </div>

                  {currentUser?.role === 'admin' && (
                    <div className="calc-row discount-row">
                      <span>الخصم:</span>
                      <div className="discount-input-wrap">
                        <input
                          type="number"
                          min="0"
                          step="any"
                          placeholder="0"
                          disabled={Boolean(vendorDevFeatures.require_check_print_before_checkout && selectedTable && tableCartsMap[selectedTable.id]?.printedCheck)}
                          value={discountAmount === 0 ? '' : discountAmount}
                          onChange={(e) => {
                            if (vendorDevFeatures.require_check_print_before_checkout && selectedTable && tableCartsMap[selectedTable.id]?.printedCheck) {
                              handleRequestAdminAuth({
                                type: 'edit_after_check_printed',
                                table: selectedTable,
                                actionName: 'تعديل الخصم'
                              });
                              return;
                            }
                            const val = e.target.value;
                            setDiscountAmount(val === '' ? '' : Math.max(0, parseFloat(val) || 0));
                          }}
                        />
                        <span>{settings.currency || 'ج.م'}</span>
                      </div>
                    </div>
                  )}

                  <div className="calc-row total-row">
                    <span>المبلغ المستحق:</span>
                    <span className="total-val">{fmtMoney(cartTotal)} {settings.currency || 'ج.م'}</span>
                  </div>

                  {/* Payment Method - Visa Removed */}
                  <div className="payment-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
                    <button
                      className={`pay-btn ${paymentMethod === 'cash' ? 'active' : ''}`}
                      onClick={() => setPaymentMethod('cash')}
                    >
                      💵 نقدي (خزنة)
                    </button>
                    <button
                      className={`pay-btn ${paymentMethod === 'wallet' ? 'active' : ''}`}
                      onClick={() => setPaymentMethod('wallet')}
                    >
                      📱 محفظة
                    </button>
                    <button
                      className={`pay-btn ${paymentMethod === 'split' ? 'active' : ''}`}
                      onClick={() => {
                        setPaymentMethod('split');
                        const half = Math.round((cartTotal / 2) * 100) / 100;
                        setSplitCash(half);
                        setSplitWallet(Math.round((cartTotal - half) * 100) / 100);
                      }}
                    >
                      🔀 تقسيم
                    </button>
                  </div>

                  {/* Split Payment UI - Cash & Wallet Only */}
                  {paymentMethod === 'split' && (
                    <div className="split-payment-box">
                      <div className="split-row">
                        <label>💵 نقدي (خزنة):</label>
                        <input
                          type="number"
                          placeholder="0"
                          value={splitCash}
                          onChange={(e) => {
                            const val = e.target.value;
                            setSplitCash(val);
                            const num = parseFloat(val) || 0;
                            const remain = Math.max(0, Math.round((cartTotal - num) * 100) / 100);
                            setSplitWallet(remain);
                          }}
                        />
                      </div>
                      <div className="split-row">
                        <label>📱 فودافون كاش (محفظة):</label>
                        <input
                          type="number"
                          placeholder="0"
                          value={splitWallet}
                          onChange={(e) => {
                            const val = e.target.value;
                            setSplitWallet(val);
                            const num = parseFloat(val) || 0;
                            const remain = Math.max(0, Math.round((cartTotal - num) * 100) / 100);
                            setSplitCash(remain);
                          }}
                        />
                      </div>
                      {(() => {
                        const sum = Math.round(((Number(splitCash) || 0) + (Number(splitWallet) || 0)) * 100) / 100;
                        const diff = Math.round((cartTotal - sum) * 100) / 100;
                        const isMatch = Math.abs(diff) < 0.01;
                        return (
                          <div className={`split-status-bar ${isMatch ? 'match' : 'mismatch'}`} style={{ marginTop: '8px', fontSize: '12px', fontWeight: 'bold' }}>
                            {isMatch ? (
                              <span style={{ color: '#10b981' }}>✅ المجموع مطابق تماماً للإجمالي: {sum} {settings.currency || 'ج.م'}</span>
                            ) : (
                              <span style={{ color: '#ef4444' }}>⚠️ المجموع الحالي: {sum} {settings.currency || 'ج.م'} (متبقي: {diff} {settings.currency || 'ج.م'})</span>
                            )}
                          </div>
                        );
                      })()}
                    </div>
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
                          <span>المتبقي للعميل:</span>
                          <strong>{fmtMoney(changeDue)} {settings.currency || 'ج.م'}</strong>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Send to Bar / Kitchen Action Button */}
                  {settings.enable_bar_order !== 'false' && (() => {
                    const unsentCount = cart.reduce((acc, it) => acc + Math.max(0, it.qty - (Number(it.sent_qty) || 0)), 0);
                    const dinInNoTable = orderType === 'dine_in' && !selectedTable;
                    if (unsentCount === 0 && !dinInNoTable) {
                      return (
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px',
                          padding: '5px 8px',
                          marginBottom: '6px',
                          background: 'rgba(16, 185, 129, 0.12)',
                          border: '1px solid rgba(16, 185, 129, 0.25)',
                          borderRadius: '6px',
                          color: '#10b981',
                          fontSize: '11.5px',
                          fontWeight: '700'
                        }}>
                          <span>☕ ✅</span>
                          <span>تم إرسال كافة الأصناف للبار</span>
                        </div>
                      );
                    }
                    return (
                      <button
                        type="button"
                        className="btn btn-warning btn-send-bar"
                        onClick={handleSendToBar}
                        disabled={dinInNoTable || pendingSendToBar}
                        style={{
                          width: '100%',
                          marginBottom: '6px',
                          padding: '8px 10px',
                          fontWeight: '800',
                          fontSize: '13.5px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px',
                          background: (dinInNoTable || pendingSendToBar) ? 'rgba(239, 68, 68, 0.15)' : 'linear-gradient(135deg, #f59e0b, #d97706)',
                          color: (dinInNoTable || pendingSendToBar) ? '#ef4444' : '#fff',
                          border: (dinInNoTable || pendingSendToBar) ? '1.5px solid rgba(239, 68, 68, 0.4)' : 'none',
                          cursor: (dinInNoTable || pendingSendToBar) ? 'not-allowed' : 'pointer',
                          borderRadius: 'var(--radius-sm)',
                          boxShadow: !(dinInNoTable || pendingSendToBar) ? '0 3px 10px rgba(245, 158, 11, 0.3)' : 'none'
                        }}
                      >
                        <span>☕</span>
                        <span>
                          {pendingSendToBar
                            ? '⏳ جاري الإرسال للبار...'
                            : dinInNoTable
                            ? '⚠️ اختر طاولة أولاً للإرسال للبار'
                            : `إرسال للبار للتحضير (${unsentCount} صنف جديد)`}
                        </span>
                      </button>
                    );
                  })()}

                  {/* Print Check (Pre-bill / Guest Check) Button */}
                  {settings.enable_guest_check !== 'false' && cart.length > 0 && (
                    <button
                      type="button"
                      className={`btn btn-print-check ${selectedTable && tableCartsMap[selectedTable.id]?.printedCheck ? 'printed' : ''}`}
                      onClick={() => handlePrintPreBillCheck()}
                      style={{
                        width: '100%',
                        marginBottom: '6px',
                        padding: (selectedTable && tableCartsMap[selectedTable.id]?.printedCheck) ? '7px 10px' : '9px 10px',
                        fontWeight: '800',
                        fontSize: (selectedTable && tableCartsMap[selectedTable.id]?.printedCheck) ? '12px' : '13px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        borderRadius: 'var(--radius-sm)',
                        cursor: 'pointer'
                      }}
                    >
                      <span>{(selectedTable && tableCartsMap[selectedTable.id]?.printedCheck) ? '🔄 🧾' : '🧾'}</span>
                      <span>
                        {(selectedTable && tableCartsMap[selectedTable.id]?.printedCheck)
                          ? `إعادة طباعة الشيك للعميل (${selectedTable.name})`
                          : selectedTable
                            ? `طباعة شيك الحساب للعميل (${selectedTable.name})`
                            : 'طباعة شيك الحساب للعميل (طلب الحساب)'}
                      </span>
                    </button>
                  )}

                  {/* زر إتمام الطلب والتحصيل وإغلاق الطاولة المباشر */}
                  {(() => {
                    const isCheckRequired = Boolean(
                      vendorDevFeatures.require_check_print_before_checkout &&
                      settings.require_check_print_before_checkout !== 'false' &&
                      vendorDevFeatures.enable_guest_check !== false &&
                      settings.enable_guest_check !== 'false'
                    );
                    const isTableDineIn = Boolean(selectedTable || orderType === 'dine_in');
                    const isTableCheckPrinted = Boolean(selectedTable && tableCartsMap[selectedTable.id]?.printedCheck);
                    const isTableCheckoutLocked = Boolean(isCheckRequired && isTableDineIn && !isTableCheckPrinted);

                    return (
                      <button
                        className={`btn btn-checkout ${isTableCheckoutLocked ? 'checkout-locked' : (orderType === 'notebook' ? 'checkout-notebook' : 'checkout-success')}`}
                        onClick={(e) => {
                          if (isTableCheckoutLocked) {
                            e.preventDefault();
                            e.stopPropagation();
                            showToast('⚠️ التحصيل مقفول! يجب الضغط على (طباعة شيك الحساب للعميل) أولاً.');
                            return;
                          }
                          handleCheckout();
                        }}
                        disabled={isCheckingOut || isTableCheckoutLocked}
                        title={isTableCheckoutLocked ? 'التحصيل مقفول! يجب الضغط على (طباعة شيك الحساب للعميل) أولاً' : ''}
                        style={{
                          width: '100%',
                          padding: '12px 14px',
                          fontWeight: '800',
                          fontSize: '15px',
                          borderRadius: 'var(--radius-sm)',
                          cursor: (isCheckingOut || isTableCheckoutLocked) ? 'not-allowed' : 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '8px'
                        }}
                      >
                        {isCheckingOut ? (
                          <span>⏳ جاري معالجة الطلب...</span>
                        ) : isTableCheckoutLocked ? (
                          <>
                            <span style={{ fontSize: '18px' }}>🔒</span>
                            <span>التحصيل مقفول (اطبع شيك الحساب أولاً) ({fmtMoney(cartTotal)} {settings.currency || 'ج.م'})</span>
                          </>
                        ) : (selectedTable && isTableCheckPrinted) ? (
                          <>
                            <span style={{ fontSize: '18px' }}>💵</span>
                            <span>إتمام الطلب والتحصيل وإغلاق الطاولة ({fmtMoney(cartTotal)} {settings.currency || 'ج.م'})</span>
                          </>
                        ) : orderType === 'notebook' ? (
                          <>
                            <span style={{ fontSize: '18px' }}>📝</span>
                            <span>تسجيل وحفظ الفاتورة على النوتة ({fmtMoney(cartTotal)} {settings.currency || 'ج.م'})</span>
                          </>
                        ) : (
                          <>
                            <span style={{ fontSize: '18px' }}>💵</span>
                            <span>{selectedTable ? 'إتمام الطلب والتحصيل وإغلاق الطاولة' : 'إتمام الطلب والتحصيل'} ({fmtMoney(cartTotal)} {settings.currency || 'ج.م'})</span>
                          </>
                        )}
                      </button>
                    );
                  })()}
                </div>
              )}
            </aside>
          </div>
  );
}
