import React from 'react';
import { formatShiftTime, getLocalDateString } from '../../utils/dateTime.js';
import { fmtMoney } from '../../utils/money.js';

export default function OrdersTab({
  currentUser,
  debtsList,
  handleCancelOrder,
  handleExportOrders,
  handleRestoreOrder,
  loadDebts,
  loadOrders,
  orderCashierFilter,
  orderDateFilter,
  orderDateMode,
  orderSearchQuery,
  orderTypeFilter,
  ordersList,
  setNotebookModal,
  setOrderCashierFilter,
  setOrderDateFilter,
  setOrderDateMode,
  setOrderSearchQuery,
  setOrderTypeFilter,
  setPayAmountInput,
  setPayDebtData,
  setPayNotesInput,
  setReceiptOrder,
  settings,
  shift,
  usersList
}) {
  return (
    <div className="orders-view">
            <div className="view-header flex-between">
              <div>
                <h2>📜 سجل الفواتير والمبيعات</h2>
                <p>
                  {currentUser?.role === 'admin'
                    ? 'سجل شامل لكافة فواتير الكافيه مقسمة بالشيفتات، الكاشيرات، والأيام مع تتبع فواتير النوتة والآجل'
                    : `سجل فواتير الشيفت الحالي (${shift?.shift_type || currentUser?.shift_name || 'الشيفت الحالي'})`}
                </p>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                {currentUser?.role === 'admin' && (
                  <button className="btn btn-primary btn-sm" onClick={handleExportOrders} title="تصدير السجل الحالي إلى ملف Excel / CSV">
                    📥 تصدير السجل (Excel)
                  </button>
                )}
                <button className="btn btn-secondary btn-sm" onClick={() => loadOrders()}>🔄 تحديث السجل</button>
              </div>
            </div>

            {/* Orders Controls: Date Filter (Admin Only), Search */}
            <div className="notebook-filter-bar flex-between" style={{ marginBottom: '16px', gap: '12px', flexWrap: 'wrap' }}>
              {currentUser?.role === 'admin' && (
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <div className="filter-chips">
                    <button
                      className={`filter-chip ${orderDateMode === 'all' ? 'active' : ''}`}
                      onClick={() => setOrderDateMode('all')}
                    >
                      🗓️ جميع الفواتير ({ordersList.length >= 500 ? 'أحدث 500' : ordersList.length})
                    </button>
                    <button
                      className={`filter-chip ${orderDateMode === 'day' ? 'active' : ''}`}
                      onClick={() => setOrderDateMode('day')}
                    >
                      📅 فواتير يوم محدد
                    </button>
                  </div>

                  {orderDateMode === 'day' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <input
                        type="date"
                        value={orderDateFilter}
                        onChange={(e) => setOrderDateFilter(e.target.value)}
                        style={{
                          padding: '8px 12px',
                          background: 'var(--bg-card)',
                          color: 'var(--text-main)',
                          border: '1px solid var(--border-color)',
                          borderRadius: 'var(--radius-md)',
                          fontSize: '14px'
                        }}
                      />
                      <button
                        className="btn btn-sm btn-secondary"
                        onClick={() => setOrderDateFilter(getLocalDateString())}
                        title="العودة لليوم الحالي"
                      >
                        اليوم
                      </button>
                    </div>
                  )}

                  {usersList.length > 0 && (
                    <select
                      value={orderCashierFilter}
                      onChange={(e) => setOrderCashierFilter(e.target.value)}
                      style={{
                        padding: '8px 12px',
                        background: 'var(--bg-card)',
                        color: 'var(--text-main)',
                        border: '1px solid var(--border-color)',
                        borderRadius: 'var(--radius-md)',
                        fontSize: '14px'
                      }}
                    >
                      <option value="all">👥 جميع الكاشيرات والموظفين</option>
                      {usersList.map((u) => (
                        <option key={u.id} value={u.name}>{u.name} ({u.role === 'admin' ? 'مدير' : 'كاشير'})</option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              {/* Search Bar */}
              <div style={{ minWidth: '280px', flex: '1', maxWidth: '400px' }}>
                <input
                  type="text"
                  placeholder="🔍 بحث برقم الفاتورة أو اسم العميل..."
                  value={orderSearchQuery}
                  onChange={(e) => setOrderSearchQuery(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '9px 14px',
                    background: 'var(--bg-card)',
                    color: 'var(--text-main)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 'var(--radius-md)',
                    fontSize: '14px'
                  }}
                />
              </div>
            </div>

            {/* Order Type & Notebook Filter Chips */}
            <div className="filter-chips" style={{ marginBottom: '16px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button
                className={`filter-chip ${orderTypeFilter === 'all' ? 'active' : ''}`}
                onClick={() => setOrderTypeFilter('all')}
              >
                الكل
              </button>
              <button
                className={`filter-chip ${orderTypeFilter === 'dine_in' ? 'active' : ''}`}
                onClick={() => setOrderTypeFilter('dine_in')}
              >
                ☕ صالة
              </button>
              <button
                className={`filter-chip ${orderTypeFilter === 'takeaway' ? 'active' : ''}`}
                onClick={() => setOrderTypeFilter('takeaway')}
              >
                🛍️ تيك أواي
              </button>
              <button
                className={`filter-chip ${orderTypeFilter === 'notebook' ? 'active' : ''}`}
                onClick={() => setOrderTypeFilter('notebook')}
                style={{ borderColor: 'rgba(239, 68, 68, 0.4)' }}
              >
                📝 كل فواتير النوتة ({ordersList.filter((o) => o.order_type === 'notebook' || o.payment_method === 'notebook').length})
              </button>
              <button
                className={`filter-chip ${orderTypeFilter === 'notebook_paid' ? 'active' : ''}`}
                onClick={() => setOrderTypeFilter('notebook_paid')}
                style={{ borderColor: 'rgba(16, 185, 129, 0.4)' }}
              >
                🟢 نوتة مسددة ({ordersList.filter((o) => (o.order_type === 'notebook' || o.payment_method === 'notebook') && o.debt_status === 'paid').length})
              </button>
              <button
                className={`filter-chip ${orderTypeFilter === 'notebook_unpaid' ? 'active' : ''}`}
                onClick={() => setOrderTypeFilter('notebook_unpaid')}
                style={{ borderColor: 'rgba(239, 68, 68, 0.6)' }}
              >
                🔴 نوتة غير مسددة / جزئي ({ordersList.filter((o) => (o.order_type === 'notebook' || o.payment_method === 'notebook') && o.debt_status !== 'paid').length})
              </button>
            </div>

            {/* Orders Statistics Bar */}
            {(() => {
              const filteredOrders = ordersList.filter((ord) => {
                // Strict isolation for Cashiers: only see orders from current active shift created by this cashier
                if (currentUser?.role === 'cashier') {
                  if (!shift?.id) return false;
                  if (ord.shift_id !== shift.id) return false;
                  const isOwnOrder = (ord.user_id && ord.user_id === currentUser.id) || (ord.cashier_name && ord.cashier_name === currentUser.name);
                  if (!isOwnOrder) return false;
                }
                if (orderDateMode === 'day' && orderDateFilter) {
                  const isCurrentShiftOrder = Boolean(shift?.id && ord.shift_id === shift.id);
                  // حماية الشيفتات الليلية: عدم إخفاء فواتير الشيفت المفتوح حالياً عند دخول منتصف الليل
                  if (!isCurrentShiftOrder) {
                    const ordDate = getLocalDateString(ord.created_at);
                    if (ordDate !== orderDateFilter) return false;
                  }
                }
                if (orderCashierFilter !== 'all') {
                  if (ord.cashier_name !== orderCashierFilter) return false;
                }
                if (orderTypeFilter !== 'all') {
                  const isNb = ord.order_type === 'notebook' || ord.payment_method === 'notebook';
                  if (orderTypeFilter === 'dine_in' && ord.order_type !== 'dine_in') return false;
                  if (orderTypeFilter === 'takeaway' && ord.order_type !== 'takeaway') return false;
                  if (orderTypeFilter === 'notebook' && !isNb) return false;
                  if (orderTypeFilter === 'notebook_paid' && (!isNb || ord.debt_status !== 'paid')) return false;
                  if (orderTypeFilter === 'notebook_unpaid' && (!isNb || ord.debt_status === 'paid')) return false;
                }
                if (orderSearchQuery.trim()) {
                  const q = orderSearchQuery.trim().toLowerCase();
                  const matchNo = String(ord.invoice_no || ord.id).toLowerCase().includes(q) || `#${ord.invoice_no || ord.id}`.includes(q);
                  const matchCust = (ord.customer_name || '').toLowerCase().includes(q);
                  const matchCashier = (ord.cashier_name || '').toLowerCase().includes(q);
                  const matchShift = (ord.shift_name || '').toLowerCase().includes(q);
                  const matchTable = (ord.table_name || '').toLowerCase().includes(q);
                  const matchItems = (ord.items || []).some((it) => (it.product_name || it.name || '').toLowerCase().includes(q));
                  if (!matchNo && !matchCust && !matchCashier && !matchShift && !matchTable && !matchItems) return false;
                }
                return true;
              });

              const validOrders = filteredOrders.filter((o) => o.status !== 'cancelled');
              const totalSales = validOrders.reduce((s, o) => s + (Number(o.total) || 0), 0);

              const splitAmount = (o, field, method) => {
                const isNb = o.order_type === 'notebook' || o.payment_method === 'notebook';
                if (isNb) {
                  return field === 'cash_amount'
                    ? ((o.cash_amount !== null && o.cash_amount !== undefined && o.cash_amount !== '' && !Number.isNaN(Number(o.cash_amount)))
                        ? Number(o.cash_amount)
                        : (Number(o.amount_paid) || 0))
                    : 0;
                }
                const v = o[field];
                if (v !== null && v !== undefined && v !== '' && !Number.isNaN(Number(v))) return Number(v);
                return o.payment_method === method ? Number(o.total || 0) : 0;
              };

              const cashSales = validOrders.reduce((s, o) => s + splitAmount(o, 'cash_amount', 'cash'), 0);
              const walletSales = validOrders.reduce((s, o) => s + splitAmount(o, 'wallet_amount', 'wallet'), 0);
              const cardSales = validOrders.reduce((s, o) => s + splitAmount(o, 'card_amount', 'card'), 0);

              const notebookOrders = validOrders.filter((o) => o.order_type === 'notebook' || o.payment_method === 'notebook');
              const notebookTotal = notebookOrders.reduce((s, o) => {
                const tot = Number(o.total || 0);
                const paidCash = (o.cash_amount !== null && o.cash_amount !== undefined && o.cash_amount !== '' && !Number.isNaN(Number(o.cash_amount)))
                  ? Number(o.cash_amount)
                  : (Number(o.amount_paid) || 0);
                return s + Math.max(0, tot - paidCash);
              }, 0);

              return (
                <>
                  {ordersList.length >= 500 && (
                    <div className="alert alert-warning" style={{ marginBottom: '14px', padding: '10px 16px', borderRadius: '8px', background: 'rgba(234, 179, 8, 0.12)', border: '1px solid rgba(234, 179, 8, 0.4)', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontSize: '20px' }}>⚠️</span>
                      <div style={{ fontSize: '13px', lineHeight: '1.5' }}>
                        <strong>تنبيه حدود العرض (أحدث 500 فاتورة):</strong> يتم عرض أحدث 500 فاتورة فقط لحماية سرعة وأداء البرنامج. الكروت الإحصائية والجدول أدناه يمثلان الفواتير المعروضة فقط. للحصول على إحصائيات يوم كامل، يرجى اختيار <strong>فواتير يوم محدد</strong> أو زر <strong>تصدير السجل (Excel)</strong>.
                      </div>
                    </div>
                  )}

                  <div className="stats-cards-grid" style={{ marginBottom: '16px' }}>
                    <div className="stat-card">
                      <div className="stat-icon">🧾</div>
                      <div className="stat-data">
                        <span className="stat-label">عدد الفواتير</span>
                        <strong className="stat-number">{filteredOrders.length} فاتورة</strong>
                        <small>{orderDateMode === 'day' ? `لتاريخ ${orderDateFilter}` : (ordersList.length >= 500 ? 'أحدث 500 فاتورة معروضة' : 'كافة الفواتير المعروضة')}</small>
                      </div>
                    </div>

                    <div className="stat-card">
                      <div className="stat-icon">💰</div>
                      <div className="stat-data">
                        <span className="stat-label">إجمالي المبيعات</span>
                        <strong className="stat-number text-green">{totalSales.toLocaleString('ar-EG')} {settings.currency || 'ج.م'}</strong>
                        <small>{validOrders.length} فاتورة مسجلة</small>
                      </div>
                    </div>

                    <div className="stat-card">
                      <div className="stat-icon">💵</div>
                      <div className="stat-data">
                        <span className="stat-label">مبيعات كاش</span>
                        <strong className="stat-number">{cashSales.toLocaleString('ar-EG')} {settings.currency || 'ج.م'}</strong>
                        <small>دفع نقدي مباشر</small>
                      </div>
                    </div>

                    <div className="stat-card">
                      <div className="stat-icon">📱</div>
                      <div className="stat-data">
                        <span className="stat-label">محفظة فودافون كاش</span>
                        <strong className="stat-number">{walletSales.toLocaleString('ar-EG')} {settings.currency || 'ج.م'}</strong>
                        <small>تحويل على المحفظة</small>
                      </div>
                    </div>

                    {notebookOrders.length > 0 && (
                      <div className="stat-card" style={{ background: 'linear-gradient(135deg, rgba(239,68,68,0.1), rgba(220,38,38,0.05))', border: '1px solid rgba(239,68,68,0.3)' }}>
                        <div className="stat-icon">📝</div>
                        <div className="stat-data">
                          <span className="stat-label">فواتير النوتة (آجل)</span>
                          <strong className="stat-number text-danger">{notebookTotal.toLocaleString('ar-EG')} {settings.currency || 'ج.م'}</strong>
                          <small>{notebookOrders.length} فاتورة على النوتة</small>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="table-container">
                    <table className="custom-table">
                      <thead>
                        <tr>
                          <th>الوقت والتاريخ</th>
                          <th>الموظف والشيفت</th>
                          <th>نوع الطلب</th>
                          <th>العميل / الطاولة</th>
                          <th>الأصناف والكميات</th>
                          <th>طريقة الدفع / حالة النوتة</th>
                          <th>الإجمالي</th>
                          <th>الحالة</th>
                          <th>إجراءات</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredOrders.length === 0 ? (
                          <tr>
                            <td colSpan="9" className="text-center" style={{ padding: '30px' }}>
                              لا توجد فواتير مطابقة لهذا التحديد أو البحث 🔍
                            </td>
                          </tr>
                        ) : (
                          filteredOrders.map((ord) => {
                            const isNotebook = ord.order_type === 'notebook' || ord.payment_method === 'notebook';
                            const isPaidNotebook = isNotebook && ord.debt_status === 'paid';
                            const isPartialNotebook = isNotebook && ord.debt_status === 'partial';
                            const isUnpaidNotebook = isNotebook && (!ord.debt_status || ord.debt_status === 'unpaid');
                            const hasDebtPayments = ord.debt_payments && ord.debt_payments.length > 0;

                            return (
                              <tr key={ord.id} className={ord.status === 'cancelled' ? 'cancelled-row' : ''}>
                                <td>
                                  <div>{formatShiftTime(ord.created_at)}</div>
                                  <small style={{ color: 'var(--text-muted)' }}>{getLocalDateString(ord.created_at)}</small>
                                </td>
                                <td>
                                  <strong>{ord.cashier_name || currentUser?.name || 'كاشير'}</strong>
                                  <span className="badge-cat" style={{ display: 'block', marginTop: '2px', fontSize: '11px' }}>
                                    {ord.shift_name || currentUser?.shift_name || 'الشيفت الحالي'}
                                  </span>
                                </td>
                                <td>
                                  {ord.order_type === 'dine_in' && <span className="status-tag tag-success">☕ صالة</span>}
                                  {ord.order_type === 'takeaway' && <span className="status-tag">🛍️ تيك أواي</span>}
                                  {ord.order_type === 'delivery' && <span className="status-tag tag-warning">🛵 دليفري</span>}
                                  {ord.order_type === 'notebook' && <span className="status-tag tag-danger">📝 نوتة</span>}
                                </td>
                                <td>
                                  <strong>{ord.customer_name || (ord.table_name ? `طاولة ${ord.table_name}` : '-')}</strong>
                                  {ord.table_name && ord.customer_name && (
                                    <small style={{ display: 'block', color: 'var(--text-muted)' }}>طاولة {ord.table_name}</small>
                                  )}
                                  {ord.customer_phone && (
                                    <small style={{ display: 'block', color: 'var(--text-muted)', direction: 'ltr' }}>{ord.customer_phone}</small>
                                  )}
                                </td>
                                <td>
                                  <div className="order-items-snippet">
                                    {ord.items?.map((it, idx) => (
                                      <span key={idx} className="item-tag">
                                        {it.product_name || it.name} × {it.qty}
                                        {it.notes && <span style={{ color: '#b45309', marginRight: '4px', fontWeight: 'bold' }}>({it.notes})</span>}
                                      </span>
                                    ))}
                                  </div>
                                  {ord.notes && (
                                    <div style={{ fontSize: '11px', color: '#b45309', marginTop: '4px', fontWeight: 'bold' }}>
                                      📝 ملاحظة الفاتورة: {ord.notes}
                                    </div>
                                  )}
                                </td>
                                <td>
                                  {/* Payment method & Notebook status info */}
                                  {isNotebook ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                      {isPaidNotebook && (
                                        <span className="status-tag tag-success" style={{ fontWeight: '700' }}>
                                          🟢 تم السداد بالكامل
                                        </span>
                                      )}
                                      {isPartialNotebook && (
                                        <span className="status-tag tag-warning" style={{ fontWeight: '700' }}>
                                          🟡 سداد جزئي (متبقي: {ord.debt_remaining_amount} ج.م)
                                        </span>
                                      )}
                                      {isUnpaidNotebook && (
                                        <span className="status-tag tag-danger" style={{ fontWeight: '700' }}>
                                          🔴 على النوتة (غير مسددة)
                                        </span>
                                      )}

                                      {/* Payment transferred date note */}
                                      {hasDebtPayments && (
                                        <small style={{
                                          color: '#10b981',
                                          background: 'rgba(16,185,129,0.1)',
                                          padding: '2px 6px',
                                          borderRadius: '4px',
                                          fontSize: '11px',
                                          lineHeight: '1.4'
                                        }}>
                                          📌 مرحل سداد إلى: {new Date(ord.debt_payments[0].created_at).toLocaleDateString('ar-EG', { timeZone: 'Africa/Cairo' })} ({ord.debt_payments[0].amount} ج.م)
                                        </small>
                                      )}
                                    </div>
                                  ) : (
                                    <div>
                                      {ord.payment_method === 'cash' && '💵 نقدي (خزنة)'}
                                      {ord.payment_method === 'wallet' && '📱 فودافون كاش (محفظة)'}
                                      {ord.payment_method === 'split' && '🔀 مقسم (نقدي + محفظة)'}
                                    </div>
                                  )}
                                </td>
                                <td><strong className="text-green">{fmtMoney(ord.total)} {settings.currency || 'ج.م'}</strong></td>
                                <td>
                                  <span className={`status-tag ${ord.status === 'cancelled' ? 'tag-danger' : 'tag-success'}`}>
                                    {ord.status === 'cancelled' ? 'ملغي' : 'مكتمل'}
                                  </span>
                                </td>
                                <td>
                                  <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                    <button className="btn btn-sm btn-info" onClick={() => setReceiptOrder(ord)}>
                                      🖨️ الفاتورة
                                    </button>
                                    {isNotebook && ord.debt_id && ord.debt_remaining_amount > 0 && (
                                      <button
                                        className="btn btn-sm btn-primary"
                                        onClick={() => {
                                          const d = (Array.isArray(debtsList) ? debtsList : []).find((x) => x.id === ord.debt_id);
                                          if (d) {
                                            setPayDebtData(d);
                                            setPayAmountInput(d.remaining_amount);
                                            setPayNotesInput('');
                                          } else {
                                            loadDebts();
                                            setNotebookModal(true);
                                          }
                                        }}
                                        title="سداد هذه الفاتورة من النوتة"
                                      >
                                        💵 سداد
                                      </button>
                                    )}
                                    {ord.status !== 'cancelled' && (
                                      <button className="btn btn-sm btn-danger ml-1" onClick={() => handleCancelOrder(ord.id)}>
                                        إلغاء
                                      </button>
                                    )}
                                    {ord.status === 'cancelled' && (
                                      <button className="btn btn-sm btn-warning ml-1" onClick={() => handleRestoreOrder(ord.id)} title="استعادة الفاتورة وإلغاء حالة الإلغاء">
                                        🔄 استعادة
                                      </button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </>
              );
            })()}
          </div>
  );
}
