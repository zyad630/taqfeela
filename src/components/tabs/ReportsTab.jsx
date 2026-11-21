import React from 'react';
import SectionErrorBoundary from '../SectionErrorBoundary.jsx';
import { formatCairoDateTime, formatShiftTime, getLocalDateString, getShiftDisplayName } from '../../utils/dateTime.js';

export default function ReportsTab({
  allShiftsList,
  currentUser,
  dashboardData,
  filteredShiftsList,
  handleDeleteExpense,
  handleExportCsv,
  handleGenerateReport,
  handleQuickDate,
  handleViewReceipt,
  invProductFilter,
  inventoryFilterMode,
  inventorySearch,
  loadAllShifts,
  loadDashboard,
  loadUsersAndAttendance,
  reportData,
  reportDateFrom,
  reportDatePreset,
  reportDateTo,
  reportLoading,
  reportShiftDateFilter,
  reportShiftDateMode,
  reportShiftId,
  reportShiftTypeFilter,
  reportShiftUserFilter,
  reportUserId,
  reportsTab,
  selectedDailyShiftIds,
  setActiveReportForPrint,
  setActiveTab,
  setEditExpenseForm,
  setEditingExpense,
  setExpenseModal,
  setInvProductFilter,
  setInventoryFilterMode,
  setInventorySearch,
  setPrintReportFormat,
  setReportData,
  setReportDateFrom,
  setReportDatePreset,
  setReportDateTo,
  setReportShiftDateFilter,
  setReportShiftDateMode,
  setReportShiftId,
  setReportShiftTypeFilter,
  setReportShiftUserFilter,
  setReportUserId,
  setReportsTab,
  setSelectedDailyShiftIds,
  setShiftReportSection,
  settings,
  shift,
  shiftReportSection,
  showToast,
  usersList
}) {
  return (
    <SectionErrorBoundary name="التقارير والإحصائيات" onFallback={() => setActiveTab('pos')}>
            <div className="reports-view">
            <div className="view-header flex-between">
              <div>
                <h2>📊 التقارير والإحصائيات</h2>
                <p>اختر نوع التقرير ثم حدد الفترة أو الشيفت</p>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  className="btn btn-outline-light btn-sm"
                  onClick={async () => {
                    await loadUsersAndAttendance();
                    await loadAllShifts();
                    await handleGenerateReport(reportsTab);
                    showToast('🔄 تم تحديث كافة بيانات وإحصائيات التقارير');
                  }}
                  title="تحديث فوري لجميع أقسام وبيانات التقارير والموظفين"
                >
                  🔄 تحديث البيانات
                </button>
                {(reportData || reportsTab === 'quick') && (
                  <>
                    <button type="button" className="btn btn-outline-light btn-sm" onClick={() => setActiveReportForPrint(reportsTab)}>
                      🖨️ طباعة
                    </button>
                    <button type="button" className="btn btn-outline-light btn-sm" onClick={handleExportCsv}>
                      📥 تصدير CSV
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Report Type Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${currentUser?.role === 'admin' ? 6 : 4}, 1fr)`, gap: '12px', marginBottom: '24px' }}>
              {[
                { key: 'quick', icon: '⚡', label: 'ملخص اليوم', color: '#6366f1' },
                { key: 'sales', icon: '💰', label: 'تقرير المبيعات', color: '#f59e0b' },
                { key: 'shifts', icon: '⏱️', label: 'تقرير الشيفت', color: '#10b981' },
                { key: 'inventory', icon: '📦', label: 'تقرير المخزون', color: '#3b82f6' },
                ...(currentUser?.role === 'admin' ? [
                  { key: 'daily_summary', icon: '📊', label: 'تقرير اليوم الشامل', color: '#8b5cf6' },
                  { key: 'cancellations', icon: '🚫', label: 'تقرير الإلغاءات', color: '#dc2626' }
                ] : [])
              ].map(({ key, icon, label, color }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    setReportsTab(key);
                    if (key === 'quick') {
                      loadDashboard();
                    } else if (key === 'sales') {
                      setReportData(null);
                      handleGenerateReport('sales');
                    } else if (key === 'shifts') {
                      setReportData(null);
                      const targetShiftId = reportShiftId || (shift?.id) || (allShiftsList?.[0]?.id);
                      if (targetShiftId) {
                        setReportShiftId(targetShiftId);
                        handleGenerateReport('shifts');
                      }
                    } else if (key === 'inventory') {
                      setReportData(null);
                      handleGenerateReport('inventory');
                    } else if (key === 'daily_summary') {
                      setReportData(null);
                      handleGenerateReport('daily_summary');
                    } else if (key === 'cancellations') {
                      setReportData(null);
                      handleGenerateReport('cancellations');
                    }
                  }}
                  className={`report-tab-card ${reportsTab === key ? 'active' : ''}`}
                  style={{
                    background: reportsTab === key ? color : 'var(--bg-card, #1e293b)',
                    border: `2px solid ${reportsTab === key ? color : 'var(--border-color, rgba(255,255,255,0.08))'}`,
                    borderRadius: '14px',
                    padding: '18px 12px',
                    cursor: 'pointer',
                    color: reportsTab === key ? '#fff' : 'var(--text-main, #fff)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '8px',
                    transition: 'all 0.2s',
                    boxShadow: reportsTab === key ? `0 4px 20px ${color}40` : 'none',
                    transform: reportsTab === key ? 'translateY(-2px)' : 'none',
                  }}
                >
                  <span style={{ fontSize: '28px' }}>{icon}</span>
                  <span style={{ fontSize: '13px', fontWeight: reportsTab === key ? '800' : '600' }}>{label}</span>
                  {reportsTab === key && (
                    <span className="active-report-badge">✓ التقرير المعروض</span>
                  )}
                </button>
              ))}
            </div>

            {/* Filter Bar for sales */}
            {reportsTab === 'sales' && (
              <div style={{
                background: 'var(--bg-card, #1e293b)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '14px',
                padding: '16px 20px',
                marginBottom: '20px',
                display: 'flex',
                flexDirection: 'column',
                gap: '14px',
                boxShadow: '0 4px 16px rgba(0,0,0,0.2)'
              }}>
                {/* Row 1: Date Range & Quick Date Presets */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  <span style={{ color: '#94a3b8', fontSize: '13px', fontWeight: 'bold' }}>📅 الفترة:</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>من:</span>
                    <input
                      type="date"
                      value={reportDateFrom}
                      onChange={(e) => {
                        setReportDateFrom(e.target.value);
                        setReportDatePreset('');
                      }}
                      className="report-date-input"
                      style={{ padding: '7px 12px', borderRadius: '8px', fontSize: '13px' }}
                    />
                    <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>إلى:</span>
                    <input
                      type="date"
                      value={reportDateTo}
                      onChange={(e) => {
                        setReportDateTo(e.target.value);
                        setReportDatePreset('');
                      }}
                      className="report-date-input"
                      style={{ padding: '7px 12px', borderRadius: '8px', fontSize: '13px' }}
                    />
                  </div>

                  <div style={{ display: 'flex', gap: '6px', marginRight: '4px' }}>
                    {[
                      ['today', 'اليوم'],
                      ['yesterday', 'أمس'],
                      ['week', '7 أيام'],
                      ['month', 'الشهر']
                    ].map(([v, l]) => {
                      const isActive = reportDatePreset === v;
                      return (
                        <button
                          key={v}
                          type="button"
                          onClick={() => handleQuickDate(v)}
                          style={{
                            padding: '6px 14px',
                            borderRadius: '8px',
                            background: isActive ? 'linear-gradient(135deg, #10b981, #059669)' : 'rgba(255,255,255,0.06)',
                            border: `1px solid ${isActive ? '#10b981' : 'rgba(255,255,255,0.12)'}`,
                            color: isActive ? '#fff' : 'var(--text-muted, #94a3b8)',
                            fontWeight: isActive ? '800' : '500',
                            fontSize: '12.5px',
                            cursor: 'pointer',
                            transition: 'all 0.15s'
                          }}
                        >
                          {l}
                        </button>
                      );
                    })}
                  </div>

                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    style={{ marginRight: 'auto', fontWeight: '800', padding: '8px 18px' }}
                    onClick={() => handleGenerateReport('sales')}
                    disabled={reportLoading}
                  >
                    {reportLoading ? '⏳ جاري التحميل...' : '🔍 عرض التقرير'}
                  </button>
                </div>

                {/* Row 2: User / Employee Filter Buttons (Ziyad, Ahmed, Mohamed...) */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '12px' }}>
                  <span style={{ color: '#f59e0b', fontSize: '13px', fontWeight: 'bold' }}>👤 الموظف / الكاشير:</span>
                  <button
                    type="button"
                    onClick={() => {
                      setReportUserId('all');
                      handleGenerateReport('sales', null, null, 'all');
                    }}
                    style={{
                      padding: '6px 14px',
                      borderRadius: '8px',
                      fontSize: '12.5px',
                      fontWeight: reportUserId === 'all' ? '800' : '500',
                      background: reportUserId === 'all' ? 'linear-gradient(135deg, #f59e0b, #d97706)' : 'rgba(255,255,255,0.06)',
                      color: reportUserId === 'all' ? '#fff' : 'var(--text-muted)',
                      border: `1px solid ${reportUserId === 'all' ? '#f59e0b' : 'rgba(255,255,255,0.12)'}`,
                      cursor: 'pointer',
                      transition: 'all 0.15s'
                    }}
                  >
                    👥 كافة الموظفين ({usersList.length})
                  </button>

                  {usersList.map((u) => {
                    const isSelected = String(reportUserId) === String(u.id);
                    return (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => {
                          setReportUserId(String(u.id));
                          handleGenerateReport('sales', null, null, String(u.id));
                        }}
                        style={{
                          padding: '6px 14px',
                          borderRadius: '8px',
                          fontSize: '12.5px',
                          fontWeight: isSelected ? '800' : '500',
                          background: isSelected ? 'linear-gradient(135deg, #3b82f6, #1d4ed8)' : 'rgba(255,255,255,0.06)',
                          color: isSelected ? '#fff' : 'var(--text-muted)',
                          border: `1px solid ${isSelected ? '#3b82f6' : 'rgba(255,255,255,0.12)'}`,
                          cursor: 'pointer',
                          transition: 'all 0.15s'
                        }}
                      >
                        👤 {u.name || u.username} {u.role === 'admin' ? '⭐' : ''}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Filter Bar for inventory */}
            {reportsTab === 'inventory' && (
              <div style={{
                background: 'var(--bg-card, #1e293b)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '12px',
                padding: '12px 18px',
                marginBottom: '20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '12px'
              }}>
                <span style={{ fontSize: '13px', color: '#94a3b8' }}>
                  📦 جرد المخزون الفعلي المباشر وحالة الأصناف في الكتالوج
                </span>
                <button
                  type="button"
                  className="btn btn-outline-light btn-sm"
                  onClick={() => { handleGenerateReport('inventory'); showToast('🔄 تم تحديث جرد المخزون'); }}
                >
                  🔄 تحديث بيانات المخزون
                </button>
              </div>
            )}

            {/* Filter Bar for daily summary */}
            {reportsTab === 'daily_summary' && (
              <div style={{
                background: 'var(--bg-card, #1e293b)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '14px',
                padding: '16px 20px',
                marginBottom: '20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '12px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <label style={{ fontSize: '13px', fontWeight: 'bold' }}>📅 تاريخ اليوم:</label>
                  <input
                    type="date"
                    value={reportDateFrom}
                    onChange={(e) => {
                      setReportDateFrom(e.target.value);
                      handleGenerateReport('daily_summary', e.target.value);
                    }}
                    style={{
                      background: 'var(--bg-input, rgba(255,255,255,0.05))',
                      border: '1px solid var(--border-color, rgba(255,255,255,0.1))',
                      color: 'var(--text-main, #fff)',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      fontSize: '13px'
                    }}
                  />
                </div>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => handleGenerateReport('daily_summary')}
                >
                  🔄 تحديث التقرير الشامل
                </button>
              </div>
            )}

            {/* Shift Selector Panel */}
            {reportsTab === 'shifts' && (
              <div style={{
                background: 'var(--bg-card, #1e293b)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '14px',
                padding: '16px 20px',
                marginBottom: '20px',
                boxShadow: '0 4px 18px rgba(0,0,0,0.2)'
              }}>
                {/* Top Filter Bar: Date & Shift Type & Active Shift Button */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '14px', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '12px' }}>

                  {/* Date Quick Controls */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: '700', fontSize: '13px', color: '#94a3b8' }}>📅 التاريخ:</span>
                    {[
                      ['today', 'اليوم'],
                      ['yesterday', 'أمس'],
                      ['custom', 'تاريخ محدد'],
                      ['all', 'كافة التواريخ']
                    ].map(([mode, label]) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setReportShiftDateMode(mode)}
                        style={{
                          padding: '5px 12px',
                          borderRadius: '8px',
                          fontSize: '12px',
                          fontWeight: reportShiftDateMode === mode ? '700' : '500',
                          background: reportShiftDateMode === mode ? '#10b981' : 'rgba(255,255,255,0.06)',
                          color: reportShiftDateMode === mode ? '#fff' : 'var(--text-muted, #94a3b8)',
                          border: `1px solid ${reportShiftDateMode === mode ? '#10b981' : 'rgba(255,255,255,0.12)'}`,
                          cursor: 'pointer',
                          transition: 'all 0.15s'
                        }}
                      >
                        {label}
                      </button>
                    ))}
                    {reportShiftDateMode === 'custom' && (
                      <input
                        type="date"
                        value={reportShiftDateFilter}
                        onChange={(e) => setReportShiftDateFilter(e.target.value)}
                        style={{
                          padding: '4px 8px',
                          borderRadius: '8px',
                          background: 'var(--bg-input, #0f172a)',
                          color: 'var(--text-main, #fff)',
                          border: '1px solid #10b981',
                          fontSize: '12px'
                        }}
                      />
                    )}
                  </div>

                  {/* Shift Period Filter: Morning / Evening / Night / All */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: '700', fontSize: '13px', color: '#94a3b8' }}>⏱️ الفترة:</span>
                    {[
                      ['all', 'كافة الفترات'],
                      ['morning', '☀️ صباحي'],
                      ['evening', '🌆 مسائي'],
                      ['night', '🌙 ليلي']
                    ].map(([type, label]) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setReportShiftTypeFilter(type)}
                        style={{
                          padding: '5px 12px',
                          borderRadius: '8px',
                          fontSize: '12px',
                          fontWeight: reportShiftTypeFilter === type ? '700' : '500',
                          background: reportShiftTypeFilter === type ? 'rgba(59,130,246,0.25)' : 'rgba(255,255,255,0.06)',
                          color: reportShiftTypeFilter === type ? '#60a5fa' : 'var(--text-muted, #94a3b8)',
                          border: `1px solid ${reportShiftTypeFilter === type ? '#3b82f6' : 'rgba(255,255,255,0.12)'}`,
                          cursor: 'pointer',
                          transition: 'all 0.15s'
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  {/* Employee / Cashier Filter */}
                  {usersList.length > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontWeight: '700', fontSize: '13px', color: '#94a3b8' }}>👤 الموظف:</span>
                      <select
                        value={reportShiftUserFilter}
                        onChange={(e) => setReportShiftUserFilter(e.target.value)}
                        style={{
                          padding: '5px 10px',
                          borderRadius: '8px',
                          fontSize: '12px',
                          background: 'var(--bg-input, #0f172a)',
                          color: 'var(--text-main, #fff)',
                          border: '1px solid var(--border-color, rgba(255,255,255,0.15))',
                          cursor: 'pointer'
                        }}
                      >
                        <option value="all">كافة الموظفين ({usersList.length})</option>
                        {usersList.map((u) => (
                          <option key={u.id} value={u.name || u.username}>
                            {u.name || u.username} ({u.role === 'admin' ? 'مدير' : 'كاشير'})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Direct Active Shift Jump Button (if open shift exists) */}
                  {shift?.id && (
                    <button
                      key="active-shift-btn"
                      type="button"
                      onClick={() => {
                        setReportShiftId(shift.id);
                        setTimeout(() => handleGenerateReport('shifts'), 80);
                      }}
                      style={{
                        padding: '6px 14px',
                        borderRadius: '8px',
                        fontSize: '12px',
                        fontWeight: '800',
                        background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                        color: '#fff',
                        border: 'none',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        boxShadow: '0 0 12px rgba(16,185,129,0.35)',
                        marginRight: 'auto'
                      }}
                    >
                      <span>⚡</span>
                      <span>{shift.user_name ? `${shift.user_name} - ` : ''}{getShiftDisplayName(shift)} (مفتوحة حالياً)</span>
                    </button>
                  )}
                </div>

                {/* Filtered Shifts List */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <span style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-main, #cbd5e1)' }}>
                      الورديات المطابقة ({filteredShiftsList.length})
                    </span>
                    {filteredShiftsList.length > 0 && (
                      <span style={{ fontSize: '11px', color: 'var(--text-muted, #94a3b8)' }}>
                        اضغط على الوردية لعرض التقرير التفصيلي
                      </span>
                    )}
                  </div>

                  {filteredShiftsList.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '24px 15px', color: 'var(--text-muted)', background: 'rgba(0,0,0,0.15)', borderRadius: '10px' }}>
                      <div style={{ fontSize: '24px', marginBottom: '6px' }}>🔍</div>
                      <p style={{ fontSize: '13px', margin: 0 }}>لا توجد ورديات مسجلة لهذا اليوم أو الفترة أو الموظف المحدد</p>
                      <small style={{ color: '#64748b' }}>يمكنك تغيير التاريخ أو اختيار "كافة التواريخ" للاطلاع على أرشيف الورديات السابقة</small>
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '10px', maxHeight: '250px', overflowY: 'auto', padding: '2px' }}>
                      {filteredShiftsList.map((s) => {
                        const isSelected = String(reportShiftId) === String(s.id);
                        const isOpen = !s.closed_at;
                        return (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => {
                              setReportShiftId(s.id);
                              setTimeout(() => handleGenerateReport('shifts'), 80);
                            }}
                            style={{
                              background: isSelected ? 'rgba(16,185,129,0.22)' : 'rgba(255,255,255,0.04)',
                              border: `1.5px solid ${isSelected ? '#10b981' : isOpen ? '#059669' : 'rgba(255,255,255,0.1)'}`,
                              borderRadius: '12px',
                              padding: '12px 14px',
                              cursor: 'pointer',
                              color: 'var(--text-main, #fff)',
                              textAlign: 'right',
                              fontSize: '12px',
                              transition: 'all 0.15s'
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{ fontSize: '15px' }}>👤</span>
                                <strong style={{ fontWeight: '800', color: isSelected ? '#10b981' : 'var(--text-main, #f8fafc)', fontSize: '14px' }}>
                                  {s.user_name || 'كاشير'}
                                </strong>
                              </div>
                              {isOpen ? (
                                <span style={{ background: '#059669', color: '#fff', padding: '2px 8px', borderRadius: '12px', fontSize: '10.5px', fontWeight: '700', boxShadow: '0 0 8px rgba(16,185,129,0.4)' }}>
                                  🟢 مفتوح الآن
                                </span>
                              ) : (
                                <span style={{ background: 'rgba(255,255,255,0.08)', color: 'var(--text-muted, #94a3b8)', padding: '2px 8px', borderRadius: '12px', fontSize: '10.5px' }}>
                                  مغلق (#{s.id})
                                </span>
                              )}
                            </div>

                            <div style={{ color: 'var(--text-muted, #cbd5e1)', fontSize: '12px', display: 'flex', justifyContent: 'space-between', marginBottom: '6px', background: 'rgba(255,255,255,0.04)', padding: '4px 8px', borderRadius: '6px' }}>
                              <span style={{ color: 'var(--accent-blue, #38bdf8)', fontWeight: '600' }}>
                                {getShiftDisplayName(s)}
                              </span>
                              <span>
                                ⏱️ {formatShiftTime(s.opened_at)} {s.closed_at ? 'إلى ' + formatShiftTime(s.closed_at) : '• مستمر'}
                              </span>
                            </div>

                            <div style={{ color: 'var(--text-muted, #94a3b8)', fontSize: '11px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span>📅 {getLocalDateString(s.opened_at)}</span>
                              <span>مبيعات: <strong style={{ color: '#10b981', fontSize: '12.5px' }}>{s.cash_sales || s.total_sales || 0} {settings.currency || 'ج.م'}</strong></span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Loading */}
            {reportLoading && (
              <div style={{ textAlign: 'center', padding: '60px', color: '#f59e0b' }}>
                <div style={{ fontSize: '36px', marginBottom: '12px' }}>⏳</div>
                <p style={{ fontSize: '15px' }}>جاري استخراج بيانات التقرير...</p>
              </div>
            )}

            {/* No data placeholder */}
            {!reportLoading && reportsTab !== 'quick' && reportsTab !== 'shifts' && !reportData && (
              <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>
                <div style={{ fontSize: '48px', marginBottom: '16px' }}>📋</div>
                <p style={{ fontSize: '15px' }}>اضغط "عرض التقرير" لاستخراج البيانات</p>
              </div>
            )}
            {!reportLoading && reportsTab === 'shifts' && (!reportData || !reportData.shift) && (
              <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>
                <div style={{ fontSize: '48px', marginBottom: '16px' }}>⏱️</div>
                <p style={{ fontSize: '15px' }}>اختر شيفت من الأعلى لعرض تقريره</p>
              </div>
            )}

            {/* ====== TAB: SALES REPORT ====== */}
            {!reportLoading && reportsTab === 'sales' && reportData && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div className="stats-cards-grid">
                  <div className="stat-card">
                    <div className="stat-icon">💰</div>
                    <div className="stat-data">
                      <span className="stat-label">إجمالي المبيعات</span>
                      <strong className="stat-number">{reportData.summary?.total_sales || 0} {settings.currency || 'ج.م'}</strong>
                      <small>{reportData.summary?.order_count || 0} فاتورة</small>
                    </div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-icon">💵</div>
                    <div className="stat-data">
                      <span className="stat-label">نقدي (كاش)</span>
                      <strong className="stat-number">{reportData.summary?.cash_sales || 0} {settings.currency || 'ج.م'}</strong>
                    </div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-icon">📱</div>
                    <div className="stat-data">
                      <span className="stat-label">محافظ وفيزا</span>
                      <strong className="stat-number">
                        {((reportData.summary?.card_sales || 0) + (reportData.summary?.wallet_sales || 0))} {settings.currency || 'ج.م'}
                      </strong>
                    </div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-icon">☕</div>
                    <div className="stat-data">
                      <span className="stat-label">مبيعات الصالات</span>
                      <strong className="stat-number">{reportData.summary?.dine_in_sales || 0} {settings.currency || 'ج.م'}</strong>
                      <small>تيك أواي: {reportData.summary?.takeaway_sales || 0} {settings.currency || 'ج.م'}</small>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '20px' }}>
                  <div style={{ background: 'var(--bg-card, #1e293b)', padding: '18px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.08)' }}>
                    <h3 style={{ marginBottom: '14px', fontSize: '15px' }}>🏆 أكثر 10 أصناف مبيعاً</h3>
                    {(!reportData.topProducts || reportData.topProducts.length === 0) ? (
                      <p style={{ color: 'var(--text-muted)' }}>لا توجد مبيعات</p>
                    ) : (
                      <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                        <table className="custom-table" style={{ width: '100%', fontSize: '13px' }}>
                          <thead><tr><th>#</th><th>الصنف</th><th style={{ textAlign: 'center' }}>الكمية</th><th>الإجمالي</th></tr></thead>
                          <tbody>
                            {reportData.topProducts.slice(0, 10).map((tp, idx) => (
                              <tr key={idx}>
                                <td><span className="badge-cat" style={{ padding: '2px 6px', fontSize: '11px' }}>{idx + 1}</span></td>
                                <td><strong>{tp.product_name}</strong></td>
                                <td style={{ textAlign: 'center', fontWeight: 'bold' }}>{tp.total_qty}</td>
                                <td style={{ color: 'var(--primary, #f59e0b)', fontWeight: 'bold' }}>{tp.total_sales} {settings.currency || 'ج.م'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  <div style={{ background: 'var(--bg-card, #1e293b)', padding: '18px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.08)' }}>
                    <h3 style={{ marginBottom: '14px', fontSize: '15px' }}>📍 المبيعات حسب الصالة</h3>
                    {(!reportData.bySection || reportData.bySection.length === 0) ? (
                      <p style={{ color: 'var(--text-muted)' }}>لا توجد طلبات صالة</p>
                    ) : (
                      <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                        <table className="custom-table" style={{ width: '100%', fontSize: '13px' }}>
                          <thead><tr><th>المكان</th><th style={{ textAlign: 'center' }}>الطلبات</th><th>الإجمالي</th></tr></thead>
                          <tbody>
                            {reportData.bySection.map((sec, idx) => (
                              <tr key={idx}>
                                <td><strong>{sec.table_name || 'صالة'}</strong></td>
                                <td style={{ textAlign: 'center' }}>{sec.order_count} طلب</td>
                                <td style={{ color: '#10b981', fontWeight: 'bold' }}>{sec.total} {settings.currency || 'ج.م'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>

                {reportData.dailyBreakdown && reportData.dailyBreakdown.length > 1 && (
                  <div style={{ background: 'var(--bg-card, #1e293b)', padding: '18px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.08)' }}>
                    <h3 style={{ marginBottom: '14px', fontSize: '15px' }}>📅 حركة المبيعات اليومية</h3>
                    <div style={{ maxHeight: '220px', overflowY: 'auto' }}>
                      <table className="custom-table" style={{ width: '100%', fontSize: '13px' }}>
                        <thead><tr><th>التاريخ</th><th style={{ textAlign: 'center' }}>عدد الفواتير</th><th>إجمالي</th></tr></thead>
                        <tbody>
                          {reportData.dailyBreakdown.map((d, idx) => (
                            <tr key={idx}>
                              <td><strong>{d.day}</strong></td>
                              <td style={{ textAlign: 'center' }}>{d.order_count} طلب</td>
                              <td style={{ color: 'var(--primary, #f59e0b)', fontWeight: 'bold' }}>{d.total} {settings.currency || 'ج.م'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* User / Employee Performance Section */}
                <div style={{ background: 'var(--bg-card, #1e293b)', padding: '18px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
                    <h3 style={{ margin: 0, fontSize: '15px' }}>👥 كشف مبيعات الموظفين والكاشيرية في هذه الفترة</h3>
                    {reportUserId !== 'all' && (
                      <button
                        type="button"
                        onClick={() => {
                          setReportUserId('all');
                          handleGenerateReport('sales', null, null, 'all');
                        }}
                        style={{ fontSize: '12px', padding: '4px 10px', borderRadius: '6px', background: 'rgba(255,255,255,0.08)', color: '#fbbf24', border: '1px solid #f59e0b', cursor: 'pointer', fontWeight: 'bold' }}
                      >
                        عرض كافة الموظفين
                      </button>
                    )}
                  </div>
                  {(!reportData.userBreakdown || reportData.userBreakdown.length === 0) ? (
                    <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>لا توجد مبيعات مسجلة لموظفين في هذه الفترة</p>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '12px' }}>
                      {reportData.userBreakdown.map((ub) => {
                        const isSelected = String(reportUserId) === String(ub.user_id);
                        return (
                          <div
                            key={ub.user_id}
                            onClick={() => {
                              const newUid = isSelected ? 'all' : String(ub.user_id);
                              setReportUserId(newUid);
                              handleGenerateReport('sales', null, null, newUid);
                            }}
                            style={{
                              background: isSelected ? 'rgba(245, 158, 11, 0.15)' : 'rgba(255,255,255,0.04)',
                              border: `1.5px solid ${isSelected ? '#f59e0b' : 'rgba(255,255,255,0.08)'}`,
                              borderRadius: '10px',
                              padding: '14px',
                              cursor: 'pointer',
                              transition: 'all 0.15s'
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                              <strong style={{ fontSize: '15px', color: isSelected ? '#fbbf24' : '#fff' }}>👤 {ub.user_name}</strong>
                              <span style={{ fontSize: '11px', background: 'rgba(255,255,255,0.1)', padding: '2px 8px', borderRadius: '4px', fontWeight: 'bold' }}>
                                {ub.order_count} فاتورة
                              </span>
                            </div>
                            <div style={{ fontSize: '18px', fontWeight: '900', color: '#10b981', marginBottom: '6px' }}>
                              {Number(ub.total_sales || 0).toFixed(2)} {settings.currency || 'ج.م'}
                            </div>
                            <div style={{ fontSize: '11.5px', color: '#94a3b8', display: 'flex', justifyContent: 'space-between' }}>
                              <span>كاش: <strong>{Number(ub.cash_sales || 0).toFixed(2)}</strong></span>
                              <span>فيزا/محفظة: <strong>{(Number(ub.card_sales || 0) + Number(ub.wallet_sales || 0)).toFixed(2)}</strong></span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* قائمة الفواتير أُزيلت من هنا - يمكن مراجعتها في تبويب سجل الفواتير والمبيعات */}
              </div>
            )}

            {/* ====== TAB: INVENTORY REPORT ====== */}
            {!reportLoading && reportsTab === 'inventory' && reportData && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div className="stats-cards-grid">
                  <div className="stat-card">
                    <div className="stat-icon">📦</div>
                    <div className="stat-data">
                      <span className="stat-label">إجمالي الأصناف</span>
                      <strong className="stat-number">{reportData.allProducts?.length || 0} صنف</strong>
                    </div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-icon">⚠️</div>
                    <div className="stat-data">
                      <span className="stat-label">قاربت على النفاد</span>
                      <strong className="stat-number" style={{ color: (reportData.lowStock?.length || 0) > 0 ? '#ef4444' : '#10b981' }}>
                        {reportData.lowStock?.length || 0} صنف
                      </strong>
                    </div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-icon">☀️</div>
                    <div className="stat-data">
                      <span className="stat-label">مستهلك اليوم</span>
                      <strong className="stat-number" style={{ color: '#f59e0b' }}>
                        {(reportData.consumedToday || []).reduce((s, r) => s + (Number(r.qty_out) || 0), 0)} وحدة
                      </strong>
                    </div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-icon">📅</div>
                    <div className="stat-data">
                      <span className="stat-label">مستهلك هذا الأسبوع</span>
                      <strong className="stat-number" style={{ color: '#8b5cf6' }}>
                        {(reportData.consumedWeek || []).reduce((s, r) => s + (Number(r.qty_out) || 0), 0)} وحدة
                      </strong>
                    </div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-icon">💰</div>
                    <div className="stat-data">
                      <span className="stat-label">قيمة المخزون</span>
                      <strong className="stat-number">
                        {(reportData.allProducts || []).reduce((sum, p) => sum + ((Number(p.stock_qty) || 0) * (Number(p.cost ?? p.cost_price ?? 0))), 0).toFixed(2)} {settings.currency || 'ج.م'}
                      </strong>
                    </div>
                  </div>
                </div>

                {/* ── Filter & Search toolbar ── */}
                <div style={{ background: 'var(--bg-card, #1e293b)', padding: '14px 18px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
                  {/* Product dropdown */}
                  <select
                    value={invProductFilter}
                    onChange={e => setInvProductFilter(e.target.value)}
                    style={{ padding: '7px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.06)', color: '#f1f5f9', border: '1px solid rgba(255,255,255,0.15)', fontSize: 13, cursor: 'pointer', minWidth: 180 }}
                  >
                    <option value="all">🔍 كل الأصناف</option>
                    {(reportData.allProducts || []).map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                  {/* View mode buttons */}
                  {[
                    { key: 'all', label: '📋 الكل' },
                    { key: 'low', label: '⚠️ قاربت على النفاد' },
                    { key: 'today', label: '☀️ مستهلك اليوم' },
                    { key: 'week', label: '📅 مستهلك الأسبوع' }
                  ].map(({ key, label }) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setInventoryFilterMode(key)}
                      style={{
                        padding: '7px 13px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                        background: inventoryFilterMode === key ? 'var(--accent, #6366f1)' : 'rgba(255,255,255,0.06)',
                        color: inventoryFilterMode === key ? '#fff' : 'var(--text-muted)',
                        border: inventoryFilterMode === key ? '1.5px solid var(--accent, #6366f1)' : '1px solid rgba(255,255,255,0.12)',
                        transition: 'all 0.15s'
                      }}
                    >
                      {label}
                    </button>
                  ))}
                  {/* Refresh button */}
                  <button
                    type="button"
                    className="btn btn-outline-light btn-sm"
                    style={{ marginRight: 'auto', fontWeight: 700 }}
                    onClick={() => handleGenerateReport('inventory')}
                  >
                    🔄 تحديث
                  </button>
                </div>

                {/* ── Product Detail Card (when a specific product is selected) ── */}
                {reportData.productDetails && (
                  <div style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.15), rgba(99,102,241,0.05))', border: '1px solid rgba(99,102,241,0.35)', borderRadius: 14, padding: '20px 22px' }}>
                    <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span>🔎</span> {reportData.productDetails.name}
                      <span style={{ marginRight: 'auto', fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>{reportData.productDetails.category_name}</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12 }}>
                      {[
                        { label: 'الرصيد الحالي', value: reportData.productDetails.stock_qty, color: Number(reportData.productDetails.stock_qty) <= Number(reportData.productDetails.low_stock_threshold || 10) ? '#ef4444' : '#10b981' },
                        { label: 'حد التنبيه', value: reportData.productDetails.low_stock_threshold || 10, color: '#f59e0b' },
                        { label: 'مستهلك اليوم ☀️', value: reportData.productDetails.consumed_today, color: '#f59e0b' },
                        { label: 'مستهلك الأسبوع 📅', value: reportData.productDetails.consumed_week, color: '#8b5cf6' },
                        { label: 'إجمالي الوارد', value: reportData.productDetails.total_in, color: '#10b981' },
                        { label: 'إجمالي الصادر', value: reportData.productDetails.total_out, color: '#ef4444' },
                      ].map(({ label, value, color }) => (
                        <div key={label} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: '12px 14px', textAlign: 'center' }}>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>{label}</div>
                          <div style={{ fontWeight: 800, fontSize: 20, color }}>{value ?? 0}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* ── Low Stock Alert Banner ── */}
                {inventoryFilterMode !== 'low' && (reportData.lowStock?.length || 0) > 0 && (
                  <div style={{ background: 'linear-gradient(135deg, rgba(239,68,68,0.12), rgba(239,68,68,0.05))', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 12, padding: '14px 18px' }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: '#ef4444', marginBottom: 10 }}>
                      ⚠️ تحذير: {reportData.lowStock.length} صنف قارب على النفاد
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {reportData.lowStock.map(p => (
                        <span key={p.id} style={{ background: 'rgba(239,68,68,0.15)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '4px 10px', fontSize: 12, fontWeight: 700 }}>
                          {p.name} ({p.stock_qty ?? 0})
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* ── Main Inventory Table ── */}
                {(() => {
                  let rows = reportData.allProducts || [];
                  if (inventoryFilterMode === 'low') {
                    rows = reportData.lowStock || [];
                  } else if (inventoryFilterMode === 'today') {
                    const todayIds = new Set((reportData.consumedToday || []).map(r => r.product_id));
                    rows = rows.filter(p => todayIds.has(p.id));
                  } else if (inventoryFilterMode === 'week') {
                    const weekIds = new Set((reportData.consumedWeek || []).map(r => r.product_id));
                    rows = rows.filter(p => weekIds.has(p.id));
                  }
                  if (inventorySearch) {
                    rows = rows.filter(p => p.name?.toLowerCase().includes(inventorySearch.toLowerCase()));
                  }

                  const todayMap = {};
                  for (const r of (reportData.consumedToday || [])) todayMap[r.product_id] = Number(r.qty_out) || 0;
                  const weekMap = {};
                  for (const r of (reportData.consumedWeek || [])) weekMap[r.product_id] = Number(r.qty_out) || 0;

                  return (
                    <div style={{ background: 'var(--bg-card, #1e293b)', padding: '18px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.08)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: 10 }}>
                        <h3 style={{ margin: 0, fontSize: '15px' }}>
                          {inventoryFilterMode === 'all' ? '📋 جرد المخزون' :
                            inventoryFilterMode === 'low' ? '⚠️ أصناف قاربت على النفاد' :
                              inventoryFilterMode === 'today' ? '☀️ المستهلك اليوم' :
                                '📅 المستهلك هذا الأسبوع'}
                        </h3>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <input
                            placeholder="🔍 بحث عن صنف..."
                            value={inventorySearch}
                            onChange={e => setInventorySearch(e.target.value)}
                            style={{ padding: '6px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.06)', color: '#f1f5f9', border: '1px solid rgba(255,255,255,0.15)', fontSize: 12 }}
                            dir="rtl"
                          />
                          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{rows.length} صنف</span>
                        </div>
                      </div>
                      <div style={{ maxHeight: '420px', overflowY: 'auto' }}>
                        <table className="custom-table" style={{ width: '100%', fontSize: '13px' }}>
                          <thead>
                            <tr>
                              <th>الصنف</th>
                              <th>القسم</th>
                              <th style={{ textAlign: 'center' }}>الرصيد</th>
                              <th style={{ textAlign: 'center' }}>حد التنبيه</th>
                              <th style={{ textAlign: 'center', color: '#f59e0b' }}>☀️ اليوم</th>
                              <th style={{ textAlign: 'center', color: '#8b5cf6' }}>📅 الأسبوع</th>
                              <th>سعر البيع</th>
                              <th style={{ textAlign: 'center' }}>الحالة</th>
                            </tr>
                          </thead>
                          <tbody>
                            {rows.length === 0 ? (
                              <tr><td colSpan={8} style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>لا توجد بيانات</td></tr>
                            ) : rows.map((p) => {
                              const stock = Number(p.stock_qty) || 0;
                              const minStock = Number(p.low_stock_threshold || 10);
                              const isLow = stock <= minStock;
                              const isCritical = stock <= Math.floor(minStock * 0.5);
                              const todayQty = todayMap[p.id] || p.consumed_today || 0;
                              const weekQty = weekMap[p.id] || p.consumed_week || 0;
                              return (
                                <tr key={p.id} style={{ background: isCritical ? 'rgba(239,68,68,0.06)' : isLow ? 'rgba(245,158,11,0.05)' : undefined }}>
                                  <td><strong>{p.name}</strong></td>
                                  <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{p.category_name || '-'}</td>
                                  <td style={{ textAlign: 'center', fontWeight: 'bold', color: isCritical ? '#ef4444' : isLow ? '#f59e0b' : '#10b981', fontSize: 15 }}>{stock}</td>
                                  <td style={{ textAlign: 'center', color: 'var(--text-muted)' }}>{minStock}</td>
                                  <td style={{ textAlign: 'center', color: todayQty > 0 ? '#f59e0b' : 'var(--text-muted)', fontWeight: todayQty > 0 ? 700 : 400 }}>
                                    {todayQty > 0 ? `-${todayQty}` : '—'}
                                  </td>
                                  <td style={{ textAlign: 'center', color: weekQty > 0 ? '#8b5cf6' : 'var(--text-muted)', fontWeight: weekQty > 0 ? 700 : 400 }}>
                                    {weekQty > 0 ? `-${weekQty}` : '—'}
                                  </td>
                                  <td style={{ color: 'var(--text-muted)' }}>{p.price} {settings.currency || 'ج.م'}</td>
                                  <td style={{ textAlign: 'center' }}>
                                    {isCritical ? (
                                      <span style={{ background: 'rgba(239,68,68,0.25)', color: '#ef4444', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold' }}>🔴 حرج</span>
                                    ) : isLow ? (
                                      <span style={{ background: 'rgba(245,158,11,0.2)', color: '#f59e0b', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold' }}>⚠️ منخفض</span>
                                    ) : (
                                      <span style={{ background: 'rgba(16,185,129,0.2)', color: '#10b981', padding: '2px 8px', borderRadius: '4px', fontSize: '11px' }}>✅ آمن</span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })()}

                {/* ── Movement Summary ── */}
                {reportData.movementSummary && reportData.movementSummary.length > 0 && (
                  <div style={{ background: 'var(--bg-card, #1e293b)', padding: '18px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.08)' }}>
                    <h3 style={{ marginBottom: '14px', fontSize: '15px' }}>📉 الأكثر استهلاكاً (خلال الفترة المختارة)</h3>
                    <div style={{ maxHeight: '260px', overflowY: 'auto' }}>
                      <table className="custom-table" style={{ width: '100%', fontSize: '13px' }}>
                        <thead><tr><th>#</th><th>الصنف</th><th style={{ textAlign: 'center' }}>المستهلك</th><th style={{ textAlign: 'center' }}>الوارد</th><th style={{ textAlign: 'center' }}>الصافي</th></tr></thead>
                        <tbody>
                          {reportData.movementSummary.map((m, idx) => {
                            const net = (Number(m.total_in) || 0) - (Number(m.total_out) || 0);
                            return (
                              <tr key={idx}>
                                <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{idx + 1}</td>
                                <td><strong>{m.product_name}</strong></td>
                                <td style={{ textAlign: 'center', color: '#ef4444', fontWeight: 'bold' }}>-{m.total_out || 0}</td>
                                <td style={{ textAlign: 'center', color: '#10b981', fontWeight: 'bold' }}>+{m.total_in || 0}</td>
                                <td style={{ textAlign: 'center', color: net >= 0 ? '#10b981' : '#ef4444', fontWeight: 700 }}>
                                  {net >= 0 ? `+${net}` : net}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ====== TAB: SHIFTS REPORT ====== */}
            {!reportLoading && reportsTab === 'shifts' && reportData && reportData.shift && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* Shift Header */}
                <div style={{
                  background: 'linear-gradient(135deg, rgba(16,185,129,0.15), rgba(16,185,129,0.05))',
                  border: '1px solid rgba(16,185,129,0.3)',
                  borderRadius: '14px',
                  padding: '20px',
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                  gap: '16px',
                  alignItems: 'center'
                }}>
                  <div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '12px', marginBottom: '4px' }}>بيانات الوردية</div>
                    <div style={{ fontWeight: '800', fontSize: '18px', color: '#10b981' }}>
                      {getShiftDisplayName(reportData.shift)}
                    </div>
                    <div style={{ fontSize: '12.5px', marginTop: '4px', color: 'var(--text-muted, #cbd5e1)' }}>
                      المسؤول: <strong style={{ color: 'var(--text-main, #fff)' }}>{reportData.shift.user_name || 'كاشير'}</strong>
                    </div>
                    <div style={{ fontSize: '12px', marginTop: '4px', color: 'var(--text-muted)' }}>
                      فتح: {formatShiftTime(reportData.shift.opened_at)} ({getLocalDateString(reportData.shift.opened_at)}) | إغلاق: {reportData.shift.closed_at ? formatShiftTime(reportData.shift.closed_at) : '🟢 مفتوحة حالياً'}
                    </div>
                  </div>
                  <div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '12px', marginBottom: '4px' }}>حسابات الخزينة</div>
                    <div style={{ fontSize: '13.5px' }}>كاش البداية: <strong>{reportData.shift.opening_cash || 0} {settings.currency || 'ج.م'}</strong></div>
                    <div style={{ fontSize: '13.5px', color: '#10b981' }}>(+) مبيعات نقدية: <strong>+{reportData.shift.cash_sales || 0} {settings.currency || 'ج.م'}</strong></div>
                    <div style={{ fontSize: '13.5px', color: '#ef4444' }}>(-) مصروفات: <strong>-{reportData.shift.expenses_total || 0} {settings.currency || 'ج.م'}</strong></div>
                  </div>
                  <div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '12px', marginBottom: '4px' }}>مطابقة الخزينة (لقطة الإغلاق الثابتة)</div>
                    <div style={{ fontSize: '13.5px' }}>المتوقع وقت الإغلاق: <strong>{Number(reportData.shift.expected_cash ?? ((Number(reportData.shift.opening_cash) || 0) + (Number(reportData.shift.cash_sales) || 0) - (Number(reportData.shift.expenses_total) || 0))).toFixed(2)} {settings.currency || 'ج.م'}</strong></div>
                    <div style={{ fontSize: '13.5px' }}>الفعلي المعدود: <strong>{reportData.shift.actual_cash !== null && reportData.shift.actual_cash !== undefined ? Number(reportData.shift.actual_cash).toFixed(2) : 'غير مسجل'} {settings.currency || 'ج.م'}</strong></div>
                    <div style={{ fontSize: '15px', fontWeight: '700', marginTop: '6px' }}>
                      {(() => {
                        const diff = Number(reportData.shift.cash_difference) || 0;
                        if (diff < -0.01) return <span style={{ color: '#ef4444' }}>⚠️ عجز وقت الإغلاق {Math.abs(diff).toFixed(2)} {settings.currency || 'ج.م'}</span>;
                        if (diff > 0.01) return <span style={{ color: '#10b981' }}>🎉 زيادة وقت الإغلاق {diff.toFixed(2)} {settings.currency || 'ج.م'}</span>;
                        return <span style={{ color: '#10b981' }}>✅ الدرج مطابق وقت الإغلاق</span>;
                      })()}
                    </div>
                    {reportData.shift.closed_at && ((reportData.postCloseAdjustments && reportData.postCloseAdjustments.length > 0) || Number(reportData.shift.post_close_adjustments_total || 0) !== 0) && (
                      <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px dashed rgba(255,255,255,0.18)', fontSize: '12.5px' }}>
                        <div style={{ color: '#fbbf24', fontWeight: '700' }}>
                          📌 تسويات لاحقة (بعد الإغلاق): {Number(reportData.shift.post_close_adjustments_total) > 0 ? `+${Number(reportData.shift.post_close_adjustments_total).toFixed(2)}` : Number(reportData.shift.post_close_adjustments_total).toFixed(2)} {settings.currency || 'ج.م'}
                        </div>
                        <div>المتوقع المحدّث: <strong>{Number(reportData.shift.updated_expected_cash ?? reportData.shift.expected_cash ?? 0).toFixed(2)} {settings.currency || 'ج.م'}</strong></div>
                        <div style={{ fontWeight: '800', marginTop: '2px' }}>
                          {(() => {
                            const finalDiff = Number(reportData.shift.final_cash_difference) || 0;
                            if (finalDiff < -0.01) return <span style={{ color: '#ef4444' }}>الفرق النهائي: عجز {Math.abs(finalDiff).toFixed(2)} {settings.currency || 'ج.م'} (بعد الإغلاق)</span>;
                            if (finalDiff > 0.01) return <span style={{ color: '#10b981' }}>الفرق النهائي: +{finalDiff.toFixed(2)} زيادة {settings.currency || 'ج.م'} (بعد الإغلاق)</span>;
                            return <span style={{ color: '#10b981' }}>الفرق النهائي: مطابق 0.00 (بعد الإغلاق)</span>;
                          })()}
                        </div>
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', justifyContent: 'center' }}>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={() => {
                        setPrintReportFormat('thermal');
                        setActiveReportForPrint('shifts');
                      }}
                      style={{ fontWeight: '700', padding: '9px 14px', borderRadius: '9px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                    >
                      <span>🧾</span>
                      <span>طباعة بون الوردية (80mm)</span>
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline-light btn-sm"
                      onClick={() => {
                        setPrintReportFormat('a4');
                        setActiveReportForPrint('shifts');
                      }}
                      style={{ fontSize: '12px', padding: '7px 12px', borderRadius: '8px' }}
                    >
                      📄 طباعة تقرير كامل (A4)
                    </button>
                  </div>
                </div>

                {/* Section Toggles Bar */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  flexWrap: 'wrap',
                  background: 'var(--bg-card, #1e293b)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: '12px',
                  padding: '10px 14px'
                }}>
                  <span style={{ fontSize: '13px', fontWeight: '700', color: '#94a3b8', marginLeft: '6px' }}>
                    📑 أقسام التقرير:
                  </span>
                  {[
                    { id: 'all', label: '📋 التقرير الشامل (الكل)', color: '#10b981' },
                    { id: 'cash', label: '💵 مطابقة الخزينة', color: '#f59e0b' },
                    { id: 'orders', label: `🧾 الفواتير (${reportData.orders?.length || 0})`, color: '#3b82f6' },
                    { id: 'items', label: `☕ الأصناف (${reportData.itemsSummary?.length || 0})`, color: '#8b5cf6' },
                    { id: 'expenses', label: `💸 المصروفات (${reportData.expenses?.length || 0})`, color: '#ef4444' },
                    { id: 'stock', label: `📦 المخزون (${reportData.stockConsumed?.length || 0})`, color: '#06b6d4' }
                  ].map((tab) => {
                    const isActive = shiftReportSection === tab.id;
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setShiftReportSection(tab.id)}
                        style={{
                          padding: '6px 14px',
                          borderRadius: '8px',
                          fontSize: '12px',
                          fontWeight: isActive ? '700' : '500',
                          background: isActive ? tab.color : 'rgba(255,255,255,0.05)',
                          color: isActive ? '#fff' : 'var(--text-muted, #94a3b8)',
                          border: `1px solid ${isActive ? tab.color : 'rgba(255,255,255,0.1)'}`,
                          cursor: 'pointer',
                          transition: 'all 0.15s',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '5px'
                        }}
                      >
                        {tab.label}
                      </button>
                    );
                  })}
                </div>

                {/* Orders / Invoices Section */}
                {(shiftReportSection === 'orders') && (
                  <div style={{ background: 'var(--bg-card, #1e293b)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', padding: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                      <h3 style={{ margin: 0, fontSize: '15px' }}>🧾 فواتير وطلبات الوردية ({reportData.orders?.length || 0})</h3>
                      <span style={{ fontSize: '12px', color: '#94a3b8' }}>إجمالي: <strong style={{ color: '#10b981' }}>{reportData.orders?.reduce((s, o) => s + (Number(o.total) || 0), 0).toFixed(2)} {settings.currency || 'ج.م'}</strong></span>
                    </div>
                    {(!reportData.orders || reportData.orders.length === 0) ? (
                      <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>لا توجد فواتير مسجلة في هذه الوردية</p>
                    ) : (
                      <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                        <table className="custom-table" style={{ width: '100%', fontSize: '12.5px' }}>
                          <thead>
                            <tr>
                              <th>رقم الفاتورة</th>
                              <th>الوقت</th>
                              <th>النوع</th>
                              <th>طريقة الدفع</th>
                              <th>الأصناف</th>
                              <th>الإجمالي</th>
                            </tr>
                          </thead>
                          <tbody>
                            {reportData.orders.map((o) => (
                              <tr key={o.id}>
                                <td><strong>#{o.order_number || o.id}</strong></td>
                                <td>{formatShiftTime(o.created_at)}</td>
                                <td>{o.order_type === 'dine_in' ? 'صالة' : o.order_type === 'takeaway' ? 'تيك أواي' : o.order_type === 'delivery' ? 'دليفري' : 'آجل'}</td>
                                <td>
                                  <span style={{
                                    padding: '2px 8px', borderRadius: '6px', fontSize: '11px',
                                    background: o.payment_method === 'cash' ? 'rgba(16,185,129,0.15)' : 'rgba(59,130,246,0.15)',
                                    color: o.payment_method === 'cash' ? '#34d399' : '#60a5fa'
                                  }}>
                                    {o.payment_method === 'cash' ? 'نقدي (كاش)' : o.payment_method === 'card' ? 'فيزا' : o.payment_method === 'wallet' ? 'محفظة' : o.payment_method === 'split' ? 'مختلط' : 'شكك'}
                                  </span>
                                </td>
                                <td style={{ maxWidth: '280px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {o.items_summary || (Array.isArray(o.items) ? o.items.map(it => `${it.name || it.product_name} x${it.quantity || it.qty}`).join(', ') : '-')}
                                </td>
                                <td style={{ fontWeight: 'bold', color: '#10b981' }}>{Number(o.total).toFixed(2)} {settings.currency || 'ج.م'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                {/* Shift Details Grid (Items, Stock, Expenses) */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
                  {/* Items Sold */}
                  {(shiftReportSection === 'all' || shiftReportSection === 'items') && (
                    <div style={{ background: 'var(--bg-card, #1e293b)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', padding: '16px' }}>
                      <h3 style={{ marginBottom: '12px', fontSize: '14px' }}>☕ الأصناف المباعة بالوردية</h3>
                      {(!reportData.itemsSummary || reportData.itemsSummary.length === 0) ? (
                        <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>لا توجد أصناف مباعة</p>
                      ) : (
                        <div style={{ maxHeight: '280px', overflowY: 'auto' }}>
                          <table className="custom-table" style={{ width: '100%', fontSize: '13px' }}>
                            <thead><tr><th>الصنف</th><th>الكمية</th><th>الإجمالي</th></tr></thead>
                            <tbody>
                              {reportData.itemsSummary.map((it, idx) => (
                                <tr key={idx}>
                                  <td><strong>{it.product_name}</strong></td>
                                  <td>{it.total_qty}</td>
                                  <td style={{ color: 'var(--primary, #f59e0b)', fontWeight: 'bold' }}>{it.total_sales} {settings.currency || 'ج.م'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Expenses */}
                  {(shiftReportSection === 'all' || shiftReportSection === 'expenses') && (
                    <div style={{ background: 'var(--bg-card, #1e293b)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', padding: '16px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                        <h3 style={{ margin: 0, fontSize: '14px' }}>💸 المصروفات والنثريات المسجلة</h3>
                        <button
                          type="button"
                          className="btn btn-warning btn-sm"
                          onClick={() => setExpenseModal(true)}
                          style={{ fontSize: '11px', padding: '3px 8px' }}
                        >
                          ➕ إضافة مصروف
                        </button>
                      </div>
                      {(!reportData.expenses || reportData.expenses.length === 0) ? (
                        <p style={{ color: '#10b981', fontSize: '13px' }}>💚 لا توجد مصروفات مسجلة في هذا الشيفت</p>
                      ) : (
                        <div style={{ maxHeight: '280px', overflowY: 'auto' }}>
                          <table className="custom-table" style={{ width: '100%', fontSize: '13px' }}>
                            <thead>
                              <tr>
                                <th>بند / صنف المصروف</th>
                                <th>المبلغ</th>
                                <th>ملاحظات</th>
                                <th style={{ textAlign: 'center' }}>إجراءات</th>
                              </tr>
                            </thead>
                            <tbody>
                              {reportData.expenses.map((exp) => (
                                <tr key={exp.id}>
                                  <td><strong>{exp.category || exp.description || 'مصروف عام'}</strong></td>
                                  <td style={{ color: '#ef4444', fontWeight: 'bold' }}>{exp.amount} {settings.currency || 'ج.م'}</td>
                                  <td style={{ color: '#94a3b8', fontSize: '11.5px' }}>{exp.notes || formatShiftTime(exp.created_at)}</td>
                                  <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditExpenseForm({
                                          id: exp.id,
                                          amount: exp.amount,
                                          category: exp.category || 'مشتريات خامات (بن/حليب/سكر/مستلزمات)',
                                          notes: exp.notes || ''
                                        });
                                        setEditingExpense(exp);
                                      }}
                                      className="btn btn-outline-light btn-sm"
                                      style={{ fontSize: '11px', padding: '2px 8px', marginLeft: '4px' }}
                                      title="تعديل وتغيير الصنف أو المبلغ"
                                    >
                                      ✏️ تعديل
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteExpense(exp.id)}
                                      className="btn btn-outline-danger btn-sm"
                                      style={{ fontSize: '11px', padding: '2px 6px' }}
                                      title="حذف هذا المصروف"
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
                    </div>
                  )}

                  {/* Post-Close Adjustments ("تسويات لاحقة") */}
                  {(shiftReportSection === 'all' || shiftReportSection === 'cash') && reportData.postCloseAdjustments && reportData.postCloseAdjustments.length > 0 && (
                    <div style={{ background: 'var(--bg-card, #1e293b)', border: '1px solid rgba(245,158,11,0.35)', borderRadius: '12px', padding: '16px' }}>
                      <h3 style={{ marginBottom: '12px', fontSize: '14px', color: '#fbbf24' }}>📌 تسويات لاحقة (بعد إغلاق الوردية)</h3>
                      <div style={{ maxHeight: '240px', overflowY: 'auto' }}>
                        <table className="custom-table" style={{ width: '100%', fontSize: '13px' }}>
                          <thead>
                            <tr>
                              <th>النوع</th>
                              <th>المبلغ</th>
                              <th>السبب</th>
                              <th>بواسطة</th>
                              <th>الوقت</th>
                            </tr>
                          </thead>
                          <tbody>
                            {reportData.postCloseAdjustments.map((adj) => (
                              <tr key={adj.id}>
                                <td>
                                  <span style={{ color: adj.type === 'in' ? '#10b981' : '#ef4444', fontWeight: 'bold' }}>
                                    {adj.type === 'in' ? 'إضافة (+)' : 'خصم (-)'} (بعد الإغلاق)
                                  </span>
                                </td>
                                <td style={{ fontWeight: 'bold', color: adj.type === 'in' ? '#10b981' : '#ef4444' }}>
                                  {adj.type === 'in' ? `+${Number(adj.amount).toFixed(2)}` : `-${Number(adj.amount).toFixed(2)}`} {settings.currency || 'ج.م'}
                                </td>
                                <td>{adj.reason || '-'}</td>
                                <td>{adj.created_by || 'الإدارة'}</td>
                                <td style={{ fontSize: '11.5px', color: '#94a3b8' }}>{formatShiftTime(adj.created_at)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Stock Consumed */}
                  {(shiftReportSection === 'all' || shiftReportSection === 'stock') && (
                    <div style={{ background: 'var(--bg-card, #1e293b)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', padding: '16px' }}>
                      <h3 style={{ marginBottom: '12px', fontSize: '14px' }}>📦 المستهلك من المخزون والخامات</h3>
                      {(!reportData.stockConsumed || reportData.stockConsumed.length === 0) ? (
                        <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>لم يتم تسجيل استهلاك مخزون</p>
                      ) : (
                        <div style={{ maxHeight: '280px', overflowY: 'auto' }}>
                          <table className="custom-table" style={{ width: '100%', fontSize: '13px' }}>
                            <thead><tr><th>الصنف</th><th>الكمية</th></tr></thead>
                            <tbody>
                              {reportData.stockConsumed.map((sc, idx) => (
                                <tr key={idx}>
                                  <td><strong>{sc.product_name}</strong></td>
                                  <td style={{ color: '#ef4444', fontWeight: 'bold' }}>-{sc.consumed} قطعة</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ====== TAB: QUICK DASHBOARD ====== */}
            {reportsTab === 'quick' && !dashboardData && (
              <div style={{ textAlign: 'center', padding: '50px', color: '#6366f1' }}>
                <div style={{ fontSize: '36px', marginBottom: '10px' }}>⚡</div>
                <p style={{ fontSize: '15px', fontWeight: 'bold' }}>جاري استخراج ملخص اليوم...</p>
                <button type="button" className="btn btn-primary btn-sm" onClick={loadDashboard}>
                  🔄 إعادة المحاولة
                </button>
              </div>
            )}

            {reportsTab === 'quick' && dashboardData && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', background: 'var(--bg-card, #1e293b)', padding: '10px 16px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <span style={{ fontSize: '13px', color: '#94a3b8' }}>
                    ⚡ ملخص ومؤشرات مبيعات اليوم الحية: <strong>{getLocalDateString()}</strong>
                  </span>
                  <button type="button" className="btn btn-outline-light btn-sm" onClick={() => { loadDashboard(); showToast('🔄 تم تحديث ملخص اليوم'); }} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>🔄</span> <span>تحديث الملخص الآن</span>
                  </button>
                </div>

                <div className="stats-cards-grid">
                  <div className="stat-card">
                    <div className="stat-icon">💰</div>
                    <div className="stat-data">
                      <span className="stat-label">إجمالي مبيعات اليوم</span>
                      <strong className="stat-number">{dashboardData.today?.total || 0} {settings.currency || 'ج.م'}</strong>
                      <small>{dashboardData.today?.count || 0} طلب</small>
                    </div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-icon">💵</div>
                    <div className="stat-data">
                      <span className="stat-label">المبيعات النقدية (كاش)</span>
                      <strong className="stat-number">{dashboardData.today?.cash_total || 0} {settings.currency || 'ج.م'}</strong>
                    </div>
                  </div>
                  {(dashboardData.today?.notebook_total || 0) > 0 && (
                    <div className="stat-card" style={{ border: '1.5px solid rgba(245,158,11,0.4)', background: 'linear-gradient(135deg, rgba(245,158,11,0.1), rgba(245,158,11,0.03))' }}>
                      <div className="stat-icon">📝</div>
                      <div className="stat-data">
                        <span className="stat-label">آجل / نوتة</span>
                        <strong className="stat-number" style={{ color: '#f59e0b' }}>{dashboardData.today?.notebook_total || 0} {settings.currency || 'ج.م'}</strong>
                        <small style={{ color: '#f59e0b' }}>{dashboardData.today?.notebook_count || 0} طلب آجل</small>
                      </div>
                    </div>
                  )}
                  <div className="stat-card">
                    <div className="stat-icon">💳</div>
                    <div className="stat-data">
                      <span className="stat-label">فيزا والمحافظ</span>
                      <strong className="stat-number">
                        {((dashboardData.today?.card_total || 0) + (dashboardData.today?.wallet_total || 0))} {settings.currency || 'ج.م'}
                      </strong>
                    </div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-icon">⚠️</div>
                    <div className="stat-data">
                      <span className="stat-label">أصناف أوشكت على النفاد</span>
                      <strong className={`stat-number ${dashboardData.lowStockCount > 0 ? 'text-danger' : ''}`}>
                        {dashboardData.lowStockCount} صنف
                      </strong>
                    </div>
                  </div>
                </div>

                {dashboardData.todayUserBreakdown && dashboardData.todayUserBreakdown.length > 0 && (
                  <div style={{ marginTop: '20px', background: 'var(--bg-card, #1e293b)', padding: '16px 20px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.08)' }}>
                    <h3 style={{ margin: '0 0 12px 0', fontSize: '15px' }}>👥 مبيعات الموظفين والكاشيرية اليوم</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: '12px' }}>
                      {dashboardData.todayUserBreakdown.map((ub) => (
                        <div key={ub.user_id} style={{ background: 'rgba(255,255,255,0.04)', padding: '12px 14px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.08)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                            <strong style={{ fontSize: '14px', color: 'var(--text-main, #fff)' }}>👤 {ub.user_name}</strong>
                            <span style={{ fontSize: '11px', background: 'rgba(255,255,255,0.1)', padding: '2px 6px', borderRadius: '4px' }}>
                              {ub.order_count} طلب
                            </span>
                          </div>
                          <div style={{ fontSize: '16px', fontWeight: '800', color: '#10b981' }}>
                            {ub.total_sales} {settings.currency || 'ج.م'}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="reports-details-grid" style={{ marginTop: '20px' }}>
                  <div className="report-panel">
                    <h3>🏆 أكثر 5 أصناف طلباً اليوم</h3>
                    <div className="top-products-list">
                      {dashboardData.topProducts?.map((tp, idx) => (
                        <div className="top-prod-row" key={idx}>
                          <span className="rank-badge">#{idx + 1}</span>
                          <span className="tp-name">{tp.product_name}</span>
                          <span className="tp-qty">{tp.total_qty} قطعة</span>
                          <strong className="tp-sales">{tp.total_sales} {settings.currency || 'ج.م'}</strong>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="report-panel">
                    <h3>⚠️ تنبيهات نقص المخزون</h3>
                    <div className="low-stock-list">
                      {dashboardData.lowStockItems?.length === 0 ? (
                        <p className="text-muted">جميع الأصناف متوفرة 👍</p>
                      ) : (
                        dashboardData.lowStockItems?.map((it) => (
                          <div className="low-stock-row" key={it.id}>
                            <span>{it.name}</span>
                            <span className="badge-danger">متبقي: {it.stock_qty} فقط</span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>

                {/* ── Today's Orders Table in Quick Dashboard ── */}
                <div style={{ marginTop: '20px', background: 'var(--bg-card, #1e293b)', padding: '18px 20px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
                    <h3 style={{ margin: 0, fontSize: '16px' }}>📜 تفاصيل فواتير وطلبات اليوم ({dashboardData.todayOrders?.length || 0} طلب)</h3>
                    <button type="button" className="btn btn-outline-light btn-sm" onClick={loadDashboard}>
                      🔄 تحديث الفواتير
                    </button>
                  </div>
                  {(!dashboardData.todayOrders || dashboardData.todayOrders.length === 0) ? (
                    <p className="text-muted" style={{ textAlign: 'center', padding: '24px' }}>لا توجد فواتير مسجلة لليوم حتى الآن</p>
                  ) : (
                    <div style={{ maxHeight: '450px', overflowY: 'auto' }}>
                      <table className="custom-table" style={{ width: '100%', fontSize: '13px' }}>
                        <thead>
                          <tr>
                            <th>الوقت</th>
                            <th>النوع</th>
                            <th>الطاولة / العميل</th>
                            <th>الأصناف المطلوبة</th>
                            <th style={{ textAlign: 'center' }}>الإجمالي</th>
                            <th style={{ textAlign: 'center' }}>طريقة الدفع</th>
                            <th>الكاشير</th>
                            <th style={{ textAlign: 'center' }}>عرض الفاتورة</th>
                          </tr>
                        </thead>
                        <tbody>
                          {dashboardData.todayOrders.map((ord) => {
                            const isNb = ord.order_type === 'notebook' || ord.payment_method === 'notebook';
                            return (
                              <tr key={ord.id}>
                                <td style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
                                  {formatShiftTime(ord.created_at)}
                                </td>
                                <td>
                                  {ord.order_type === 'dine_in' ? '☕ صالة' :
                                    ord.order_type === 'takeaway' ? '🛍️ تيك أواي' :
                                      '📝 نوتة (آجل)'}
                                </td>
                                <td>
                                  {ord.order_type === 'dine_in' ? (ord.table_name || `طاولة ${ord.table_id || ''}`) :
                                    (ord.customer_name || 'عميل نقدي')}
                                </td>
                                <td style={{ maxWidth: '280px', fontSize: '12px', color: 'var(--text-muted, #cbd5e1)' }} title={ord.items_summary}>
                                  {ord.items_summary || '—'}
                                </td>
                                <td style={{ textAlign: 'center', fontWeight: '800', color: '#10b981' }}>
                                  {ord.total} {settings.currency || 'ج.م'}
                                </td>
                                <td style={{ textAlign: 'center' }}>
                                  {isNb ? (
                                    <span style={{ background: 'rgba(245,158,11,0.2)', color: '#f59e0b', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold' }}>
                                      📝 نوتة
                                    </span>
                                  ) : ord.payment_method === 'card' ? (
                                    <span style={{ background: 'rgba(59,130,246,0.2)', color: '#60a5fa', padding: '2px 8px', borderRadius: '4px', fontSize: '11px' }}>
                                      💳 فيزا
                                    </span>
                                  ) : ord.payment_method === 'wallet' ? (
                                    <span style={{ background: 'rgba(139,92,246,0.2)', color: '#a78bfa', padding: '2px 8px', borderRadius: '4px', fontSize: '11px' }}>
                                      📱 فودافون كاش (محفظة)
                                    </span>
                                  ) : (
                                    <span style={{ background: 'rgba(16,185,129,0.2)', color: '#10b981', padding: '2px 8px', borderRadius: '4px', fontSize: '11px' }}>
                                      💵 نقدي (خزنة)
                                    </span>
                                  )}
                                </td>
                                <td>{ord.cashier_name || 'كاشير'}</td>
                                <td style={{ textAlign: 'center' }}>
                                  <button
                                    type="button"
                                    className="btn btn-sm btn-outline-light"
                                    onClick={() => handleViewReceipt(ord.id)}
                                    title="عرض وطباعة إيصال الفاتورة"
                                  >
                                    🧾 عرض
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* ====== TAB: DAILY SUMMARY REPORT ====== */}
            {!reportLoading && reportsTab === 'daily_summary' && reportData && reportData.grandTotal && (() => {
              const allDailyShifts = reportData.shifts || [];
              const activeDailyShifts = allDailyShifts.filter(sh => selectedDailyShiftIds.includes(sh.shift.id));
              const activeDailyTotals = {
                totalSales: activeDailyShifts.reduce((acc, sh) => acc + (Number(sh.totalSales) || 0), 0),
                cashSales: activeDailyShifts.reduce((acc, sh) => acc + (Number(sh.cashSales) || 0), 0),
                walletSales: activeDailyShifts.reduce((acc, sh) => acc + (Number(sh.walletSales) || 0), 0),
                cardSales: activeDailyShifts.reduce((acc, sh) => acc + (Number(sh.cardSales) || 0), 0),
                totalExpenses: activeDailyShifts.reduce((acc, sh) => acc + (Number(sh.totalExpenses) || 0), 0),
                ordersCount: activeDailyShifts.reduce((acc, sh) => acc + (Number(sh.ordersCount || 0)), 0),
              };
              activeDailyTotals.netCash = activeDailyTotals.cashSales - activeDailyTotals.totalExpenses;

              const isAllSelected = allDailyShifts.length > 0 && selectedDailyShiftIds.length === allDailyShifts.length;

              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  <div style={{
                    background: 'linear-gradient(135deg, rgba(139,92,246,0.15), rgba(99,102,241,0.15))',
                    border: '1px solid rgba(139,92,246,0.3)',
                    borderRadius: '14px',
                    padding: '20px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '12px'
                  }}>
                    <div>
                      <h3 style={{ margin: '0 0 6px 0', fontSize: '20px', color: 'var(--text-main, #c4b5fd)' }}>
                        📊 تقرير اليوم الشامل ({reportData.date})
                      </h3>
                      <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-muted)' }}>
                        ملخص متكامل لكافة ورديات اليوم ({allDailyShifts.length} وردية مسجلة) — محدد للطباعة: {activeDailyShifts.length} وردية
                      </p>
                    </div>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        className="btn btn-primary"
                        disabled={activeDailyShifts.length === 0}
                        onClick={() => {
                          setPrintReportFormat('thermal');
                          setActiveReportForPrint('daily_summary');
                        }}
                        style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                      >
                        <span>🖨️ طباعة الورديات المحددة ({activeDailyShifts.length})</span>
                      </button>
                    </div>
                  </div>

                  {/* Shift Selection & Filter Toolbar */}
                  <div style={{
                    background: 'var(--bg-card, #1e293b)',
                    border: '1px solid rgba(139,92,246,0.25)',
                    borderRadius: '10px',
                    padding: '12px 16px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '10px'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '16px' }}>🔘</span>
                      <strong style={{ fontSize: '14px', color: 'var(--text-main, #c4b5fd)' }}>
                        تحديد الورديات المراد تضمينها في الحسابات والطباعة:
                      </strong>
                      <span style={{
                        background: activeDailyShifts.length > 0 ? 'rgba(139,92,246,0.2)' : 'rgba(239,68,68,0.2)',
                        color: activeDailyShifts.length > 0 ? 'var(--text-main, #c4b5fd)' : '#f87171',
                        padding: '2px 8px',
                        borderRadius: '12px',
                        fontSize: '12px',
                        fontWeight: 'bold'
                      }}>
                        {activeDailyShifts.length} من {allDailyShifts.length} محددة
                      </span>
                    </div>

                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-light"
                        onClick={() => setSelectedDailyShiftIds(allDailyShifts.map(s => s.shift.id))}
                        disabled={isAllSelected}
                        style={{ fontSize: '12px', padding: '5px 12px' }}
                      >
                        ✅ تحديد الكل
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-light"
                        onClick={() => setSelectedDailyShiftIds([])}
                        disabled={selectedDailyShiftIds.length === 0}
                        style={{ fontSize: '12px', padding: '5px 12px' }}
                      >
                        ❌ إلغاء التحديد
                      </button>
                    </div>
                  </div>

                  {/* Calculated Stats for Selected Shifts */}
                  <div className="stats-cards-grid">
                    <div className="stat-card" style={{ borderTop: '3px solid #10b981' }}>
                      <div className="stat-label">💵 مبيعات الورديات المحددة</div>
                      <div className="stat-value">{activeDailyTotals.totalSales} {settings.currency || 'ج.م'}</div>
                      <div className="stat-sub">كاش: {activeDailyTotals.cashSales} | محفظة: {activeDailyTotals.walletSales} | فيزا: {activeDailyTotals.cardSales}</div>
                    </div>
                    <div className="stat-card" style={{ borderTop: '3px solid #ef4444' }}>
                      <div className="stat-label">💸 مصروفات الورديات المحددة</div>
                      <div className="stat-value" style={{ color: '#ef4444' }}>{activeDailyTotals.totalExpenses} {settings.currency || 'ج.م'}</div>
                      <div className="stat-sub">إجمالي المصروفات بالورديات المختارة</div>
                    </div>
                    <div className="stat-card" style={{ borderTop: '3px solid #8b5cf6' }}>
                      <div className="stat-label">💰 صافي الكاش بالدرج</div>
                      <div className="stat-value" style={{ color: 'var(--text-main, #c4b5fd)' }}>{activeDailyTotals.netCash} {settings.currency || 'ج.م'}</div>
                      <div className="stat-sub">المبيعات النقدية - المصروفات</div>
                    </div>
                    <div className="stat-card" style={{ borderTop: '3px solid #3b82f6' }}>
                      <div className="stat-label">🧾 إجمالي الطلبات</div>
                      <div className="stat-value">{activeDailyTotals.ordersCount || 0}</div>
                      <div className="stat-sub">عدد الفواتير بالورديات المختارة</div>
                    </div>
                  </div>

                  {/* Shifts List with Checkboxes and Single Print */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <h4 style={{ margin: '8px 0 0 0', fontSize: '16px' }}>قائمة الورديات المسجلة اليوم (يمكنك تحديد أو استبعاد أي شيفت):</h4>
                    {(!allDailyShifts || allDailyShifts.length === 0) ? (
                      <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>
                        لا توجد ورديات مسجلة لهذا التاريخ
                      </div>
                    ) : (
                      allDailyShifts.map((sh, idx) => {
                        const isSelected = selectedDailyShiftIds.includes(sh.shift.id);
                        return (
                          <div key={idx} className={`daily-shift-card ${isSelected ? 'selected' : ''}`} style={{
                            borderRadius: '12px',
                            padding: '16px',
                            transition: 'all 0.2s ease',
                            opacity: isSelected ? 1 : 0.7
                          }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', borderBottom: '1px solid var(--border-color)', paddingBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <input
                                  type="checkbox"
                                  id={`shift-check-${sh.shift.id}`}
                                  checked={isSelected}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setSelectedDailyShiftIds(prev => [...prev, sh.shift.id]);
                                    } else {
                                      setSelectedDailyShiftIds(prev => prev.filter(id => id !== sh.shift.id));
                                    }
                                  }}
                                  style={{ width: '20px', height: '20px', cursor: 'pointer', accentColor: 'var(--primary)' }}
                                />
                                <span style={{ fontSize: '20px' }}>⏱️</span>
                                <div>
                                  <label htmlFor={`shift-check-${sh.shift.id}`} style={{ cursor: 'pointer', margin: 0 }}>
                                    <strong style={{ fontSize: '15px' }}>
                                      {getShiftDisplayName(sh.shift)} (#{sh.shift.id})
                                    </strong>
                                  </label>
                                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                                    الكاشير: {sh.shift.user_name || 'كاشير'} | {formatShiftTime(sh.shift.opened_at)} إلى {sh.shift.closed_at ? formatShiftTime(sh.shift.closed_at) : 'مفتوح حالياً'}
                                  </div>
                                </div>
                              </div>

                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{
                                  padding: '4px 10px',
                                  borderRadius: '20px',
                                  fontSize: '12px',
                                  fontWeight: 'bold',
                                  background: sh.shift.closed_at ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.15)',
                                  color: sh.shift.closed_at ? '#10b981' : '#f59e0b'
                                }}>
                                  {sh.shift.closed_at ? 'مغلق' : 'مفتوح حالياً'}
                                </span>

                                <button
                                  type="button"
                                  className="btn btn-sm btn-outline-light"
                                  style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '12px', padding: '4px 10px' }}
                                  title="تحديد وطباعة هذا الشيفت فقط"
                                  onClick={() => {
                                    setSelectedDailyShiftIds([sh.shift.id]);
                                    setPrintReportFormat('thermal');
                                    setActiveReportForPrint('daily_summary');
                                  }}
                                >
                                  🖨️ طباعة هذا الشيفت فقط
                                </button>
                              </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px' }}>
                              <div className="daily-shift-stat-box" style={{ padding: '10px', borderRadius: '8px' }}>
                                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>إجمالي المبيعات:</div>
                                <div style={{ fontSize: '15px', fontWeight: 'bold' }}>{sh.totalSales} {settings.currency || 'ج.م'}</div>
                              </div>
                              <div className="daily-shift-stat-box" style={{ padding: '10px', borderRadius: '8px' }}>
                                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>مبيعات كاش:</div>
                                <div style={{ fontSize: '15px', fontWeight: 'bold' }}>{sh.cashSales} {settings.currency || 'ج.م'}</div>
                              </div>
                              <div className="daily-shift-stat-box" style={{ padding: '10px', borderRadius: '8px' }}>
                                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>المصروفات:</div>
                                <div style={{ fontSize: '15px', fontWeight: 'bold', color: '#ef4444' }}>-{sh.totalExpenses} {settings.currency || 'ج.م'}</div>
                              </div>
                              <div className="daily-shift-stat-box" style={{ padding: '10px', borderRadius: '8px' }}>
                                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>صافي الكاش:</div>
                                <div style={{ fontSize: '15px', fontWeight: 'bold', color: '#10b981' }}>{sh.netCash} {settings.currency || 'ج.م'}</div>
                              </div>
                              <div className="daily-shift-stat-box" style={{ padding: '10px', borderRadius: '8px' }}>
                                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>الفارق (عجز/زيادة):</div>
                                <div style={{ fontSize: '15px', fontWeight: 'bold' }}>{sh.shift.cash_difference || 0} {settings.currency || 'ج.م'}</div>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })()}
            {/* ================= CANCELLATIONS & VOIDS REPORT ================= */}
            {reportsTab === 'cancellations' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{
                  background: 'var(--bg-card, #1e293b)',
                  padding: '16px 20px',
                  borderRadius: '12px',
                  border: '1px solid var(--border-color, rgba(255,255,255,0.08))',
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px'
                }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px' }}>
                    <label style={{ fontSize: '13px', fontWeight: '700' }}>من تاريخ:</label>
                    <input
                      type="date"
                      className="report-date-input"
                      value={reportDateFrom}
                      onChange={(e) => setReportDateFrom(e.target.value)}
                    />
                    <label style={{ fontSize: '13px', fontWeight: '700' }}>إلى تاريخ:</label>
                    <input
                      type="date"
                      className="report-date-input"
                      value={reportDateTo}
                      onChange={(e) => setReportDateTo(e.target.value)}
                    />
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={() => handleGenerateReport('cancellations')}
                      disabled={reportLoading}
                    >
                      {reportLoading ? '⏳ جاري التحميل...' : '🔍 عرض التقرير'}
                    </button>
                  </div>
                  <button
                    type="button"
                    className="btn btn-outline-light btn-sm"
                    onClick={() => setActiveReportForPrint('cancellations')}
                  >
                    🖨️ طباعة تقرير الإلغاءات (80mm / A4)
                  </button>
                </div>

                {reportData && reportData.type === 'cancellations' && (
                  <div id="printable-cancellations-report" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div className="stats-cards-grid">
                      <div className="stat-card">
                        <div className="stat-icon">🚫</div>
                        <div className="stat-info" style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                          <span className="stat-label">إجمالي عمليات الإلغاء</span>
                          <span className="stat-number text-danger">{reportData.summary?.totalEvents || 0}</span>
                          <small>فواتير + أصناف ملغية</small>
                        </div>
                      </div>
                      <div className="stat-card">
                        <div className="stat-icon">🧾</div>
                        <div className="stat-info" style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                          <span className="stat-label">فواتير ملغية بالكامل</span>
                          <span className="stat-number">{reportData.summary?.totalCancelledOrders || 0}</span>
                          <small>{(reportData.summary?.totalCancelledOrdersAmount || 0).toFixed(2)} {settings.currency || 'ج.م'}</small>
                        </div>
                      </div>
                      <div className="stat-card">
                        <div className="stat-icon">🗑️</div>
                        <div className="stat-info" style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                          <span className="stat-label">أصناف ملغية من الطاولات</span>
                          <span className="stat-number">{reportData.summary?.totalVoidedItemEvents || 0}</span>
                          <small>كمية: {reportData.summary?.totalVoidedItemsQty || 0} — {(reportData.summary?.totalVoidedItemsAmount || 0).toFixed(2)} {settings.currency || 'ج.م'}</small>
                        </div>
                      </div>
                      <div className="stat-card">
                        <div className="stat-icon">💸</div>
                        <div className="stat-info" style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                          <span className="stat-label">إجمالي قيمة الإلغاءات</span>
                          <span className="stat-number text-danger">{(reportData.summary?.grandCancelledAmount || 0).toFixed(2)} {settings.currency || 'ج.م'}</span>
                          <small>من {reportData.dateFrom} إلى {reportData.dateTo}</small>
                        </div>
                      </div>
                    </div>

                    <div className="table-container">
                      <table className="custom-table">
                        <thead>
                          <tr>
                            <th>النوع</th>
                            <th>المنتج / الصنف الملغي</th>
                            <th>الكمية</th>
                            <th>القيمة</th>
                            <th>الطاولة / الفاتورة</th>
                            <th>سبب الإلغاء</th>
                            <th>مين لغاه</th>
                            <th>التاريخ والساعة</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(!reportData.entries || reportData.entries.length === 0) ? (
                            <tr>
                              <td colSpan="8" style={{ textAlign: 'center', padding: '28px', color: 'var(--text-muted)' }}>
                                ✅ لا توجد أي إلغاءات أو مرتجعات مسجلة في هذه الفترة
                              </td>
                            </tr>
                          ) : (
                            reportData.entries.map((row) => (
                              <tr key={row.id}>
                                <td>
                                  <span style={{
                                    display: 'inline-block',
                                    padding: '3px 8px',
                                    borderRadius: '6px',
                                    fontSize: '11.5px',
                                    fontWeight: 'bold',
                                    background: row.type === 'cancelled_order' ? 'rgba(220, 38, 38, 0.14)' : 'rgba(245, 158, 11, 0.16)',
                                    color: row.type === 'cancelled_order' ? '#dc2626' : '#b45309'
                                  }}>
                                    {row.typeLabel}
                                  </span>
                                </td>
                                <td><strong>{row.productName}</strong></td>
                                <td style={{ textAlign: 'center', fontWeight: 'bold' }}>× {row.qty}</td>
                                <td style={{ fontWeight: 'bold', color: '#dc2626' }}>
                                  {(Number(row.totalAmount) || 0).toFixed(2)} {settings.currency || 'ج.م'}
                                </td>
                                <td>
                                  {row.tableName}
                                  {row.invoiceNo && row.invoiceNo !== '—' ? <small style={{ display: 'block', color: 'var(--text-muted)' }}>فاتورة #{row.invoiceNo}</small> : null}
                                </td>
                                <td style={{ maxWidth: '240px', whiteSpace: 'normal' }}>{row.reason}</td>
                                <td><strong>👤 {row.actorName}</strong></td>
                                <td style={{ whiteSpace: 'nowrap', fontSize: '12px' }}>
                                  {formatCairoDateTime(row.cancelledAt)}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}
            </div>
          </SectionErrorBoundary>
  );
}
