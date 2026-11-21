import React from 'react';
import { formatCairoDateTime, formatShiftTime, getLocalDateString, getShiftDisplayName } from '../../utils/dateTime.js';

export default function PrintableReportModal({
  activeReportForPrint,
  currentUser,
  dashboardData,
  inventoryFilterMode,
  printReport,
  printReportFormat,
  reportData,
  reportDateFrom,
  reportDateTo,
  selectedDailyShiftIds,
  setActiveReportForPrint,
  setPrintReportFormat,
  settings,
  shiftReportSection
}) {
  return (
    <div className="modal-overlay" onClick={() => setActiveReportForPrint(null)}>
          <div className="receipt-modal-card report-print-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: printReportFormat === 'thermal' ? '460px' : '840px', width: '95%', maxHeight: '92vh', overflowY: 'auto', transition: 'max-width 0.2s' }}>
            {/* Format Switcher */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', background: '#f1f5f9', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1' }}>
              <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#1e293b' }}>🖨️ تنسيق الطباعة:</span>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  type="button"
                  onClick={() => setPrintReportFormat('thermal')}
                  style={{
                    padding: '5px 12px',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    background: printReportFormat === 'thermal' ? '#0f172a' : '#fff',
                    color: printReportFormat === 'thermal' ? '#fff' : '#334155',
                    border: '1px solid #94a3b8'
                  }}
                >
                  🧾 بون كاشير حراري (80mm)
                </button>
                <button
                  type="button"
                  onClick={() => setPrintReportFormat('a4')}
                  style={{
                    padding: '5px 12px',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    background: printReportFormat === 'a4' ? '#0f172a' : '#fff',
                    color: printReportFormat === 'a4' ? '#fff' : '#334155',
                    border: '1px solid #94a3b8'
                  }}
                >
                  📄 تقرير كامل (A4)
                </button>
              </div>
            </div>

            <div id="printable-report" className={`printable-report-container ${printReportFormat === 'thermal' ? 'printable-report-thermal' : 'printable-report-a4'}`} style={{ padding: printReportFormat === 'thermal' ? '12px 14px' : '24px', background: '#fff', color: '#000', borderRadius: '8px' }}>
              {/* Report Header */}
              <div style={{ textAlign: 'center', borderBottom: '2px solid #333', paddingBottom: '12px', marginBottom: '14px' }}>
                <h2 style={{ margin: '0 0 4px 0', fontSize: printReportFormat === 'thermal' ? '18px' : '24px', fontWeight: '900', color: '#000' }}>
                  {settings.cafe_name || 'التكية أسيوط الجديدة'}
                </h2>
                <div style={{ fontSize: printReportFormat === 'thermal' ? '14px' : '18px', fontWeight: 'bold', color: '#333' }}>
                  {activeReportForPrint === 'sales' && `📊 تقرير المبيعات (${reportDateFrom} إلى ${reportDateTo})`}
                  {activeReportForPrint === 'inventory' && (
                    inventoryFilterMode === 'today' ? '☀️ تقرير مستهلك اليوم' :
                    inventoryFilterMode === 'week' ? '📅 تقرير مستهلك الأسبوع' :
                    inventoryFilterMode === 'low' ? '⚠️ تقرير النواقص والأصناف تحت حد الطلب' :
                    '📦 تقرير جرد المخزون والأصناف'
                  )}
                  {activeReportForPrint === 'shifts' && (printReportFormat === 'thermal' ? `⭐ تقرير تقفيل وردية (Z-Report) ⭐` : `⏱️ تقرير الوردية التفصيلي`)}
                  {activeReportForPrint === 'quick' && '⚡ تقرير ملخص اليوم السريع'}
                  {activeReportForPrint === 'daily_summary' && `📊 تقرير اليوم الشامل (${reportData?.date || ''}) [${selectedDailyShiftIds.length} وردية]`}
                  {activeReportForPrint === 'cancellations' && `🚫 تقرير الإلغاءات والمرتجعات (${reportData?.dateFrom || reportDateFrom} إلى ${reportData?.dateTo || reportDateTo})`}
                </div>
                {activeReportForPrint === 'shifts' && reportData?.shift && (
                  <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#059669', marginTop: '4px' }}>
                    {getShiftDisplayName(reportData.shift)}
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#666', marginTop: '8px', borderTop: '1px dashed #ccc', paddingTop: '6px' }}>
                  <span>التاريخ: {getLocalDateString(new Date())}</span>
                  <span>المستخدم: {currentUser?.name || 'مدير النظام'}</span>
                  <span>الفرع: {settings.branch_name || 'الفرع الرئيسي'}</span>
                </div>
              </div>

              {/* SALES REPORT CONTENT */}
              {activeReportForPrint === 'sales' && reportData && (
                <div>
                  <div style={{ display: 'grid', gridTemplateColumns: printReportFormat === 'thermal' ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: '8px', marginBottom: '16px', background: '#f8fafc', padding: '10px', border: '1px solid #e2e8f0', borderRadius: '6px' }}>
                    <div><span style={{ fontSize: '11px', color: '#64748b' }}>إجمالي المبيعات:</span><br /><strong style={{ fontSize: '15px', color: '#0f172a' }}>{Number(reportData.summary?.total_sales || 0).toFixed(2)} {settings.currency || 'ج.م'}</strong></div>
                    <div><span style={{ fontSize: '11px', color: '#64748b' }}>عدد الفواتير:</span><br /><strong style={{ fontSize: '15px', color: '#0f172a' }}>{reportData.summary?.order_count || 0} طلب</strong></div>
                    <div><span style={{ fontSize: '11px', color: '#64748b' }}>نقدي (كاش):</span><br /><strong style={{ fontSize: '15px', color: '#0f172a' }}>{Number(reportData.summary?.cash_sales || 0).toFixed(2)} {settings.currency || 'ج.م'}</strong></div>
                    <div><span style={{ fontSize: '11px', color: '#64748b' }}>محافظ وفيزا:</span><br /><strong style={{ fontSize: '15px', color: '#0f172a' }}>{((Number(reportData.summary?.card_sales) || 0) + (Number(reportData.summary?.wallet_sales) || 0)).toFixed(2)} {settings.currency || 'ج.م'}</strong></div>
                  </div>

                  {reportData.topProducts && reportData.topProducts.length > 0 && (
                    <div style={{ marginBottom: '16px' }}>
                      <h4 style={{ margin: '0 0 8px 0', borderBottom: '1.5px solid #000', paddingBottom: '4px', fontSize: '13px' }}>🏆 الأصناف الأكثر مبيعاً</h4>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11.5px' }}>
                        <thead>
                          <tr style={{ background: '#f1f5f9', borderBottom: '1px solid #000' }}>
                            <th style={{ padding: '5px', textAlign: 'right' }}>#</th>
                            <th style={{ padding: '5px', textAlign: 'right' }}>الصنف</th>
                            <th style={{ padding: '5px', textAlign: 'center' }}>الكمية</th>
                            <th style={{ padding: '5px', textAlign: 'left' }}>الإجمالي</th>
                          </tr>
                        </thead>
                        <tbody>
                          {reportData.topProducts.map((p, i) => (
                            <tr key={i} style={{ borderBottom: '1px solid #e2e8f0' }}>
                              <td style={{ padding: '5px' }}>{i + 1}</td>
                              <td style={{ padding: '5px' }}><strong>{p.product_name}</strong></td>
                              <td style={{ padding: '5px', textAlign: 'center' }}>{p.total_qty}</td>
                              <td style={{ padding: '5px', textAlign: 'left' }}>{p.total_sales || p.total_amount || 0} {settings.currency || 'ج.م'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {reportData.bySection && reportData.bySection.length > 0 && (
                    <div style={{ marginBottom: '16px' }}>
                      <h4 style={{ margin: '0 0 8px 0', borderBottom: '1.5px solid #000', paddingBottom: '4px', fontSize: '13px' }}>📍 المبيعات حسب الصالة والطاولة</h4>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11.5px' }}>
                        <thead>
                          <tr style={{ background: '#f1f5f9', borderBottom: '1px solid #000' }}>
                            <th style={{ padding: '5px', textAlign: 'right' }}>المكان / الطاولة</th>
                            <th style={{ padding: '5px', textAlign: 'center' }}>عدد الطلبات</th>
                            <th style={{ padding: '5px', textAlign: 'left' }}>الإجمالي</th>
                          </tr>
                        </thead>
                        <tbody>
                          {reportData.bySection.map((sec, i) => (
                            <tr key={i} style={{ borderBottom: '1px solid #e2e8f0' }}>
                              <td style={{ padding: '5px' }}><strong>{sec.table_name || 'صالة'}</strong></td>
                              <td style={{ padding: '5px', textAlign: 'center' }}>{sec.order_count}</td>
                              <td style={{ padding: '5px', textAlign: 'left' }}>{sec.total} {settings.currency || 'ج.م'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* INVENTORY REPORT CONTENT */}
              {activeReportForPrint === 'inventory' && reportData && (
                <div>
                  {inventoryFilterMode === 'today' && (
                    <>
                      <h4 style={{ margin: '0 0 8px 0', borderBottom: '1.5px solid #000', paddingBottom: '4px', fontSize: '13px' }}>☀️ مستهلك اليوم فقط</h4>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11.5px' }}>
                        <thead>
                          <tr style={{ background: '#f1f5f9', borderBottom: '1px solid #000' }}>
                            <th style={{ padding: '5px', textAlign: 'right' }}>الصنف</th>
                            <th style={{ padding: '5px', textAlign: 'right' }}>القسم</th>
                            <th style={{ padding: '5px', textAlign: 'center' }}>الكمية المستهلكة</th>
                            <th style={{ padding: '5px', textAlign: 'center' }}>الرصيد المتبقي</th>
                            <th style={{ padding: '5px', textAlign: 'left' }}>التكلفة</th>
                            <th style={{ padding: '5px', textAlign: 'left' }}>إجمالي القيمة</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(reportData.consumedToday || []).length === 0 ? (
                            <tr>
                              <td colSpan="6" style={{ textAlign: 'center', padding: '12px' }}>لا يوجد استهلاك مسجل لليوم حتى الآن</td>
                            </tr>
                          ) : (
                            reportData.consumedToday.map((p) => {
                              const cost = Number(p.cost ?? 0);
                              const qtyOut = Number(p.qty_out) || 0;
                              const totalVal = cost * qtyOut;
                              return (
                                <tr key={p.product_id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                                  <td style={{ padding: '5px' }}><strong>{p.product_name}</strong></td>
                                  <td style={{ padding: '5px' }}>{p.category_name || '-'}</td>
                                  <td style={{ padding: '5px', textAlign: 'center', fontWeight: 'bold' }}>{qtyOut}</td>
                                  <td style={{ padding: '5px', textAlign: 'center' }}>{p.stock_qty ?? 0}</td>
                                  <td style={{ padding: '5px', textAlign: 'left' }}>{cost.toFixed(2)} {settings.currency || 'ج.م'}</td>
                                  <td style={{ padding: '5px', textAlign: 'left', fontWeight: 'bold' }}>{totalVal.toFixed(2)} {settings.currency || 'ج.م'}</td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </>
                  )}

                  {inventoryFilterMode === 'week' && (
                    <>
                      <h4 style={{ margin: '0 0 8px 0', borderBottom: '1.5px solid #000', paddingBottom: '4px', fontSize: '13px' }}>📅 مستهلك آخر أسبوع</h4>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11.5px' }}>
                        <thead>
                          <tr style={{ background: '#f1f5f9', borderBottom: '1px solid #000' }}>
                            <th style={{ padding: '5px', textAlign: 'right' }}>الصنف</th>
                            <th style={{ padding: '5px', textAlign: 'right' }}>القسم</th>
                            <th style={{ padding: '5px', textAlign: 'center' }}>الكمية المستهلكة</th>
                            <th style={{ padding: '5px', textAlign: 'center' }}>الرصيد المتبقي</th>
                            <th style={{ padding: '5px', textAlign: 'left' }}>التكلفة</th>
                            <th style={{ padding: '5px', textAlign: 'left' }}>إجمالي القيمة</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(reportData.consumedWeek || []).length === 0 ? (
                            <tr>
                              <td colSpan="6" style={{ textAlign: 'center', padding: '12px' }}>لا يوجد استهلاك مسجل للأسبوع</td>
                            </tr>
                          ) : (
                            reportData.consumedWeek.map((p) => {
                              const cost = Number(p.cost ?? 0);
                              const qtyOut = Number(p.qty_out) || 0;
                              const totalVal = cost * qtyOut;
                              return (
                                <tr key={p.product_id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                                  <td style={{ padding: '5px' }}><strong>{p.product_name}</strong></td>
                                  <td style={{ padding: '5px' }}>{p.category_name || '-'}</td>
                                  <td style={{ padding: '5px', textAlign: 'center', fontWeight: 'bold' }}>{qtyOut}</td>
                                  <td style={{ padding: '5px', textAlign: 'center' }}>{p.stock_qty ?? 0}</td>
                                  <td style={{ padding: '5px', textAlign: 'left' }}>{cost.toFixed(2)} {settings.currency || 'ج.م'}</td>
                                  <td style={{ padding: '5px', textAlign: 'left', fontWeight: 'bold' }}>{totalVal.toFixed(2)} {settings.currency || 'ج.م'}</td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </>
                  )}

                  {inventoryFilterMode === 'low' && (
                    <>
                      <h4 style={{ margin: '0 0 8px 0', borderBottom: '1.5px solid #000', paddingBottom: '4px', fontSize: '13px' }}>⚠️ نواقص المخزون والأصناف تحت حد الطلب</h4>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11.5px' }}>
                        <thead>
                          <tr style={{ background: '#fff1f2', borderBottom: '1px solid #000' }}>
                            <th style={{ padding: '5px', textAlign: 'right' }}>الصنف</th>
                            <th style={{ padding: '5px', textAlign: 'right' }}>القسم</th>
                            <th style={{ padding: '5px', textAlign: 'center' }}>الرصيد الحالي</th>
                            <th style={{ padding: '5px', textAlign: 'center' }}>حد الطلب</th>
                            <th style={{ padding: '5px', textAlign: 'left' }}>سعر التكلفة</th>
                            <th style={{ padding: '5px', textAlign: 'left' }}>إجمالي القيمة</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(reportData.lowStock || []).length === 0 ? (
                            <tr>
                              <td colSpan="6" style={{ textAlign: 'center', padding: '12px', color: '#16a34a' }}>✅ لا توجد أصناف تحت حد الطلب</td>
                            </tr>
                          ) : (
                            reportData.lowStock.map((p) => {
                              const cost = Number(p.cost ?? p.cost_price ?? 0);
                              const stock = Number(p.stock_qty) || 0;
                              const totalVal = cost * stock;
                              return (
                                <tr key={p.id} style={{ borderBottom: '1px solid #e2e8f0', background: '#fff1f2' }}>
                                  <td style={{ padding: '5px' }}><strong>{p.name}</strong> ⚠️</td>
                                  <td style={{ padding: '5px' }}>{p.category_name || '-'}</td>
                                  <td style={{ padding: '5px', textAlign: 'center', fontWeight: 'bold', color: '#dc2626' }}>{stock}</td>
                                  <td style={{ padding: '5px', textAlign: 'center' }}>{p.low_stock_threshold ?? p.min_stock ?? 0}</td>
                                  <td style={{ padding: '5px', textAlign: 'left' }}>{cost.toFixed(2)} {settings.currency || 'ج.م'}</td>
                                  <td style={{ padding: '5px', textAlign: 'left', fontWeight: 'bold' }}>{totalVal.toFixed(2)} {settings.currency || 'ج.م'}</td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </>
                  )}

                  {inventoryFilterMode === 'all' && (
                    <>
                      <h4 style={{ margin: '0 0 8px 0', borderBottom: '1.5px solid #000', paddingBottom: '4px', fontSize: '13px' }}>📦 جرد الأصناف الحالي (المخزون الكلي)</h4>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11.5px' }}>
                        <thead>
                          <tr style={{ background: '#f1f5f9', borderBottom: '1px solid #000' }}>
                            <th style={{ padding: '5px', textAlign: 'right' }}>الصنف</th>
                            <th style={{ padding: '5px', textAlign: 'right' }}>القسم</th>
                            <th style={{ padding: '5px', textAlign: 'center' }}>الرصيد الحالي</th>
                            <th style={{ padding: '5px', textAlign: 'center' }}>حد الطلب</th>
                            <th style={{ padding: '5px', textAlign: 'left' }}>سعر التكلفة</th>
                            <th style={{ padding: '5px', textAlign: 'left' }}>إجمالي القيمة</th>
                          </tr>
                        </thead>
                        <tbody>
                          {reportData.allProducts?.map((p) => {
                            const cost = Number(p.cost ?? p.cost_price ?? 0);
                            const stock = Number(p.stock_qty) || 0;
                            const totalVal = cost * stock;
                            const isLow = stock <= Number(p.low_stock_threshold ?? p.min_stock ?? 5);
                            return (
                              <tr key={p.id} style={{ borderBottom: '1px solid #e2e8f0', background: isLow ? '#fff1f2' : 'transparent' }}>
                                <td style={{ padding: '5px' }}><strong>{p.name}</strong> {isLow && '⚠️'}</td>
                                <td style={{ padding: '5px' }}>{p.category_name || '-'}</td>
                                <td style={{ padding: '5px', textAlign: 'center', fontWeight: 'bold' }}>{stock}</td>
                                <td style={{ padding: '5px', textAlign: 'center' }}>{p.low_stock_threshold ?? p.min_stock ?? 0}</td>
                                <td style={{ padding: '5px', textAlign: 'left' }}>{cost.toFixed(2)} {settings.currency || 'ج.م'}</td>
                                <td style={{ padding: '5px', textAlign: 'left', fontWeight: 'bold' }}>{totalVal.toFixed(2)} {settings.currency || 'ج.م'}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </>
                  )}
                </div>
              )}

              {/* SHIFTS REPORT CONTENT */}
              {activeReportForPrint === 'shifts' && reportData?.shift && (
                printReportFormat === 'thermal' ? (
                  /* THERMAL RECEIPT 80MM LAYOUT */
                  <div style={{ fontFamily: 'Tahoma, Arial, sans-serif', fontSize: '13px', color: '#000', direction: 'rtl', textAlign: 'right' }}>
                    <div style={{ borderTop: '1px dashed #000', borderBottom: '1px dashed #000', padding: '6px 0', margin: '6px 0', fontSize: '12.5px', lineHeight: '1.65' }}>
                      <div>👤 <strong>الكاشير:</strong> {reportData.shift.user_name || 'كاشير'}</div>
                      <div>📅 <strong>التاريخ:</strong> {getLocalDateString(reportData.shift.opened_at)}</div>
                      <div>⏱️ <strong>من:</strong> {formatShiftTime(reportData.shift.opened_at)} <strong>إلى:</strong> {reportData.shift.closed_at ? formatShiftTime(reportData.shift.closed_at) : 'مفتوحة حالياً'}</div>
                    </div>

                    {/* Cash audit */}
                    {(shiftReportSection === 'all' || shiftReportSection === 'cash') && (
                      <div style={{ margin: '8px 0' }}>
                        <div style={{ fontWeight: 'bold', fontSize: '13px', borderBottom: '1px solid #000', paddingBottom: '2px', marginBottom: '4px' }}>💵 مطابقة وحسابات الخزينة</div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                          <span>كاش البداية:</span>
                          <span>{Number(reportData.shift.opening_cash || 0).toFixed(2)} {settings.currency || 'ج.م'}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                          <span>(+) مبيعات نقدية:</span>
                          <span style={{ fontWeight: 'bold' }}>+{Number(reportData.shift.cash_sales || 0).toFixed(2)} {settings.currency || 'ج.م'}</span>
                        </div>
                        {(Number(reportData.shift.card_sales || 0) > 0 || Number(reportData.shift.wallet_sales || 0) > 0) && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', color: '#333' }}>
                            <span>(+) فيزا ومحافظ:</span>
                            <span>+{((Number(reportData.shift.card_sales) || 0) + (Number(reportData.shift.wallet_sales) || 0)).toFixed(2)} {settings.currency || 'ج.م'}</span>
                          </div>
                        )}
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                          <span>(-) إجمالي المصروفات:</span>
                          <span>-{Number(reportData.shift.expenses_total || 0).toFixed(2)} {settings.currency || 'ج.م'}</span>
                        </div>
                        <div style={{ borderTop: '1px dashed #000', margin: '4px 0' }}></div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', fontWeight: 'bold' }}>
                          <span>(=) المتوقع وقت الإغلاق:</span>
                          <span>{Number(reportData.shift.expected_cash ?? ((Number(reportData.shift.opening_cash) || 0) + (Number(reportData.shift.cash_sales) || 0) - (Number(reportData.shift.expenses_total) || 0))).toFixed(2)} {settings.currency || 'ج.م'}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                          <span>الفعلي المسجل (المعدود):</span>
                          <span>{reportData.shift.actual_cash !== null && reportData.shift.actual_cash !== undefined ? `${Number(reportData.shift.actual_cash).toFixed(2)} ${settings.currency || 'ج.م'}` : 'غير مسجل'}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', fontWeight: 'bold', fontSize: '12px' }}>
                          <span>الفارق وقت الإغلاق:</span>
                          <span>
                            {(() => {
                              const diff = Number(reportData.shift.cash_difference) || 0;
                              if (diff < -0.01) return `عجز ${Math.abs(diff).toFixed(2)} ${settings.currency || 'ج.م'}`;
                              if (diff > 0.01) return `زيادة ${diff.toFixed(2)} ${settings.currency || 'ج.م'}`;
                              return 'مطابق تماماً ✅';
                            })()}
                          </span>
                        </div>
                        {reportData.shift.closed_at && ((reportData.postCloseAdjustments && reportData.postCloseAdjustments.length > 0) || Number(reportData.shift.post_close_adjustments_total || 0) !== 0) && (
                          <div style={{ borderTop: '1px dashed #000', marginTop: '6px', paddingTop: '4px' }}>
                            <div style={{ fontWeight: 'bold', fontSize: '12px', marginBottom: '2px' }}>📌 تسويات لاحقة (بعد الإغلاق):</div>
                            {(reportData.postCloseAdjustments || []).map((adj) => (
                              <div key={adj.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11.5px', padding: '1px 0' }}>
                                <span>{adj.type === 'in' ? '(+) إضافة' : '(-) خصم'}: {adj.reason || 'تسوية'} ({adj.created_by || 'الإدارة'})</span>
                                <span>{adj.type === 'in' ? `+${Number(adj.amount).toFixed(2)}` : `-${Number(adj.amount).toFixed(2)}`} {settings.currency || 'ج.م'}</span>
                              </div>
                            ))}
                            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', fontWeight: 'bold' }}>
                              <span>المتوقع المحدّث:</span>
                              <span>{Number(reportData.shift.updated_expected_cash ?? reportData.shift.expected_cash ?? 0).toFixed(2)} {settings.currency || 'ج.م'}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', fontWeight: 'bold' }}>
                              <span>الفارق النهائي (بعد الإغلاق):</span>
                              <span>
                                {(() => {
                                  const fDiff = Number(reportData.shift.final_cash_difference) || 0;
                                  if (fDiff < -0.01) return `عجز ${Math.abs(fDiff).toFixed(2)} ${settings.currency || 'ج.م'} (بعد الإغلاق)`;
                                  if (fDiff > 0.01) return `+${fDiff.toFixed(2)} زيادة ${settings.currency || 'ج.م'} (بعد الإغلاق)`;
                                  return 'مطابق تماماً (بعد الإغلاق)';
                                })()}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Items Sold */}
                    {(shiftReportSection === 'all' || shiftReportSection === 'items') && reportData.itemsSummary && reportData.itemsSummary.length > 0 && (
                      <div style={{ margin: '8px 0', borderTop: '1px dashed #000', paddingTop: '6px' }}>
                        <div style={{ fontWeight: 'bold', fontSize: '12px', marginBottom: '4px' }}>☕ الأصناف المباعة ({reportData.itemsSummary.length})</div>
                        <table style={{ width: '100%', fontSize: '12.5px', borderCollapse: 'collapse' }}>
                          <thead>
                            <tr style={{ borderBottom: '1px solid #000', textAlign: 'right' }}>
                              <th style={{ padding: '2px 0' }}>الصنف</th>
                              <th style={{ padding: '2px 0', textAlign: 'center' }}>الكمية</th>
                              <th style={{ padding: '2px 0', textAlign: 'left' }}>الإجمالي</th>
                            </tr>
                          </thead>
                          <tbody>
                            {reportData.itemsSummary.map((it, idx) => (
                              <tr key={idx} style={{ borderBottom: '1px dotted #ccc' }}>
                                <td style={{ padding: '2px 0' }}>{it.product_name}</td>
                                <td style={{ padding: '2px 0', textAlign: 'center' }}>{it.total_qty}</td>
                                <td style={{ padding: '2px 0', textAlign: 'left', fontWeight: 'bold' }}>{it.total_sales ?? 0}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}



                    {/* Expenses */}
                    {(shiftReportSection === 'all' || shiftReportSection === 'expenses') && reportData.expenses && reportData.expenses.length > 0 && (
                      <div style={{ margin: '8px 0', borderTop: '1px dashed #000', paddingTop: '6px' }}>
                        <div style={{ fontWeight: 'bold', fontSize: '12px', marginBottom: '4px' }}>💸 المصروفات ({reportData.expenses.length})</div>
                        <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
                          <tbody>
                            {reportData.expenses.map((e) => (
                              <tr key={e.id} style={{ borderBottom: '1px dotted #ccc' }}>
                                <td style={{ padding: '2px 0' }}>
                                  <div><strong>{e.category || e.description || 'مصروف عام'}</strong></div>
                                  {e.notes && <div style={{ fontSize: '10.5px', color: '#333' }}>📝 {e.notes}</div>}
                                </td>
                                <td style={{ padding: '2px 0', textAlign: 'left', fontWeight: 'bold', verticalAlign: 'top' }}>-{e.amount} {settings.currency || 'ج.م'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                ) : (
                  /* A4 DETAILED SHIFTS REPORT */
                  <div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '16px', background: '#f8fafc', padding: '12px', border: '1px solid #e2e8f0', borderRadius: '6px' }}>
                      <div><span style={{ fontSize: '12px', color: '#64748b' }}>الوردية:</span><br /><strong>{getShiftDisplayName(reportData.shift)}</strong></div>
                      <div><span style={{ fontSize: '12px', color: '#64748b' }}>الكاشير:</span><br /><strong>{reportData.shift.user_name || 'كاشير'}</strong></div>
                      <div><span style={{ fontSize: '12px', color: '#64748b' }}>الفترة:</span><br /><span>{formatShiftTime(reportData.shift.opened_at)} إلى {reportData.shift.closed_at ? formatShiftTime(reportData.shift.closed_at) : 'مفتوح'}</span></div>
                      <div><span style={{ fontSize: '12px', color: '#64748b' }}>كاش البداية:</span><br /><strong>{reportData.shift.opening_cash || 0} {settings.currency || 'ج.م'}</strong></div>
                      <div><span style={{ fontSize: '12px', color: '#64748b' }}>مبيعات الكاش:</span><br /><strong>{reportData.shift.cash_sales || 0} {settings.currency || 'ج.م'}</strong></div>
                      <div><span style={{ fontSize: '12px', color: '#64748b' }}>المصروفات:</span><br /><strong style={{ color: '#ef4444' }}>-{reportData.shift.expenses_total || 0} {settings.currency || 'ج.م'}</strong></div>
                      <div><span style={{ fontSize: '12px', color: '#64748b' }}>المتوقع وقت الإغلاق:</span><br /><strong>{Number(reportData.shift.expected_cash ?? reportData.shift.closing_cash ?? 0).toFixed(2)} {settings.currency || 'ج.م'}</strong></div>
                      <div><span style={{ fontSize: '12px', color: '#64748b' }}>الكاش الفعلي المسجل (المعدود):</span><br /><strong>{reportData.shift.actual_cash !== null && reportData.shift.actual_cash !== undefined ? Number(reportData.shift.actual_cash).toFixed(2) : '-'} {settings.currency || 'ج.م'}</strong></div>
                      <div><span style={{ fontSize: '12px', color: '#64748b' }}>الفارق وقت الإغلاق:</span><br /><strong>{Number(reportData.shift.cash_difference || 0).toFixed(2)} {settings.currency || 'ج.م'}</strong></div>
                      {reportData.shift.closed_at && ((reportData.postCloseAdjustments && reportData.postCloseAdjustments.length > 0) || Number(reportData.shift.post_close_adjustments_total || 0) !== 0) && (
                        <>
                          <div><span style={{ fontSize: '12px', color: '#b45309' }}>تسويات لاحقة (بعد الإغلاق):</span><br /><strong>{Number(reportData.shift.post_close_adjustments_total || 0).toFixed(2)} {settings.currency || 'ج.م'}</strong></div>
                          <div><span style={{ fontSize: '12px', color: '#b45309' }}>المتوقع المحدّث:</span><br /><strong>{Number(reportData.shift.updated_expected_cash ?? reportData.shift.expected_cash ?? 0).toFixed(2)} {settings.currency || 'ج.م'}</strong></div>
                          <div><span style={{ fontSize: '12px', color: '#b45309' }}>الفارق النهائي (بعد الإغلاق):</span><br /><strong>{Number(reportData.shift.final_cash_difference || 0) > 0 ? `+${Number(reportData.shift.final_cash_difference).toFixed(2)} زيادة` : Number(reportData.shift.final_cash_difference || 0).toFixed(2)} {settings.currency || 'ج.م'}</strong></div>
                        </>
                      )}
                    </div>

                    {(shiftReportSection === 'all' || shiftReportSection === 'items') && reportData.itemsSummary && reportData.itemsSummary.length > 0 && (
                      <div style={{ marginBottom: '16px' }}>
                        <h4 style={{ margin: '0 0 8px 0', borderBottom: '1.5px solid #000', paddingBottom: '4px' }}>☕ الأصناف المباعة بالوردية</h4>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                          <thead>
                            <tr style={{ background: '#f1f5f9', borderBottom: '1px solid #000' }}>
                              <th style={{ padding: '6px', textAlign: 'right' }}>الصنف</th>
                              <th style={{ padding: '6px', textAlign: 'center' }}>الكمية</th>
                              <th style={{ padding: '6px', textAlign: 'left' }}>الإجمالي</th>
                            </tr>
                          </thead>
                          <tbody>
                            {reportData.itemsSummary.map((it, i) => (
                              <tr key={i} style={{ borderBottom: '1px solid #e2e8f0' }}>
                                <td style={{ padding: '6px' }}><strong>{it.product_name}</strong></td>
                                <td style={{ padding: '6px', textAlign: 'center' }}>{it.total_qty}</td>
                                <td style={{ padding: '6px', textAlign: 'left' }}>{it.total_sales ?? 0} {settings.currency || 'ج.م'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}



                    {(shiftReportSection === 'all' || shiftReportSection === 'expenses') && reportData.expenses && reportData.expenses.length > 0 && (
                      <div>
                        <h4 style={{ margin: '0 0 8px 0', borderBottom: '1.5px solid #000', paddingBottom: '4px' }}>💸 المصروفات المسجلة</h4>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                          <thead>
                            <tr style={{ background: '#f1f5f9', borderBottom: '1px solid #000' }}>
                              <th style={{ padding: '6px', textAlign: 'right' }}>البيان</th>
                              <th style={{ padding: '6px', textAlign: 'right' }}>المسؤول</th>
                              <th style={{ padding: '6px', textAlign: 'left' }}>المبلغ</th>
                            </tr>
                          </thead>
                          <tbody>
                            {reportData.expenses.map((e) => (
                              <tr key={e.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                                <td style={{ padding: '6px' }}>
                                  <div><strong>{e.category || e.description || 'مصروف عام'}</strong></div>
                                  {e.notes && <small style={{ color: '#475569', display: 'block' }}>📝 {e.notes}</small>}
                                </td>
                                <td style={{ padding: '6px' }}>{e.user_name || '-'}</td>
                                <td style={{ padding: '6px', textAlign: 'left', fontWeight: 'bold', color: '#ef4444' }}>-{e.amount} {settings.currency || 'ج.م'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )
              )}

              {/* QUICK DASHBOARD SUMMARY CONTENT */}
              {activeReportForPrint === 'quick' && dashboardData && (
                <div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '16px', background: '#f8fafc', padding: '14px', border: '1px solid #e2e8f0', borderRadius: '6px' }}>
                    <div><span style={{ fontSize: '12px', color: '#64748b' }}>إجمالي مبيعات اليوم:</span><br /><strong style={{ fontSize: '18px', color: '#0f172a' }}>{dashboardData.today?.total || 0} {settings.currency || 'ج.م'}</strong><br /><small>{dashboardData.today?.count || 0} طلب</small></div>
                    <div><span style={{ fontSize: '12px', color: '#64748b' }}>مبيعات الكاش:</span><br /><strong style={{ fontSize: '18px', color: '#0f172a' }}>{dashboardData.today?.cash_total || 0} {settings.currency || 'ج.م'}</strong></div>
                    <div><span style={{ fontSize: '12px', color: '#64748b' }}>محافظ وفيزا:</span><br /><strong style={{ fontSize: '18px', color: '#0f172a' }}>{((dashboardData.today?.card_total || 0) + (dashboardData.today?.wallet_total || 0))} {settings.currency || 'ج.م'}</strong></div>
                  </div>

                  <div style={{ marginBottom: '16px' }}>
                    <div style={{ padding: '8px 12px', background: dashboardData.lowStockCount > 0 ? '#fff1f2' : '#f0fdf4', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px' }}>
                      {dashboardData.lowStockCount > 0 ? `⚠️ يوجد عدد ${dashboardData.lowStockCount} صنف بحاجة لإعادة الطلب والتوريد.` : '✅ جميع الأصناف رصيدها كافٍ ولا توجد نواقص.'}
                    </div>
                  </div>
                </div>
              )}

              {/* DAILY SUMMARY REPORT CONTENT */}
              {activeReportForPrint === 'daily_summary' && reportData && reportData.grandTotal && (() => {
                const printShifts = (reportData.shifts || []).filter(sh => selectedDailyShiftIds.includes(sh.shift.id));
                const printTotals = {
                  totalSales: printShifts.reduce((acc, sh) => acc + (Number(sh.totalSales) || 0), 0),
                  cashSales: printShifts.reduce((acc, sh) => acc + (Number(sh.cashSales) || 0), 0),
                  walletSales: printShifts.reduce((acc, sh) => acc + (Number(sh.walletSales) || 0), 0),
                  cardSales: printShifts.reduce((acc, sh) => acc + (Number(sh.cardSales) || 0), 0),
                  totalExpenses: printShifts.reduce((acc, sh) => acc + (Number(sh.totalExpenses) || 0), 0),
                  ordersCount: printShifts.reduce((acc, sh) => acc + (Number(sh.ordersCount || 0)), 0),
                };
                printTotals.netCash = printTotals.cashSales - printTotals.totalExpenses;

                if (printShifts.length === 0) {
                  return (
                    <div style={{ padding: '24px', textAlign: 'center', color: '#b91c1c', fontSize: '13px', border: '1.5px dashed #b91c1c', borderRadius: '8px' }}>
                      ⚠️ لم يتم تحديد أي وردية للطباعة! يرجى إغلاق هذه النافذة وتحديد وردية واحدة على الأقل من تقرير اليوم الشامل.
                    </div>
                  );
                }

                return (
                  <div>
                    <div style={{ marginBottom: '14px', borderBottom: '1.5px dashed #000', paddingBottom: '10px' }}>
                      <div style={{ fontWeight: 'bold', fontSize: '13.5px', marginBottom: '8px' }}>
                        💰 إجمالي الورديات المحددة ({printShifts.length} وردية):
                      </div>
                      <table style={{ width: '100%', fontSize: '12.5px', borderCollapse: 'collapse' }}>
                        <tbody>
                          <tr style={{ borderBottom: '1px dotted #ccc' }}>
                            <td style={{ padding: '4px 0' }}>إجمالي المبيعات:</td>
                            <td style={{ textAlign: 'left', fontWeight: 'bold', fontSize: '14px' }}>{printTotals.totalSales} {settings.currency || 'ج.م'}</td>
                          </tr>
                          <tr style={{ borderBottom: '1px dotted #ccc' }}>
                            <td style={{ padding: '4px 0' }}>المبيعات النقدية (كاش):</td>
                            <td style={{ textAlign: 'left', fontWeight: 'bold' }}>{printTotals.cashSales} {settings.currency || 'ج.م'}</td>
                          </tr>
                          <tr style={{ borderBottom: '1px dotted #ccc' }}>
                            <td style={{ padding: '4px 0' }}>مبيعات المحفظة الإلكترونية:</td>
                            <td style={{ textAlign: 'left', fontWeight: 'bold' }}>{printTotals.walletSales} {settings.currency || 'ج.م'}</td>
                          </tr>
                          <tr style={{ borderBottom: '1px dotted #ccc' }}>
                            <td style={{ padding: '4px 0' }}>مبيعات البطاقة (فيزا):</td>
                            <td style={{ textAlign: 'left', fontWeight: 'bold' }}>{printTotals.cardSales} {settings.currency || 'ج.م'}</td>
                          </tr>
                          <tr style={{ borderBottom: '1px dotted #ccc' }}>
                            <td style={{ padding: '4px 0' }}>إجمالي المصروفات:</td>
                            <td style={{ textAlign: 'left', fontWeight: 'bold', color: '#000' }}>-{printTotals.totalExpenses} {settings.currency || 'ج.م'}</td>
                          </tr>
                          <tr style={{ borderTop: '2px solid #000', fontWeight: 'bold', fontSize: '14.5px' }}>
                            <td style={{ padding: '6px 0' }}>صافي النقدية بالخزينة/الدرج:</td>
                            <td style={{ textAlign: 'left', padding: '6px 0' }}>{printTotals.netCash} {settings.currency || 'ج.م'}</td>
                          </tr>
                          <tr>
                            <td style={{ padding: '4px 0', color: '#555' }}>إجمالي الفواتير المنفذة:</td>
                            <td style={{ textAlign: 'left', color: '#555' }}>{printTotals.ordersCount || 0} طلب</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    <div style={{ marginBottom: '12px' }}>
                      <div style={{ fontWeight: 'bold', fontSize: '13.5px', marginBottom: '8px' }}>
                        ⏱️ تفصيل الورديات المحددة ({printShifts.length} وردية):
                      </div>
                      {printShifts.map((sh, idx) => (
                        <div key={idx} style={{ border: '1.5px solid #000', borderRadius: '6px', padding: '8px 10px', marginBottom: '10px', fontSize: '12px', background: '#fff' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: '900', fontSize: '13px', borderBottom: '1px dashed #000', paddingBottom: '4px', marginBottom: '6px' }}>
                            <span>{getShiftDisplayName(sh.shift)} (#{sh.shift.id})</span>
                            <span>الكاشير: {sh.shift.user_name || 'كاشير'}</span>
                          </div>
                          <div style={{ color: '#444', marginBottom: '4px' }}>
                            الفترة: {formatShiftTime(sh.shift.opened_at)} إلى {sh.shift.closed_at ? formatShiftTime(sh.shift.closed_at) : 'مفتوحة حالياً'}
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                            <span>إجمالي المبيعات:</span>
                            <strong>{sh.totalSales} {settings.currency || 'ج.م'}</strong>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                            <span>كاش: {sh.cashSales} | محفظة: {sh.walletSales} | فيزا: {sh.cardSales}</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                            <span>المصروفات:</span>
                            <strong style={{ color: '#000' }}>-{sh.totalExpenses} {settings.currency || 'ج.م'}</strong>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', borderTop: '1px dotted #ccc', marginTop: '3px', paddingTop: '3px' }}>
                            <span>صافي كاش الوردية:</span>
                            <strong>{sh.netCash} {settings.currency || 'ج.م'}</strong>
                          </div>
                          {sh.shift.cash_difference !== 0 && (
                            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', color: '#000' }}>
                              <span>فارق الدرج (عجز/زيادة):</span>
                              <strong>{sh.shift.cash_difference} {settings.currency || 'ج.م'}</strong>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* ── CANCELLATIONS & VOIDS REPORT PRINT ── */}
              {activeReportForPrint === 'cancellations' && reportData && reportData.type === 'cancellations' && (
                <div>
                  {/* Summary Box */}
                  <div style={{
                    border: '1.5px solid #000',
                    borderRadius: '6px',
                    padding: printReportFormat === 'thermal' ? '6px 8px' : '10px 14px',
                    marginBottom: '12px',
                    fontSize: printReportFormat === 'thermal' ? '12px' : '13px'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                      <span>إجمالي عمليات الإلغاء:</span>
                      <strong>{reportData.summary?.totalEvents || 0} عملية</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                      <span>فواتير ملغية بالكامل:</span>
                      <strong>{reportData.summary?.totalCancelledOrders || 0} ({(reportData.summary?.totalCancelledOrdersAmount || 0).toFixed(2)} {settings.currency || 'ج.م'})</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                      <span>أصناف ملغية من الطاولات:</span>
                      <strong>{reportData.summary?.totalVoidedItemEvents || 0} ({(reportData.summary?.totalVoidedItemsAmount || 0).toFixed(2)} {settings.currency || 'ج.م'})</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0 0', marginTop: '4px', borderTop: '1.5px dashed #000', fontSize: printReportFormat === 'thermal' ? '13.5px' : '15px' }}>
                      <strong>إجمالي قيمة الإلغاءات:</strong>
                      <strong>{(reportData.summary?.grandCancelledAmount || 0).toFixed(2)} {settings.currency || 'ج.م'}</strong>
                    </div>
                  </div>

                  {/* Detailed Items */}
                  {(!reportData.entries || reportData.entries.length === 0) ? (
                    <div style={{ textAlign: 'center', padding: '14px', fontWeight: 'bold', border: '1px dashed #666' }}>
                      لا توجد أي إلغاءات مسجلة في هذه الفترة
                    </div>
                  ) : printReportFormat === 'thermal' ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {reportData.entries.map((row) => (
                        <div key={row.id} style={{ borderBottom: '1.5px dashed #000', paddingBottom: '6px', fontSize: '12px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: '900', fontSize: '13px' }}>
                            <span>[{row.typeLabel}] {row.productName}</span>
                            <span>× {row.qty}</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2px' }}>
                            <span>{row.tableName}{row.invoiceNo && row.invoiceNo !== '—' ? ` (#${row.invoiceNo})` : ''}</span>
                            <strong>{(Number(row.totalAmount) || 0).toFixed(2)} {settings.currency || 'ج.م'}</strong>
                          </div>
                          <div style={{ marginTop: '2px' }}>
                            <strong>السبب:</strong> {row.reason}
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2px', fontSize: '11px' }}>
                            <span>بواسطة: {row.actorName}</span>
                            <span>{formatCairoDateTime(row.cancelledAt)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'right' }}>
                      <thead>
                        <tr style={{ background: '#e8e8e8' }}>
                          <th style={{ border: '1px solid #000', padding: '6px' }}>النوع</th>
                          <th style={{ border: '1px solid #000', padding: '6px' }}>المنتج / الصنف</th>
                          <th style={{ border: '1px solid #000', padding: '6px', textAlign: 'center' }}>الكمية</th>
                          <th style={{ border: '1px solid #000', padding: '6px' }}>القيمة</th>
                          <th style={{ border: '1px solid #000', padding: '6px' }}>الطاولة / الفاتورة</th>
                          <th style={{ border: '1px solid #000', padding: '6px' }}>سبب الإلغاء</th>
                          <th style={{ border: '1px solid #000', padding: '6px' }}>مين لغاه</th>
                          <th style={{ border: '1px solid #000', padding: '6px' }}>التاريخ والساعة</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reportData.entries.map((row) => (
                          <tr key={row.id}>
                            <td style={{ border: '1px solid #000', padding: '5px' }}>{row.typeLabel}</td>
                            <td style={{ border: '1px solid #000', padding: '5px', fontWeight: 'bold' }}>{row.productName}</td>
                            <td style={{ border: '1px solid #000', padding: '5px', textAlign: 'center', fontWeight: 'bold' }}>× {row.qty}</td>
                            <td style={{ border: '1px solid #000', padding: '5px', fontWeight: 'bold' }}>{(Number(row.totalAmount) || 0).toFixed(2)} {settings.currency || 'ج.م'}</td>
                            <td style={{ border: '1px solid #000', padding: '5px' }}>
                              {row.tableName}{row.invoiceNo && row.invoiceNo !== '—' ? ` (#${row.invoiceNo})` : ''}
                            </td>
                            <td style={{ border: '1px solid #000', padding: '5px' }}>{row.reason}</td>
                            <td style={{ border: '1px solid #000', padding: '5px', fontWeight: 'bold' }}>{row.actorName}</td>
                            <td style={{ border: '1px solid #000', padding: '5px', whiteSpace: 'nowrap' }}>{formatCairoDateTime(row.cancelledAt)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {/* Signatures & Footer */}
              <div style={{ marginTop: '20px', paddingTop: '14px', borderTop: '2px solid #333' }}>
                <div style={{ display: 'flex', justifyContent: 'space-around', textAlign: 'center', fontSize: '12px' }}>
                  <div>
                    <div>توقيع الكاشير / المسؤول</div>
                    <div style={{ marginTop: '26px', borderBottom: '1px dashed #666', width: '140px' }}></div>
                  </div>
                  <div>
                    <div>اعتماد مدير الفرع</div>
                    <div style={{ marginTop: '26px', borderBottom: '1px dashed #666', width: '140px' }}></div>
                  </div>
                </div>

              </div>
            </div>

            <div className="modal-actions" style={{ marginTop: '16px' }}>
              <button className="btn btn-primary" onClick={printReport}>🖨️ طباعة الآن</button>
              <button className="btn btn-secondary" onClick={() => setActiveReportForPrint(null)}>إغلاق</button>
            </div>
          </div>
        </div>
  );
}
