import React from 'react';

export default function NotebookModal({
  debtFilter,
  debtSearch,
  debtViewMode,
  debtsGroupedList,
  debtsList,
  setAdminPasswordInput,
  setDebtFilter,
  setDebtSearch,
  setDebtViewMode,
  setDeleteDebtData,
  setNotebookModal,
  setPayAmountInput,
  setPayCustomerAmountInput,
  setPayCustomerModalData,
  setPayCustomerNotesInput,
  setPayDebtData,
  setPayNotesInput,
  setViewCustomerDetails,
  settings
}) {
  return (
    <div className="modal-overlay" onClick={() => setNotebookModal(false)}>
          <div className="modal-card notebook-modal-large" onClick={(e) => e.stopPropagation()}>
            <div className="notebook-modal-header flex-between">
              <div>
                <h3>📝 دفتر النوتة والآجل (حسابات الزبائن)</h3>
                <p>متابعة الفواتير الآجلة، تسجيل سداد المبالغ لحساب اليومية، وإدارة حسابات الزبائن</p>
              </div>
              <button className="btn btn-secondary btn-sm" onClick={() => setNotebookModal(false)}>✕ إغلاق</button>
            </div>

            {/* Notebook Statistics */}
            {(() => {
              const safeDebts = Array.isArray(debtsList) ? debtsList : [];
              const totalUnpaid = safeDebts.filter((d) => d.status !== 'paid').reduce((s, d) => s + (d.remaining_amount || 0), 0);
              const totalCollected = safeDebts.reduce((s, d) => s + (d.paid_amount || 0), 0);
              const activeCount = safeDebts.filter((d) => d.status !== 'paid').length;
              return (
                <div className="notebook-stats-grid">
                  <div className="stat-card">
                    <div className="stat-icon">💰</div>
                    <div className="stat-data">
                      <span className="stat-label">إجمالي الديون المتبقية على الزبائن</span>
                      <strong className="stat-number text-danger">{totalUnpaid} {settings.currency || 'ج.م'}</strong>
                      <small>{activeCount} زبون متبقي عليه مبالغ</small>
                    </div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-icon">📥</div>
                    <div className="stat-data">
                      <span className="stat-label">إجمالي المبالغ المسددة والمحصلة</span>
                      <strong className="stat-number text-green">{totalCollected} {settings.currency || 'ج.م'}</strong>
                      <small>تدخل مباشرة في كاش ويومية الكافيه</small>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Search and Filters */}
            <div className="notebook-filter-bar flex-between">
              <div className="search-box-notebook">
                <input
                  type="text"
                  placeholder="🔍 ابحث باسم الزبون أو رقم الهاتف أو الطاولة..."
                  value={debtSearch}
                  onChange={(e) => setDebtSearch(e.target.value)}
                />
              </div>

              {(() => {
                const safeDebts = Array.isArray(debtsList) ? debtsList : [];
                const safeGrouped = Array.isArray(debtsGroupedList) ? debtsGroupedList : [];
                return (
                  <div className="filter-chips">
                    <button
                      className={`filter-chip ${debtViewMode === 'by_date' ? 'active' : ''}`}
                      onClick={() => setDebtViewMode('by_date')}
                    >
                      📅 حسب التاريخ
                    </button>
                    <button
                      className={`filter-chip ${debtViewMode === 'by_customer' ? 'active' : ''}`}
                      onClick={() => setDebtViewMode('by_customer')}
                    >
                      👥 حسب العميل ({safeGrouped.length})
                    </button>
                    {debtViewMode === 'by_date' && (
                      <>
                        <button
                          className={`filter-chip ${debtFilter === 'all' ? 'active' : ''}`}
                          onClick={() => setDebtFilter('all')}
                        >
                          الكل ({safeDebts.length})
                        </button>
                        <button
                          className={`filter-chip ${debtFilter === 'unpaid' ? 'active' : ''}`}
                          onClick={() => setDebtFilter('unpaid')}
                        >
                          🔴 غير مسدد ({safeDebts.filter((d) => d.status === 'unpaid').length})
                        </button>
                        <button
                          className={`filter-chip ${debtFilter === 'partial' ? 'active' : ''}`}
                          onClick={() => setDebtFilter('partial')}
                        >
                          🟡 مسدد جزئياً ({safeDebts.filter((d) => d.status === 'partial').length})
                        </button>
                        <button
                          className={`filter-chip ${debtFilter === 'paid' ? 'active' : ''}`}
                          onClick={() => setDebtFilter('paid')}
                        >
                          🟢 تم السداد ({safeDebts.filter((d) => d.status === 'paid').length})
                        </button>
                      </>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* Debts Table */}
            <div className="table-container notebook-table-container">
              {debtViewMode === 'by_date' ? (
                <table className="custom-table">
                  <thead>
                    <tr>
                      <th>الزبون / الحساب</th>
                      <th>رقم الهاتف</th>
                      <th>الطاولة / التاريخ</th>
                      <th>المبلغ الكلي</th>
                      <th>المدفوع</th>
                      <th>المتبقي عليه</th>
                      <th>الحالة</th>
                      <th>إجراءات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(Array.isArray(debtsList) ? debtsList : [])
                      .filter((d) => {
                        if (debtFilter === 'unpaid') return d.status === 'unpaid';
                        if (debtFilter === 'partial') return d.status === 'partial';
                        if (debtFilter === 'paid') return d.status === 'paid';
                        return true;
                      })
                      .filter((d) => {
                        if (!debtSearch.trim()) return true;
                        const q = debtSearch.toLowerCase();
                        return (
                          (d.customer_name && d.customer_name.toLowerCase().includes(q)) ||
                          (d.customer_phone && d.customer_phone.includes(q)) ||
                          (d.table_name && d.table_name.toLowerCase().includes(q))
                        );
                      })
                      .map((d) => (
                        <tr key={d.id}>
                          <td>
                            <strong>{d.customer_name}</strong>
                            {d.notes && <small style={{ display: 'block', color: 'var(--text-muted)' }}>{d.notes}</small>}
                          </td>
                          <td>{d.customer_phone || '-'}</td>
                          <td>
                            <div>{d.table_name ? `طاولة: ${d.table_name}` : 'طلب خارجي'}</div>
                            <small style={{ color: 'var(--text-muted)' }}>
                              {new Date(d.created_at).toLocaleString('ar-EG', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                            </small>
                          </td>
                          <td><strong>{d.total_amount} {settings.currency || 'ج.م'}</strong></td>
                          <td className="text-green">{d.paid_amount || 0} {settings.currency || 'ج.م'}</td>
                          <td>
                            <strong className={d.remaining_amount > 0 ? 'text-danger' : 'text-green'}>
                              {d.remaining_amount} {settings.currency || 'ج.م'}
                            </strong>
                          </td>
                          <td>
                            <span className={`status-tag ${d.status === 'paid' ? 'tag-success' : (d.status === 'partial' ? 'tag-warning' : 'tag-danger')}`}>
                              {d.status === 'paid' ? '🟢 تم السداد' : (d.status === 'partial' ? '🟡 سداد جزئي' : '🔴 غير مسدد')}
                            </span>
                          </td>
                          <td>
                            <div className="table-actions-cell">
                              {d.remaining_amount > 0 && (
                                <button
                                  className="btn btn-sm btn-primary"
                                  onClick={() => {
                                    setPayDebtData(d);
                                    setPayAmountInput(d.remaining_amount);
                                    setPayNotesInput('');
                                  }}
                                >
                                  💵 سداد
                                </button>
                              )}
                              <button
                                className="btn btn-sm btn-danger ml-1"
                                onClick={() => {
                                  setDeleteDebtData(d);
                                  setAdminPasswordInput('');
                                }}
                                title="يتطلب كلمة مرور الأدمن"
                              >
                                🗑️ مسح
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    {(!Array.isArray(debtsList) || debtsList.length === 0) && (
                      <tr>
                        <td colSpan="8" className="text-center" style={{ padding: '30px' }}>
                          لا توجد حسابات مسجلة في النوتة حتى الآن ✨
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              ) : (
                <table className="custom-table">
                  <thead>
                    <tr>
                      <th>العميل</th>
                      <th>رقم الهاتف</th>
                      <th>عدد الفواتير</th>
                      <th>إجمالي المبالغ</th>
                      <th>المدفوع</th>
                      <th>المتبقي</th>
                      <th>إجراءات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(Array.isArray(debtsGroupedList) ? debtsGroupedList : [])
                      .filter((c) => {
                        if (!debtSearch.trim()) return true;
                        const q = debtSearch.toLowerCase();
                        return (
                          (c.customer_name && c.customer_name.toLowerCase().includes(q)) ||
                          (c.customer_phone && c.customer_phone.includes(q))
                        );
                      })
                      .map((customer) => (
                        <tr key={customer.customer_id || customer.customer_name}>
                          <td>
                            <strong>{customer.customer_name}</strong>
                          </td>
                          <td>{customer.customer_phone || '-'}</td>
                          <td className="text-center">{customer.debt_count}</td>
                          <td><strong>{customer.total_amount.toFixed(2)} {settings.currency || 'ج.م'}</strong></td>
                          <td className="text-green">{customer.total_paid.toFixed(2)} {settings.currency || 'ج.م'}</td>
                          <td>
                            <strong className={customer.total_remaining > 0 ? 'text-danger' : 'text-green'}>
                              {customer.total_remaining.toFixed(2)} {settings.currency || 'ج.م'}
                            </strong>
                          </td>
                          <td>
                            <div className="table-actions-cell">
                              {Number(customer.total_remaining) > 0 && (
                                <button
                                  className="btn btn-sm btn-success"
                                  style={{ background: 'linear-gradient(135deg, #10b981, #059669)', color: '#fff', border: 'none', marginLeft: '6px' }}
                                  onClick={() => {
                                    setPayCustomerModalData(customer);
                                    setPayCustomerAmountInput(customer.total_remaining);
                                    setPayCustomerNotesInput('');
                                  }}
                                  title="سداد مباشر لكافة حساب العميل"
                                >
                                  💵 سداد الحساب
                                </button>
                              )}
                              <button
                                className="btn btn-sm btn-primary"
                                onClick={() => setViewCustomerDetails(customer)}
                                title="عرض تفاصيل العميل"
                              >
                                📋 التفاصيل
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    {(!Array.isArray(debtsGroupedList) || debtsGroupedList.length === 0) && (
                      <tr>
                        <td colSpan="7" className="text-center" style={{ padding: '30px' }}>
                          لا توجد عملاء لديهم ديون ✨
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
  );
}
