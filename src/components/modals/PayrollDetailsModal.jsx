import React from 'react';

export default function PayrollDetailsModal({
  onPrint,
  payrollMonth,
  selectedPayrollDetails,
  setSelectedPayrollDetails
}) {
  return (
    <div className="modal-overlay" onClick={() => setSelectedPayrollDetails(null)}>
          <div
            id="printable-payroll-details"
            className="modal-card notebook-modal-large printable-report-a4 printable-payroll-details"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '850px' }}
          >
            <div className="notebook-modal-header flex-between">
              <div>
                <h3 style={{ margin: 0, fontSize: '20px' }}>
                  📋 بيان وتفاصيل راتب: <span style={{ color: 'var(--primary)' }}>{selectedPayrollDetails.userName}</span>
                </h3>
                <p style={{ margin: '4px 0 0 0', color: 'var(--text-muted)', fontSize: '13px' }}>
                  كشف حساب شهر ({payrollMonth}) — {selectedPayrollDetails.userRole === 'admin' ? '👑 المدير العام' : '💼 موظف كاشير'} ({selectedPayrollDetails.shiftName})
                </p>
              </div>
              <button className="btn btn-secondary btn-sm" onClick={() => setSelectedPayrollDetails(null)}>✕ إغلاق</button>
            </div>

            {/* Quick Stat Cards */}
            <div className="stats-cards-grid" style={{ margin: '16px 0' }}>
              <div className="stat-card">
                <div className="stat-icon">💼</div>
                <div className="stat-data">
                  <span className="stat-label">الراتب الأساسي</span>
                  <strong className="stat-number">{selectedPayrollDetails.baseSalary.toLocaleString('ar-EG')} ج.م</strong>
                  <small>يومي: {selectedPayrollDetails.dailyRate} ج.م</small>
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-icon">❌</div>
                <div className="stat-data">
                  <span className="stat-label">خصم الغياب</span>
                  <strong className="stat-number text-danger">
                    -{selectedPayrollDetails.absenceDeduction.toLocaleString('ar-EG')} ج.م
                  </strong>
                  <small>{selectedPayrollDetails.absenceDays} يوم غياب</small>
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-icon">🔻</div>
                <div className="stat-data">
                  <span className="stat-label">خصومات وجزاءات</span>
                  <strong className="stat-number text-danger">
                    -{selectedPayrollDetails.penaltiesTotal.toLocaleString('ar-EG')} ج.م
                  </strong>
                  <small>{(selectedPayrollDetails.adjustments || []).filter((a) => a.type === 'penalty').length} واقعة</small>
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-icon">🎁</div>
                <div className="stat-data">
                  <span className="stat-label">المكافآت والتميز</span>
                  <strong className="stat-number text-green">
                    +{selectedPayrollDetails.bonusesTotal.toLocaleString('ar-EG')} ج.م
                  </strong>
                  <small>{(selectedPayrollDetails.adjustments || []).filter((a) => a.type === 'bonus').length} مكافأة</small>
                </div>
              </div>

              <div className="stat-card" style={{ background: 'linear-gradient(135deg, rgba(16,185,129,0.18), rgba(5,150,105,0.12))', border: '1px solid rgba(16,185,129,0.3)' }}>
                <div className="stat-icon">💰</div>
                <div className="stat-data">
                  <span className="stat-label">صافي الراتب المستحق</span>
                  <strong className="stat-number text-green" style={{ fontSize: '20px' }}>
                    {selectedPayrollDetails.netSalary.toLocaleString('ar-EG')} ج.م
                  </strong>
                  <small>المبلغ النهائي للصرف</small>
                </div>
              </div>
            </div>

            {/* Adjustments & Events Table */}
            <div style={{ marginTop: '16px' }}>
              <h4 style={{ margin: '0 0 10px 0', fontSize: '15px' }}>📜 سجل العمليات والتعديلات المسجلة خلال الشهر:</h4>
              <div className="table-container" style={{ maxHeight: '280px', overflowY: 'auto' }}>
                <table className="custom-table">
                  <thead>
                    <tr>
                      <th>نوع الإجراء</th>
                      <th>التاريخ</th>
                      <th>القيمة / الأيام</th>
                      <th>السبب والملاحظات</th>
                      <th>سجل بواسطة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {!selectedPayrollDetails.adjustments || selectedPayrollDetails.adjustments.length === 0 ? (
                      <tr>
                        <td colSpan="5" className="text-center" style={{ padding: '24px', color: 'var(--text-muted)' }}>
                          ✨ لا توجد أي خصومات أو جزاءات أو غياب مسجل لهذا الموظف خلال هذا الشهر (الراتب كامل بدون استقطاعات).
                        </td>
                      </tr>
                    ) : (
                      selectedPayrollDetails.adjustments.map((a, idx) => (
                        <tr key={idx}>
                          <td>
                            {a.type === 'penalty' && <span className="status-tag tag-danger">🔻 خصم مالي</span>}
                            {a.type === 'bonus' && <span className="status-tag tag-success">🎁 مكافأة تميز</span>}
                            {a.type === 'absence' && <span className="status-tag tag-warning">❌ تسجيل غياب</span>}
                          </td>
                          <td><strong>{a.date}</strong></td>
                          <td>
                            {a.type === 'penalty' && <strong className="text-danger">-{a.amount} ج.م</strong>}
                            {a.type === 'bonus' && <strong className="text-green">+{a.amount} ج.م</strong>}
                            {a.type === 'absence' && (
                              <span style={{ color: '#f59e0b', fontWeight: 'bold' }}>
                                {a.days_count || 1} يوم (-{Math.round((a.days_count || 1) * selectedPayrollDetails.dailyRate * 100) / 100} ج.م)
                              </span>
                            )}
                          </td>
                          <td><span>{a.reason || '-'}</span></td>
                          <td>{a.created_by || 'المدير'}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="modal-actions" style={{ marginTop: '16px' }}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  if (onPrint) {
                    onPrint();
                  } else {
                    window.print();
                  }
                }}
              >
                🖨️ طباعة كشف الراتب
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setSelectedPayrollDetails(null)}>
                إغلاق
              </button>
            </div>
          </div>
        </div>
  );
}
