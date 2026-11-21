import React from 'react';
import { formatShiftTime } from '../../utils/dateTime.js';

export default function ExpensesLogModal({
  currentUser,
  expenseFilterMode,
  expenseFromDate,
  expenseList,
  expenseToDate,
  handleDeleteExpense,
  loadExpensesList,
  setEditExpenseForm,
  setEditingExpense,
  setExpenseFilterMode,
  setExpenseForm,
  setExpenseFromDate,
  setExpenseModal,
  setExpensesModal,
  setExpensesPrintData,
  setExpenseToDate,
  settings,
  shift
}) {
  return (
    <div className="modal-overlay" onClick={() => setExpensesModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '820px', width: '95%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
              <div>
                <h3 style={{ margin: 0 }}>📋 سجل وإدارة المصروفات</h3>
                <small style={{ color: 'var(--text-muted)' }}>
                  {currentUser?.role === 'admin' && expenseFilterMode === 'range'
                    ? `إجمالي المصروفات من (${expenseFromDate}) إلى (${expenseToDate}): `
                    : (currentUser?.role === 'admin' && expenseFilterMode === 'all'
                      ? 'إجمالي كافة المصروفات المسجلة: '
                      : `إجمالي مصروفات الشيفت الحالي (${shift?.shift_type || currentUser?.shift_name || 'الشيفت الحالي'}): `)}
                  <strong style={{ color: '#ef4444' }}>
                    {expenseList.reduce((sum, e) => sum + (Number(e.amount) || 0), 0)} {settings.currency || 'ج.م'}
                  </strong>
                </small>
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                {currentUser?.role === 'admin' && (
                  <div className="filter-chips" style={{ margin: 0 }}>
                    <button
                      type="button"
                      className={`filter-chip ${expenseFilterMode === 'shift' ? 'active' : ''}`}
                      onClick={() => {
                        setExpenseFilterMode('shift');
                        loadExpensesList(shift?.id || null);
                      }}
                      style={{ padding: '4px 10px', fontSize: '12px' }}
                    >
                      🕒 الشيفت الحالي
                    </button>
                    <button
                      type="button"
                      className={`filter-chip ${expenseFilterMode === 'range' ? 'active' : ''}`}
                      onClick={() => {
                        setExpenseFilterMode('range');
                        loadExpensesList(null, expenseFromDate, expenseToDate);
                      }}
                      style={{ padding: '4px 10px', fontSize: '12px' }}
                    >
                      📅 تحديد فترة (أيام)
                    </button>
                    <button
                      type="button"
                      className={`filter-chip ${expenseFilterMode === 'all' ? 'active' : ''}`}
                      onClick={() => {
                        setExpenseFilterMode('all');
                        loadExpensesList(null);
                      }}
                      style={{ padding: '4px 10px', fontSize: '12px' }}
                    >
                      🗓️ كافة المصروفات
                    </button>
                  </div>
                )}
                {expenseList.length > 0 && (
                  <button
                    type="button"
                    className="btn btn-info btn-sm"
                    style={{ fontWeight: 'bold' }}
                    onClick={() => {
                      setExpensesPrintData({
                        isSingle: false,
                        items: expenseList,
                        total: expenseList.reduce((sum, e) => sum + (Number(e.amount) || 0), 0)
                      });
                    }}
                    title="طباعة بيان وتفاصيل كافة المصروفات على الطابعة"
                  >
                    🖨️ طباعة بيان
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-warning btn-sm"
                  onClick={() => {
                    setExpenseForm({ amount: '', category: 'مشتريات خامات (بن/حليب/سكر/مستلزمات)', notes: '' });
                    setExpenseModal(true);
                  }}
                >
                  ➕ تسجيل مصروف جديد
                </button>
              </div>
            </div>

            {/* Date Range Picker Bar (Shown when range filter is active) */}
            {currentUser?.role === 'admin' && expenseFilterMode === 'range' && (
              <div style={{
                background: 'rgba(200, 125, 50, 0.08)',
                border: '1.5px solid var(--border-color)',
                borderRadius: '10px',
                padding: '10px 14px',
                marginBottom: '16px',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                flexWrap: 'wrap'
              }}>
                <span style={{ fontWeight: 'bold', fontSize: '13px' }}>📅 تحديد فترة المصروفات:</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>من:</span>
                  <input
                    type="date"
                    value={expenseFromDate}
                    onChange={(e) => {
                      const newFrom = e.target.value;
                      setExpenseFromDate(newFrom);
                      loadExpensesList(null, newFrom, expenseToDate);
                    }}
                    style={{ padding: '6px 10px', borderRadius: '6px', fontSize: '12.5px', border: '1px solid var(--border-color)' }}
                  />
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>إلى:</span>
                  <input
                    type="date"
                    value={expenseToDate}
                    onChange={(e) => {
                      const newTo = e.target.value;
                      setExpenseToDate(newTo);
                      loadExpensesList(null, expenseFromDate, newTo);
                    }}
                    style={{ padding: '6px 10px', borderRadius: '6px', fontSize: '12.5px', border: '1px solid var(--border-color)' }}
                  />
                </div>
                <div style={{ display: 'flex', gap: '6px', marginRight: 'auto' }}>
                  {[
                    ['اليوم', () => {
                      const today = new Date().toISOString().slice(0, 10);
                      setExpenseFromDate(today);
                      setExpenseToDate(today);
                      loadExpensesList(null, today, today);
                    }],
                    ['آخر 7 أيام', () => {
                      const to = new Date().toISOString().slice(0, 10);
                      const d = new Date();
                      d.setDate(d.getDate() - 7);
                      const from = d.toISOString().slice(0, 10);
                      setExpenseFromDate(from);
                      setExpenseToDate(to);
                      loadExpensesList(null, from, to);
                    }],
                    ['أول الشهر إلى اليوم', () => {
                      const now = new Date();
                      const from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
                      const to = now.toISOString().slice(0, 10);
                      setExpenseFromDate(from);
                      setExpenseToDate(to);
                      loadExpensesList(null, from, to);
                    }]
                  ].map(([label, action], i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={action}
                      style={{
                        padding: '4px 10px',
                        borderRadius: '6px',
                        fontSize: '11.5px',
                        background: 'var(--bg-card)',
                        border: '1px solid var(--border-color)',
                        cursor: 'pointer',
                        color: 'var(--text-main)'
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {expenseList.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                <p>
                  {expenseFilterMode === 'shift' && shift?.id
                    ? 'لا توجد أي مصروفات مسجلة في هذا الشيفت حتى الآن ✨'
                    : 'لا توجد أي مصروفات مسجلة 🔍'}
                </p>
              </div>
            ) : (
              <div style={{ maxHeight: '380px', overflowY: 'auto' }}>
                <table className="custom-table" style={{ width: '100%', fontSize: '13px' }}>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>بند / صنف المصروف</th>
                      <th>المبلغ</th>
                      <th>الموظف</th>
                      <th>ملاحظات</th>
                      <th style={{ textAlign: 'center' }}>إجراءات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {expenseList.map((exp, idx) => (
                      <tr key={exp.id || idx}>
                        <td>{idx + 1}</td>
                        <td><strong>{exp.category || exp.description || 'مصروف عام'}</strong></td>
                        <td style={{ color: '#ef4444', fontWeight: 'bold' }}>{exp.amount} {settings.currency || 'ج.م'}</td>
                        <td>👤 {exp.user_name || 'كاشير'}</td>
                        <td style={{ color: '#94a3b8', fontSize: '12px' }}>{exp.notes || formatShiftTime(exp.created_at)}</td>
                        <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                          <button
                            type="button"
                            className="btn btn-outline-info btn-sm"
                            onClick={() => {
                              setExpensesPrintData({
                                isSingle: true,
                                item: exp
                              });
                            }}
                            style={{ fontSize: '11.5px', padding: '3px 8px', marginLeft: '6px' }}
                            title="طباعة سند صرف نقدية لهذا المصروف"
                          >
                            🖨️ سند
                          </button>
                          <button
                            type="button"
                            className="btn btn-outline-light btn-sm"
                            onClick={() => {
                              setEditExpenseForm({
                                id: exp.id,
                                amount: exp.amount,
                                category: exp.category || 'مشتريات خامات (بن/حليب/سكر/مستلزمات)',
                                notes: exp.notes || ''
                              });
                              setEditingExpense(exp);
                            }}
                            style={{ fontSize: '11.5px', padding: '3px 8px', marginLeft: '6px' }}
                            title="تعديل وتغيير الصنف أو المبلغ"
                          >
                            ✏️ تعديل
                          </button>
                          <button
                            type="button"
                            className="btn btn-outline-danger btn-sm"
                            onClick={() => handleDeleteExpense(exp.id)}
                            style={{ fontSize: '11.5px', padding: '3px 8px' }}
                            title="حذف هذا المصروف وإرجاع المبلغ للخزينة"
                          >
                            🗑️
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="modal-actions" style={{ marginTop: '16px' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setExpensesModal(false)}>
                إغلاق
              </button>
            </div>
          </div>
        </div>
  );
}
