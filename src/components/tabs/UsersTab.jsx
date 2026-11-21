import React from 'react';
import SectionErrorBoundary from '../SectionErrorBoundary.jsx';
import { formatShiftTime, getLocalDateString } from '../../utils/dateTime.js';

export default function UsersTab({
  adjTypeFilter,
  adjUserFilter,
  adjustmentsList,
  attendanceData,
  attendanceDateFilter,
  attendanceDateMode,
  attendanceMonthFilter,
  attendanceUserFilter,
  handleDeleteAdjustment,
  handleDeleteUser,
  handleExportDailySales,
  handleExportPayroll,
  loadAdjustments,
  loadPayroll,
  loadUsersAndAttendance,
  payrollData,
  payrollMonth,
  setActiveTab,
  setAdjTypeFilter,
  setAdjUserFilter,
  setAdjustmentForm,
  setAdjustmentModal,
  setAttendanceDateFilter,
  setAttendanceDateMode,
  setAttendanceMonthFilter,
  setAttendanceUserFilter,
  setPayrollMonth,
  setSelectedPayrollDetails,
  setUserForm,
  setUserManagementTab,
  setUserModal,
  settings,
  shiftSchedules,
  userManagementTab,
  usersList
}) {
  return (
    <SectionErrorBoundary name="إدارة الموظفين والشيفتات" onFallback={() => setActiveTab('pos')}>
              <div className="users-view">
            <div className="view-header flex-between">
              <div>
                <h2>👥 إدارة الموظفين والشيفتات وسجل الحضور</h2>
                <p>إدارة حسابات الكاشيرات ومواعيد الشيفتات (3 شيفتات / 24 ساعة) وتتبع مبيعات وأوقات كل موظف</p>
              </div>
              <button
                className="btn btn-primary"
                onClick={() => {
                  setUserForm({
                    id: null,
                    username: '',
                    name: '',
                    password: '',
                    role: 'cashier',
                    phone: '',
                    shift_name: shiftSchedules[0]?.name || 'الشيفت الصباحي (الأول)',
                    shift_start: shiftSchedules[0]?.start || '08:00',
                    shift_end: shiftSchedules[0]?.end || '16:00',
                    salary: 3500,
                    pin: '',
                    assigned_halls: 'ALL'
                  });
                  setUserModal(true);
                }}
              >
                + إضافة موظف / كاشير جديد
              </button>
            </div>

            {/* Staff & Shift Statistics */}
            <div className="stats-cards-grid">
              <div className="stat-card">
                <div className="stat-icon">👥</div>
                <div className="stat-data">
                  <span className="stat-label">إجمالي طاقم العمل</span>
                  <strong className="stat-number">{usersList.length} موظف</strong>
                  <small>{usersList.filter((u) => u.role === 'admin').length} مدير - {usersList.filter((u) => u.role === 'cashier').length} كاشير</small>
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-icon">☀️</div>
                <div className="stat-data">
                  <span className="stat-label">الشيفت الصباحي (الأول)</span>
                  <strong className="stat-number">08:00 ص - 04:00 م</strong>
                  <small>{usersList.filter((u) => u.shift_name?.includes('الصباحي')).length} كاشير مسجل</small>
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-icon">🌆</div>
                <div className="stat-data">
                  <span className="stat-label">الشيفت المسائي (الثاني)</span>
                  <strong className="stat-number">04:00 م - 12:00 ص</strong>
                  <small>{usersList.filter((u) => u.shift_name?.includes('المسائي')).length} كاشير مسجل</small>
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-icon">🌙</div>
                <div className="stat-data">
                  <span className="stat-label">الشيفت الليلي (الثالث)</span>
                  <strong className="stat-number">12:00 ص - 08:00 ص</strong>
                  <small>{usersList.filter((u) => u.shift_name?.includes('الليلي')).length} كاشير مسجل</small>
                </div>
              </div>
            </div>

            {/* Subtabs for Users management */}
            <div className="halls-filter-bar" style={{ marginTop: '20px' }}>
              <button
                className={`hall-tab-btn ${userManagementTab === 'users' ? 'active' : ''}`}
                onClick={() => setUserManagementTab('users')}
              >
                <span className="tab-icon">👤</span>
                <span className="tab-text">حسابات الموظفين والكاشيرات</span>
                <span className="count-badge">{usersList.length}</span>
              </button>

              <button
                className={`hall-tab-btn ${userManagementTab === 'attendance' ? 'active' : ''}`}
                onClick={() => setUserManagementTab('attendance')}
              >
                <span className="tab-icon">📜</span>
                <span className="tab-text">سجل حضور الشيفتات والأرباح</span>
                <span className="count-badge">{attendanceData.shifts?.length || 0} شيفت</span>
              </button>

              <button
                className={`hall-tab-btn ${userManagementTab === 'adjustments' ? 'active' : ''}`}
                onClick={() => {
                  setUserManagementTab('adjustments');
                  loadAdjustments();
                }}
              >
                <span className="tab-icon">⚖️</span>
                <span className="tab-text">الخصومات والمكافآت وسجل الغياب</span>
                <span className="count-badge">{adjustmentsList.length} عملية</span>
              </button>

              <button
                className={`hall-tab-btn ${userManagementTab === 'payroll' ? 'active' : ''}`}
                onClick={() => {
                  setUserManagementTab('payroll');
                  loadPayroll(payrollMonth);
                }}
              >
                <span className="tab-icon">💰</span>
                <span className="tab-text">كشف الرواتب والمستحقات الشهرية</span>
                <span className="count-badge">{usersList.length} موظف</span>
              </button>
            </div>

            {/* Subtab 1: Users */}
            {userManagementTab === 'users' && (
              <div className="table-container">
                <table className="custom-table">
                  <thead>
                    <tr>
                      <th>الموظف</th>
                      <th>اسم المستخدم (Login)</th>
                      <th>الصلاحية</th>
                      <th>الشيفت ومواعيد العمل</th>
                      <th>💰 الراتب الشهري</th>
                      <th>رقم الهاتف</th>
                      <th>إجراءات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {usersList.map((u) => (
                      <tr key={u.id}>
                        <td>
                          <strong>{u.name}</strong>
                        </td>
                        <td><span className="badge-cat">@{u.username}</span></td>
                        <td>
                          <span className={`role-badge ${u.role === 'admin' ? 'role-admin' : 'role-cashier'}`}>
                            {u.role === 'admin' ? '👑 المدير العام' : '💼 موظف كاشير'}
                          </span>
                        </td>
                        <td>
                          <div className="shift-schedule-badge">
                            <strong>{u.shift_name || 'شيفت مخصص'}</strong>
                            <small style={{ display: 'block', color: 'var(--text-muted)' }}>({u.shift_start || '00:00'} إلى {u.shift_end || '23:59'})</small>
                          </div>
                        </td>
                        <td>
                          <strong className="text-green">{Number(u.salary || 3500).toLocaleString('ar-EG')} ج.م</strong>
                          <small style={{ display: 'block', color: 'var(--text-muted)' }}>
                            يومي: {Math.round((Number(u.salary || 3500) / 30) * 100) / 100} ج.م
                          </small>
                        </td>
                        <td>{u.phone || '-'}</td>
                        <td>
                          <button
                            className="btn btn-sm btn-warning"
                            onClick={() => {
                              setUserForm({
                                id: u.id,
                                username: u.username || '',
                                name: u.name || '',
                                password: '',
                                role: u.role || 'cashier',
                                phone: u.phone || '',
                                shift_name: u.shift_name || (shiftSchedules[0]?.name || 'الشيفت الصباحي (الأول)'),
                                shift_start: u.shift_start || '08:00',
                                shift_end: u.shift_end || '16:00',
                                salary: u.salary !== undefined && u.salary !== null ? u.salary : 3500,
                                pin: u.pin || '',
                                assigned_halls: u.assigned_halls || 'ALL'
                              });
                              setUserModal(true);
                            }}
                          >
                            تعديل
                          </button>
                          <button
                            className="btn btn-sm btn-primary ml-1"
                            onClick={() => {
                              setAdjustmentForm({
                                userId: u.id,
                                type: 'penalty',
                                amount: '',
                                daysCount: '1',
                                date: new Date().toISOString().slice(0, 10),
                                reason: ''
                              });
                              setAdjustmentModal(true);
                            }}
                            title="إضافة خصم أو مكافأة أو غياب لهذا الموظف"
                          >
                            ⚖️ جزاء/مكافأة
                          </button>
                          {u.role !== 'admin' && (
                            <button className="btn btn-sm btn-danger ml-1" onClick={() => handleDeleteUser(u.id)}>
                              حذف
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Subtab 2: Attendance */}
            {userManagementTab === 'attendance' && (
              <div className="attendance-view-section">
                {/* Attendance Controls Bar: Date Mode (Day vs Month) */}
                <div className="notebook-filter-bar flex-between" style={{ marginBottom: '20px', gap: '12px', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <div className="filter-chips">
                      <button
                        className={`filter-chip ${attendanceDateMode === 'day' ? 'active' : ''}`}
                        onClick={() => {
                          setAttendanceDateMode('day');
                          loadUsersAndAttendance(attendanceDateFilter);
                        }}
                      >
                        📅 سجل اليوم
                      </button>
                      <button
                        className={`filter-chip ${attendanceDateMode === 'month' ? 'active' : ''}`}
                        onClick={() => {
                          setAttendanceDateMode('month');
                          loadUsersAndAttendance(attendanceMonthFilter);
                        }}
                      >
                        🗓️ سجل الشهر
                      </button>
                      <button
                        className={`filter-chip ${attendanceDateMode === 'all' ? 'active' : ''}`}
                        onClick={() => {
                          setAttendanceDateMode('all');
                          loadUsersAndAttendance(null);
                        }}
                      >
                        🌐 كافة السجلات
                      </button>
                    </div>

                    {attendanceDateMode === 'day' && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <input
                          type="date"
                          value={attendanceDateFilter}
                          onChange={(e) => {
                            setAttendanceDateFilter(e.target.value);
                            loadUsersAndAttendance(e.target.value);
                          }}
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
                          onClick={() => {
                            const today = new Date().toISOString().slice(0, 10);
                            setAttendanceDateFilter(today);
                            loadUsersAndAttendance(today);
                          }}
                        >
                          اليوم
                        </button>
                      </div>
                    )}

                    {attendanceDateMode === 'month' && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <input
                          type="month"
                          value={attendanceMonthFilter}
                          onChange={(e) => {
                            setAttendanceMonthFilter(e.target.value);
                            loadUsersAndAttendance(e.target.value);
                          }}
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
                          onClick={() => {
                            const thisMonth = new Date().toISOString().slice(0, 7);
                            setAttendanceMonthFilter(thisMonth);
                            loadUsersAndAttendance(thisMonth);
                          }}
                        >
                          هذا الشهر
                        </button>
                      </div>
                    )}

                    {/* Filter by specific employee */}
                    <select
                      value={attendanceUserFilter}
                      onChange={(e) => setAttendanceUserFilter(e.target.value)}
                      style={{
                        padding: '8px 12px',
                        background: 'var(--bg-card)',
                        color: 'var(--text-main)',
                        border: '1px solid var(--border-color)',
                        borderRadius: 'var(--radius-md)',
                        fontSize: '14px'
                      }}
                    >
                      <option value="all">👥 جميع الموظفين</option>
                      {usersList.map((u) => (
                        <option key={u.id} value={u.id}>{u.name} ({u.role === 'admin' ? 'مدير' : 'كاشير'})</option>
                      ))}
                    </select>
                  </div>

                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={handleExportDailySales}
                      title="تصدير تقرير المبيعات والشيفتات إلى Excel / CSV"
                    >
                      📥 تصدير التقرير (Excel)
                    </button>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => loadUsersAndAttendance()}
                    >
                      🔄 تحديث السجل
                    </button>
                  </div>
                </div>

                {/* Attendance Summary Calculations */}
                {(() => {
                  const filteredShifts = (attendanceData.shifts || []).filter((s) => {
                    if (attendanceUserFilter !== 'all' && s.user_id !== Number(attendanceUserFilter)) return false;
                    return true;
                  });

                  const totalShiftsCount = filteredShifts.length;
                  const totalOrdersCount = filteredShifts.reduce((sum, s) => sum + (Number(s.orders_count) || 0), 0);
                  const totalSalesAmount = filteredShifts.reduce((sum, s) => sum + (Number(s.total_sales !== undefined ? s.total_sales : (s.cash_sales + (s.card_sales || 0) + (s.wallet_sales || 0))) || 0), 0);
                  const totalExpensesAmount = filteredShifts.reduce((sum, s) => sum + (Number(s.expenses_amount !== undefined ? s.expenses_amount : s.expenses_total) || 0), 0);
                  const totalCashSales = filteredShifts.reduce((sum, s) => sum + (Number(s.cash_sales_total !== undefined ? s.cash_sales_total : s.cash_sales) || 0), 0);

                  return (
                    <>
                      {/* Top Overall Summary Cards */}
                      <div className="stats-cards-grid" style={{ marginBottom: '20px' }}>
                        <div className="stat-card">
                          <div className="stat-icon">💰</div>
                          <div className="stat-data">
                            <span className="stat-label">
                              {attendanceDateMode === 'day' ? 'إجمالي مبيعات اليوم' : attendanceDateMode === 'month' ? 'إجمالي مبيعات الشهر' : 'إجمالي المبيعات'}
                            </span>
                            <strong className="stat-number text-green">{totalSalesAmount.toLocaleString('ar-EG')} {settings.currency || 'ج.م'}</strong>
                            <small>{totalOrdersCount} طلب في {totalShiftsCount} شيفت</small>
                          </div>
                        </div>

                        <div className="stat-card">
                          <div className="stat-icon">💵</div>
                          <div className="stat-data">
                            <span className="stat-label">المبيعات النقدية (كاش)</span>
                            <strong className="stat-number">{totalCashSales.toLocaleString('ar-EG')} {settings.currency || 'ج.م'}</strong>
                            <small>مبيعات كاش بالدرج</small>
                          </div>
                        </div>

                        <div className="stat-card">
                          <div className="stat-icon">💸</div>
                          <div className="stat-data">
                            <span className="stat-label">إجمالي المصروفات</span>
                            <strong className="stat-number text-danger">-{totalExpensesAmount.toLocaleString('ar-EG')} {settings.currency || 'ج.م'}</strong>
                            <small>مصروفات الفترة</small>
                          </div>
                        </div>

                        <div className="stat-card">
                          <div className="stat-icon">📈</div>
                          <div className="stat-data">
                            <span className="stat-label">صافي إيراد الفترة</span>
                            <strong className="stat-number text-green">{(totalSalesAmount - totalExpensesAmount).toLocaleString('ar-EG')} {settings.currency || 'ج.م'}</strong>
                            <small>المبيعات بعد خصم المصروفات</small>
                          </div>
                        </div>
                      </div>

                      {/* Per-Employee Summary Cards Grid */}
                      <div style={{ marginBottom: '24px' }}>
                        <h3 style={{ fontSize: '16px', marginBottom: '12px', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span>👥</span> مبيعات وإيراد كل كاشير وموظف ({attendanceDateMode === 'day' ? `ليوم ${attendanceDateFilter}` : attendanceDateMode === 'month' ? `لشهر ${attendanceMonthFilter}` : 'كافة الفترات'}):
                        </h3>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '14px' }}>
                          {usersList
                            .filter((u) => attendanceUserFilter === 'all' || u.id === Number(attendanceUserFilter))
                            .map((u) => {
                              const userShifts = filteredShifts.filter((s) => s.user_id === u.id);
                              const uSales = userShifts.reduce((sum, s) => sum + (Number(s.total_sales !== undefined ? s.total_sales : (s.cash_sales + (s.card_sales || 0) + (s.wallet_sales || 0))) || 0), 0);
                              const uOrders = userShifts.reduce((sum, s) => sum + (Number(s.orders_count) || 0), 0);

                              return (
                                <div key={u.id} style={{
                                  background: 'var(--bg-card)',
                                  border: '1px solid var(--border-color)',
                                  borderRadius: 'var(--radius-md)',
                                  padding: '14px 16px',
                                  display: 'flex',
                                  flexDirection: 'column',
                                  gap: '10px'
                                }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <span style={{ fontSize: '22px' }}>{u.role === 'admin' ? '👑' : '👤'}</span>
                                    <div>
                                      <strong style={{ fontSize: '15px', color: 'var(--text-main)' }}>{u.name}</strong>
                                      <small style={{ display: 'block', color: 'var(--text-muted)' }}>{u.shift_name || 'شيفت مخصص'}</small>
                                    </div>
                                  </div>

                                  <div style={{
                                    display: 'grid',
                                    gridTemplateColumns: '1fr 1fr',
                                    gap: '8px',
                                    background: 'rgba(255,255,255,0.03)',
                                    padding: '10px',
                                    borderRadius: 'var(--radius-sm)'
                                  }}>
                                    <div>
                                      <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>إجمالي المبيعات:</span>
                                      <strong className="text-green" style={{ fontSize: '16px' }}>{uSales.toLocaleString('ar-EG')} {settings.currency || 'ج.م'}</strong>
                                    </div>
                                    <div>
                                      <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>الشيفتات والطلبات:</span>
                                      <strong style={{ fontSize: '14px' }}>{userShifts.length} شيفت ({uOrders} طلب)</strong>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                        </div>
                      </div>

                      {/* Detailed Shifts Table */}
                      <div className="table-container">
                        <table className="custom-table">
                          <thead>
                            <tr>
                              <th>رقم الشيفت</th>
                              <th>اسم الموظف</th>
                              <th>نوع الشيفت</th>
                              <th>وقت الفتح (الدخول)</th>
                              <th>وقت الإغلاق (الخروج)</th>
                              <th>عدد الطلبات</th>
                              <th>مبيعات الشيفت</th>
                              <th>المصروفات</th>
                              <th>كاش الدرج الفعلي</th>
                              <th>العجز / الزيادة</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredShifts.length === 0 ? (
                              <tr>
                                <td colSpan="10" className="text-center" style={{ padding: '30px' }}>
                                  لا توجد سجلات شيفتات لهذا اليوم أو الشهر المحدد 🔍
                                </td>
                              </tr>
                            ) : (
                              filteredShifts.map((s) => {
                                const totalShiftSales = Number(s.total_sales !== undefined ? s.total_sales : (s.cash_sales + (s.card_sales || 0) + (s.wallet_sales || 0))) || 0;
                                const diff = (s.actual_cash !== null && s.actual_cash !== undefined) ? s.actual_cash - (s.closing_cash || s.opening_cash || 0) : 0;

                                return (
                                  <tr key={s.id}>
                                    <td>
                                      <strong style={{ fontSize: '15px', color: 'var(--primary)' }}>
                                        #SHIFT-{s.id}
                                      </strong>
                                    </td>
                                    <td>
                                      <strong>{s.user_name || 'كاشير'}</strong>
                                    </td>
                                    <td>
                                      <span className="badge-cat">{s.shift_type || 'الشيفت الصباحي'}</span>
                                    </td>
                                    <td>
                                      <div>{formatShiftTime(s.opened_at)}</div>
                                      <small style={{ color: 'var(--text-muted)' }}>{getLocalDateString(s.opened_at)}</small>
                                    </td>
                                    <td>
                                      {s.closed_at ? (
                                        <div>
                                          <div>{formatShiftTime(s.closed_at)}</div>
                                          <small style={{ color: 'var(--text-muted)' }}>{getLocalDateString(s.closed_at)}</small>
                                        </div>
                                      ) : (
                                        <span style={{ color: 'var(--primary)', fontWeight: '600' }}>مفتوح (لم يُغلق بعد)</span>
                                      )}
                                    </td>
                                    <td>
                                      <strong>{s.orders_count || 0} طلب</strong>
                                    </td>
                                    <td>
                                      <strong className="text-green" style={{ fontSize: '15px' }}>
                                        {totalShiftSales.toLocaleString('ar-EG')} {settings.currency || 'ج.م'}
                                      </strong>
                                    </td>
                                    <td>
                                      <span style={{ color: s.expenses_amount > 0 || s.expenses_total > 0 ? '#ef4444' : 'inherit' }}>
                                        {(s.expenses_amount !== undefined ? s.expenses_amount : s.expenses_total) || 0} {settings.currency || 'ج.م'}
                                      </span>
                                    </td>
                                    <td>
                                      {s.actual_cash !== null && s.actual_cash !== undefined ? (
                                        <strong>{s.actual_cash} {settings.currency || 'ج.م'}</strong>
                                      ) : (
                                        <span style={{ color: 'var(--text-muted)' }}>-</span>
                                      )}
                                    </td>
                                    <td>
                                      {s.actual_cash !== null && s.actual_cash !== undefined ? (
                                        <span className={`diff-tag ${diff < 0 ? 'text-danger' : 'text-green'}`} style={{ fontWeight: '700' }}>
                                          {diff > 0 ? `+${diff}` : diff} {settings.currency || 'ج.م'}
                                          {diff < 0 && ' (عجز)'}
                                          {diff > 0 && ' (زيادة)'}
                                          {diff === 0 && ' (متطابق)'}
                                        </span>
                                      ) : '-'}
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
            )}

            {/* Subtab 3: Employee Penalties, Bonuses, and Absence */}
            {userManagementTab === 'adjustments' && (
              <div className="adjustments-section">
                {/* Adjustments Statistics */}
                {(() => {
                  const filtered = adjustmentsList.filter((a) => {
                    if (adjUserFilter !== 'all' && a.user_id !== Number(adjUserFilter)) return false;
                    return true;
                  });
                  const totalBonuses = filtered.filter((a) => a.type === 'bonus').reduce((s, a) => s + (a.amount || 0), 0);
                  const totalPenalties = filtered.filter((a) => a.type === 'penalty').reduce((s, a) => s + (a.amount || 0), 0);
                  const totalAbsences = filtered.filter((a) => a.type === 'absence').reduce((s, a) => s + (a.days_count || 1), 0);
                  const netBalance = totalBonuses - totalPenalties;

                  return (
                    <div className="stats-cards-grid" style={{ marginBottom: '20px' }}>
                      <div className="stat-card">
                        <div className="stat-icon">🎁</div>
                        <div className="stat-data">
                          <span className="stat-label">إجمالي المكافآت الممنوحة</span>
                          <strong className="stat-number text-green">+{totalBonuses} {settings.currency || 'ج.م'}</strong>
                          <small>{filtered.filter((a) => a.type === 'bonus').length} مكافأة مسجلة</small>
                        </div>
                      </div>

                      <div className="stat-card">
                        <div className="stat-icon">🔻</div>
                        <div className="stat-data">
                          <span className="stat-label">إجمالي الخصومات والجزاءات</span>
                          <strong className="stat-number text-danger">-{totalPenalties} {settings.currency || 'ج.م'}</strong>
                          <small>{filtered.filter((a) => a.type === 'penalty').length} خصم مسجل</small>
                        </div>
                      </div>

                      <div className="stat-card">
                        <div className="stat-icon">❌</div>
                        <div className="stat-data">
                          <span className="stat-label">إجمالي أيام الغياب</span>
                          <strong className="stat-number" style={{ color: '#f59e0b' }}>{totalAbsences} يوم</strong>
                          <small>{filtered.filter((a) => a.type === 'absence').length} واقعة غياب مسجلة</small>
                        </div>
                      </div>

                      <div className="stat-card">
                        <div className="stat-icon">⚖️</div>
                        <div className="stat-data">
                          <span className="stat-label">صافي تسويات الرواتب</span>
                          <strong className={`stat-number ${netBalance >= 0 ? 'text-green' : 'text-danger'}`}>
                            {netBalance > 0 ? `+${netBalance}` : netBalance} {settings.currency || 'ج.م'}
                          </strong>
                          <small>الفارق بين المكافآت والخصومات</small>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* Filter and Add Bar */}
                <div className="notebook-filter-bar flex-between">
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <select
                      className="form-control"
                      style={{ padding: '8px 12px', background: 'var(--bg-card)', color: 'var(--text-main)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)' }}
                      value={adjUserFilter}
                      onChange={(e) => setAdjUserFilter(e.target.value)}
                    >
                      <option value="all">👥 جميع الموظفين</option>
                      {usersList.map((u) => (
                        <option key={u.id} value={u.id}>{u.name} ({u.role === 'admin' ? 'مدير' : 'كاشير'})</option>
                      ))}
                    </select>

                    <div className="filter-chips">
                      <button
                        className={`filter-chip ${adjTypeFilter === 'all' ? 'active' : ''}`}
                        onClick={() => setAdjTypeFilter('all')}
                      >
                        الكل ({adjustmentsList.length})
                      </button>
                      <button
                        className={`filter-chip ${adjTypeFilter === 'penalty' ? 'active' : ''}`}
                        onClick={() => setAdjTypeFilter('penalty')}
                      >
                        🔻 الخصومات ({adjustmentsList.filter((a) => a.type === 'penalty').length})
                      </button>
                      <button
                        className={`filter-chip ${adjTypeFilter === 'bonus' ? 'active' : ''}`}
                        onClick={() => setAdjTypeFilter('bonus')}
                      >
                        🎁 المكافآت ({adjustmentsList.filter((a) => a.type === 'bonus').length})
                      </button>
                      <button
                        className={`filter-chip ${adjTypeFilter === 'absence' ? 'active' : ''}`}
                        onClick={() => setAdjTypeFilter('absence')}
                      >
                        ❌ الغياب ({adjustmentsList.filter((a) => a.type === 'absence').length})
                      </button>
                    </div>
                  </div>

                  <button
                    className="btn btn-primary"
                    onClick={() => {
                      setAdjustmentForm({
                        userId: usersList[0]?.id || '',
                        type: 'penalty',
                        amount: '',
                        daysCount: '1',
                        date: new Date().toISOString().slice(0, 10),
                        reason: ''
                      });
                      setAdjustmentModal(true);
                    }}
                  >
                    + تسجيل خصم / مكافأة / غياب جديد
                  </button>
                </div>

                {/* Adjustments Table */}
                <div className="table-container">
                  <table className="custom-table">
                    <thead>
                      <tr>
                        <th>الموظف</th>
                        <th>نوع الإجراء</th>
                        <th>التاريخ المحدد</th>
                        <th>القيمة / عدد الأيام</th>
                        <th>السبب والملاحظات</th>
                        <th>سجل بواسطة</th>
                        <th>تاريخ التسجيل</th>
                        <th>إجراءات</th>
                      </tr>
                    </thead>
                    <tbody>
                      {adjustmentsList
                        .filter((a) => {
                          if (adjUserFilter !== 'all' && a.user_id !== Number(adjUserFilter)) return false;
                          if (adjTypeFilter !== 'all' && a.type !== adjTypeFilter) return false;
                          return true;
                        })
                        .map((a) => (
                          <tr key={a.id}>
                            <td>
                              <strong>{a.user_name}</strong>
                              <small style={{ display: 'block', color: 'var(--text-muted)' }}>
                                {a.user_role === 'admin' ? '👑 مدير' : '💼 كاشير'}
                              </small>
                            </td>
                            <td>
                              {a.type === 'penalty' && <span className="status-tag tag-danger">🔻 خصم مالي</span>}
                              {a.type === 'bonus' && <span className="status-tag tag-success">🎁 مكافأة مالية</span>}
                              {a.type === 'absence' && <span className="status-tag tag-warning">❌ تسجيل غياب</span>}
                            </td>
                            <td>
                              <strong>{a.date}</strong>
                            </td>
                            <td>
                              {a.type === 'penalty' && <strong className="text-danger">-{a.amount} {settings.currency || 'ج.م'}</strong>}
                              {a.type === 'bonus' && <strong className="text-green">+{a.amount} {settings.currency || 'ج.م'}</strong>}
                              {a.type === 'absence' && <strong style={{ color: '#f59e0b' }}>{a.days_count || 1} يوم غياب</strong>}
                            </td>
                            <td>
                              <span>{a.reason || '-'}</span>
                            </td>
                            <td>{a.created_by || 'المدير'}</td>
                            <td>{new Date(a.created_at || Date.now()).toLocaleDateString('ar-EG', { timeZone: 'Africa/Cairo' })}</td>
                            <td>
                              <button className="btn btn-sm btn-danger" onClick={() => handleDeleteAdjustment(a.id)}>
                                🗑️ حذف
                              </button>
                            </td>
                          </tr>
                        ))}
                      {adjustmentsList.length === 0 && (
                        <tr>
                          <td colSpan="8" className="text-center" style={{ padding: '30px' }}>
                            لا توجد سجلات خصومات أو مكافآت أو غياب مسجلة حتى الآن ✨
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Subtab 4: Monthly Payroll */}
            {userManagementTab === 'payroll' && (
              <div className="payroll-section">
                {/* Month selector */}
                <div className="notebook-filter-bar flex-between" style={{ marginBottom: '20px' }}>
                  <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                    <label style={{ fontWeight: '600', color: 'var(--text-main)' }}>📅 اختر الشهر:</label>
                    <input
                      type="month"
                      value={payrollMonth}
                      onChange={(e) => {
                        setPayrollMonth(e.target.value);
                        loadPayroll(e.target.value);
                      }}
                      style={{
                        padding: '8px 12px',
                        background: 'var(--bg-card)',
                        color: 'var(--text-main)',
                        border: '1px solid var(--border-color)',
                        borderRadius: 'var(--radius-md)',
                        fontSize: '14px'
                      }}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button className="btn btn-primary" onClick={handleExportPayroll} title="تصدير كشف الرواتب إلى ملف Excel / CSV">
                      📥 تصدير الكشف (Excel)
                    </button>
                    <button className="btn btn-secondary" onClick={() => loadPayroll(payrollMonth)}>
                      🔄 تحديث كشف الرواتب
                    </button>
                  </div>
                </div>

                {payrollData && (
                  <>
                    {/* Payroll Summary Cards */}
                    <div className="stats-cards-grid" style={{ marginBottom: '20px' }}>
                      <div className="stat-card">
                        <div className="stat-icon">💼</div>
                        <div className="stat-data">
                          <span className="stat-label">إجمالي الرواتب الأساسية</span>
                          <strong className="stat-number">{payrollData.totals.totalBaseSalaries.toLocaleString('ar-EG')} ج.م</strong>
                          <small>{payrollData.records.length} موظف</small>
                        </div>
                      </div>
                      <div className="stat-card">
                        <div className="stat-icon">🔻</div>
                        <div className="stat-data">
                          <span className="stat-label">إجمالي الخصومات والغياب</span>
                          <strong className="stat-number text-danger">
                            -{(payrollData.totals.totalAbsenceDeductions + payrollData.totals.totalPenalties).toLocaleString('ar-EG')} ج.م
                          </strong>
                          <small>غياب + جزاءات</small>
                        </div>
                      </div>
                      <div className="stat-card">
                        <div className="stat-icon">🎁</div>
                        <div className="stat-data">
                          <span className="stat-label">إجمالي المكافآت الممنوحة</span>
                          <strong className="stat-number text-green">+{payrollData.totals.totalBonuses.toLocaleString('ar-EG')} ج.م</strong>
                          <small>مكافآت الشهر</small>
                        </div>
                      </div>
                      <div className="stat-card" style={{ background: 'linear-gradient(135deg, rgba(16,185,129,0.15), rgba(5,150,105,0.1))' }}>
                        <div className="stat-icon">💰</div>
                        <div className="stat-data">
                          <span className="stat-label">صافي الرواتب المستحقة</span>
                          <strong className="stat-number text-green">{payrollData.totals.totalNetSalaries.toLocaleString('ar-EG')} ج.م</strong>
                          <small>المبلغ النهائي للصرف</small>
                        </div>
                      </div>
                    </div>

                    {/* Per-Employee Payroll Table */}
                    <div className="table-container">
                      <table className="custom-table">
                        <thead>
                          <tr>
                            <th>الموظف</th>
                            <th>الراتب الأساسي</th>
                            <th>سعر اليوم</th>
                            <th>أيام الغياب</th>
                            <th>خصم الغياب</th>
                            <th>🔻 جزاءات أخرى</th>
                            <th>🎁 مكافآت</th>
                            <th>إجمالي الخصومات</th>
                            <th>💰 صافي الراتب</th>
                            <th>التفاصيل</th>
                          </tr>
                        </thead>
                        <tbody>
                          {payrollData.records.map((rec) => (
                            <tr key={rec.userId} style={rec.netSalary < rec.baseSalary ? { background: 'rgba(239,68,68,0.04)' } : {}}>
                              <td>
                                <strong>{rec.userName}</strong>
                                <small style={{ display: 'block', color: 'var(--text-muted)' }}>
                                  {rec.userRole === 'admin' ? '👑 مدير' : '💼 كاشير'} — {rec.shiftName}
                                </small>
                              </td>
                              <td><strong>{rec.baseSalary.toLocaleString('ar-EG')} ج.م</strong></td>
                              <td><span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>{rec.dailyRate} ج.م/يوم</span></td>
                              <td>
                                {rec.absenceDays > 0
                                  ? <strong style={{ color: '#f59e0b' }}>{rec.absenceDays} يوم</strong>
                                  : <span className="text-green">✅ لا غياب</span>
                                }
                              </td>
                              <td>
                                {rec.absenceDeduction > 0
                                  ? <strong className="text-danger">-{rec.absenceDeduction} ج.م</strong>
                                  : <span>-</span>
                                }
                              </td>
                              <td>
                                {rec.penaltiesTotal > 0
                                  ? <strong className="text-danger">-{rec.penaltiesTotal} ج.م</strong>
                                  : <span>-</span>
                                }
                              </td>
                              <td>
                                {rec.bonusesTotal > 0
                                  ? <strong className="text-green">+{rec.bonusesTotal} ج.م</strong>
                                  : <span>-</span>
                                }
                              </td>
                              <td>
                                {rec.totalDeductions > 0
                                  ? <strong className="text-danger">-{rec.totalDeductions} ج.م</strong>
                                  : <span className="text-green">لا خصومات</span>
                                }
                              </td>
                              <td>
                                <strong className={`stat-number ${rec.netSalary >= rec.baseSalary ? 'text-green' : rec.netSalary > 0 ? '' : 'text-danger'}`}
                                  style={{ fontSize: '16px' }}>
                                  {rec.netSalary.toLocaleString('ar-EG')} ج.م
                                </strong>
                                {rec.netSalary !== rec.baseSalary && (
                                  <small style={{ display: 'block', color: rec.netSalary > rec.baseSalary ? 'var(--success)' : 'var(--danger)', fontSize: '11px' }}>
                                    {rec.netSalary > rec.baseSalary ? '▲' : '▼'} {Math.abs(rec.netSalary - rec.baseSalary)} ج.م عن الأساسي
                                  </small>
                                )}
                              </td>
                              <td>
                                <button
                                  className="btn btn-sm btn-secondary"
                                  onClick={() => setSelectedPayrollDetails(rec)}
                                >
                                  📋 تفاصيل
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}

                {!payrollData && (
                  <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>
                    <div style={{ fontSize: '48px', marginBottom: '16px' }}>💰</div>
                    <p>اختر الشهر واضغط "تحديث كشف الرواتب" لعرض بيانات الرواتب</p>
                  </div>
                )}
              </div>
            )}
            </div>
          </SectionErrorBoundary>
  );
}
