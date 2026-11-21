import React from 'react';
import api from '../../api';
import { isSameHall } from '../../utils/hall.js';
import { getTableBonStatus, getTableSyncStatus, getTableThermalState } from '../../utils/tableStatus.js';

export default function TablesTab({
  activeHallFilter,
  handlePrintPreBillCheck,
  handleSelectTable,
  inFlightTablesRef,
  qrInfo,
  sections,
  setActiveHallFilter,
  setTables,
  setTransferModal,
  setTransferTargetId,
  settings,
  showAllTablesTab,
  showToast,
  tableCartsMap,
  tableSessionTimesRef,
  tables,
  vendorDevFeatures
}) {
  return (
    <div className="tables-view">
            <div className="view-header flex-between">
              <div>
                <h2>🪑 صالات الجلوس وإدارة الطاولات</h2>
                <p>متابعة الطاولات الشاغرة والمشغولة وإدارة طلبات الصالات بكل سهولة</p>
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                {showAllTablesTab && (
                  <button
                    className={`tab-filter-btn ${activeHallFilter === 'all' ? 'active' : ''}`}
                    onClick={() => setActiveHallFilter('all')}
                  >
                    الكل ({tables.length})
                  </button>
                )}
                {sections.map((sec) => (
                  <button
                    key={sec.id}
                    className={`tab-filter-btn ${isSameHall(activeHallFilter, sec.name) ? 'active' : ''}`}
                    onClick={() => setActiveHallFilter(sec.name)}
                  >
                    {sec.name} ({tables.filter((t) => isSameHall(t.hall, sec.name)).length})
                  </button>
                ))}
                {tables.filter((t) => !sections.some((s) => isSameHall(s.name, t.hall))).length > 0 && (
                  <button
                    className={`tab-filter-btn ${activeHallFilter === '__unassigned__' ? 'active' : ''}`}
                    onClick={() => setActiveHallFilter('__unassigned__')}
                  >
                    طاولات أخرى ({tables.filter((t) => !sections.some((s) => isSameHall(s.name, t.hall))).length})
                  </button>
                )}

                {/* 1. نظام كابتن الصالة والويتر */}
                {(vendorDevFeatures.enable_waiter_system || (vendorDevFeatures.enable_waiter_system === undefined && vendorDevFeatures.enable_waiter_qr)) && (
                  <>
                    <a
                      href={qrInfo?.waiterUrl || (qrInfo?.localIp ? `http://${qrInfo.localIp}:${qrInfo.port || 3000}/waiter` : 'http://localhost:3000/waiter')}
                      target="_blank"
                      rel="noreferrer"
                      className="btn btn-outline-light"
                      style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', padding: '6px 12px', borderColor: '#f59e0b', color: '#f59e0b' }}
                      title="فتح واجهة كابتن الصالة والويتر للطلب المباشر من الموبايل"
                    >
                      📱 شاشة الويتر
                    </a>
                    <a
                      href={qrInfo?.waiterQrUrl || (qrInfo?.localIp ? `http://${qrInfo.localIp}:${qrInfo.port || 3000}/qr-waiter` : 'http://localhost:3000/qr-waiter')}
                      target="_blank"
                      rel="noreferrer"
                      className="btn btn-outline-light"
                      style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', padding: '6px 12px', borderColor: '#d97706', color: '#fbbf24' }}
                      title="طباعة كروت QR لكباتن الصالة والويترز فقط"
                    >
                      🖨️ كروت QR الويتر
                    </a>
                  </>
                )}

                {/* 2. نظام باركود وكروت الطاولات للزبائن */}
                {(vendorDevFeatures.enable_customer_qr || (vendorDevFeatures.enable_customer_qr === undefined && vendorDevFeatures.enable_waiter_qr)) && (
                  <>
                    <a
                      href={qrInfo?.tablesUrl || 'http://localhost:3000/qr-tables'}
                      target="_blank"
                      rel="noreferrer"
                      className="btn btn-outline-light"
                      style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', padding: '6px 12px', borderColor: '#34d399', color: '#34d399' }}
                      title="طباعة بطاقات QR / باركود طاولات الزبائن فقط"
                    >
                      📱 باركود طاولات الزبائن (QR)
                    </a>
                    <button
                      type="button"
                      className="btn btn-outline-light"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', padding: '6px 12px', borderColor: '#38bdf8', color: '#38bdf8' }}
                      title="تجديد كافة أكواد QR لجميع الطاولات وفصل كل الجلسات السابقة دفعة واحدة"
                      onClick={async () => {
                        if (!window.confirm('هل تريد تجديد كافة رموز QR لجميع الطاولات؟\nسيتم إنهاء كل الجلسات السابقة على كافة هواتف الزبائن فوراً.')) return;
                        try {
                          await api.resetAllTableQrTokens();
                          const fresh = await api.listTables();
                          if (fresh) setTables(fresh);
                          showToast('✅ تم تجديد أكواد QR لجميع الطاولات وفصل الجلسات القديمة');
                        } catch (e) {
                          showToast('❌ تعذر تجديد الأكواد');
                        }
                      }}
                    >
                      🔄 تجديد كل الباركودات
                    </button>
                  </>
                )}
              </div>
            </div>

            <div className="tables-grid">
              {tables
                .filter((t) => {
                  if (showAllTablesTab && activeHallFilter === 'all') return true;
                  if (activeHallFilter === '__unassigned__') {
                    return !sections.some((s) => isSameHall(s.name, t.hall));
                  }
                  return isSameHall(t.hall, activeHallFilter);
                })
                .map((tbl) => {
                  const tblCart = tableCartsMap[tbl.id]?.cart || [];
                  const tblCustName = (tableCartsMap[tbl.id]?.customerName || '').trim();
                  const hasPending = tblCart.length > 0 || Boolean(tblCustName);
                  const isCheckPrinted = Boolean(tableCartsMap[tbl.id]?.printedCheck && tblCart.length > 0);
                  const isOccupied = tbl.status === 'occupied' || hasPending;
                  const thermal = getTableThermalState(tbl, tableCartsMap, tableSessionTimesRef.current);
                  const bonStatus = getTableBonStatus(tblCart);
                  const syncStatus = getTableSyncStatus(tbl.id, inFlightTablesRef.current);

                  return (
                    <div
                      key={tbl.id}
                      className={`table-card ${thermal.className} ${hasPending ? 'table-has-cart' : ''} ${isCheckPrinted ? 'table-check-printed' : ''}`}
                      onClick={() => handleSelectTable(tbl)}
                    >
                      <div className="table-card-header">
                        <span className="table-num">{tbl.number}</span>
                        {tbl.qr_enabled === 0 && (
                          <span style={{ fontSize: '11px', color: '#f87171', background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold' }}>
                            🚫 معطلة للويتر والباركود
                          </span>
                        )}
                        <span className={`table-status-pill ${thermal.stage === 'check_printed' ? 'ticket-stamp' : `heat-badge-${thermal.stage}`}`}>
                          {thermal.icon} {thermal.timeText} • {thermal.label}
                        </span>
                      </div>
                      <h4 className="table-title">
                        {(() => {
                          const isSingle = tbl.hall && tables.filter(t => isSameHall(t.hall, tbl.hall)).length === 1;
                          if (isSingle) return tbl.hall;
                          return tbl.name;
                        })()}
                      </h4>
                      <div className="table-details">
                        <span>👥 سعة: {tbl.capacity} أفراد</span>
                        <span>{(() => {
                          const isSingle = tbl.hall && tables.filter(t => isSameHall(t.hall, tbl.hall)).length === 1;
                          if (isSingle) return '📍 مكان مستقل';
                          return `📍 ${tbl.hall || 'عام'}`;
                        })()}</span>
                      </div>
                      {Boolean(tblCustName) && (
                        <div
                          className="table-customer-badge"
                          style={{
                            margin: '5px 0 2px 0',
                            padding: '4px 8px',
                            background: 'rgba(59, 130, 246, 0.15)',
                            border: '1px solid rgba(59, 130, 246, 0.4)',
                            borderRadius: '6px',
                            color: '#93c5fd',
                            fontSize: '13px',
                            fontWeight: 'bold',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                          }}
                        >
                          <span style={{ fontSize: '14px' }}>👤</span>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            العميل: {tblCustName}
                          </span>
                        </div>
                      )}
                      {bonStatus && (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px', margin: '4px 0' }}>
                          <span className={`bon-badge ${bonStatus.className}`}>
                            {bonStatus.icon} {bonStatus.label}
                          </span>
                          <span className={`sync-badge ${syncStatus.className}`} title={syncStatus.label}>
                            {syncStatus.icon} {syncStatus.label}
                          </span>
                        </div>
                      )}
                      <div className="thermal-meter-bar">
                        <div className={`thermal-meter-fill fill-${thermal.stage}`}></div>
                      </div>
                      {isCheckPrinted ? (
                        <div className="pending-badge printed-check-badge check-printed-blinking" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '7px 10px', borderRadius: '8px', fontSize: '12.5px', fontWeight: '800' }}>
                          <span className="check-blink-dot" aria-hidden="true"></span>
                          <span>🧾 شيك مطبوع ({tblCart.reduce((sum, it) => sum + it.qty, 0)} صنف) — بانتظار التحصيل</span>
                        </div>
                      ) : (tblCart.length > 0) ? (
                        <div className="pending-badge">
                          🛒 طلب معلق ({tblCart.reduce((sum, it) => sum + it.qty, 0)} صنف)
                        </div>
                      ) : null}
                      <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
                        <button className="btn btn-sm btn-outline-light" style={{ flex: 1, borderColor: isCheckPrinted ? '#f59e0b' : undefined, color: isCheckPrinted ? '#f59e0b' : undefined, fontWeight: isCheckPrinted ? 'bold' : 'normal' }}>
                          {isCheckPrinted ? '💵 إتمام الطلب والتحصيل' : hasPending ? (vendorDevFeatures.require_check_print_before_checkout ? '✏️ تعديل الطلب' : '💵 إتمام الطلب / تعديل') : isOccupied ? 'عرض الحساب' : 'فتح طلب جديد +'}
                        </button>
                        {settings.enable_guest_check !== 'false' && hasPending && (
                          <button
                            type="button"
                            className="btn btn-sm btn-warning"
                            title={isCheckPrinted ? 'الشيك مطبوع مسبقاً - يتطلب موافقة الأدمن لإعادة الطباعة' : 'طباعة شيك الحساب للعميل لهذه الطاولة'}
                            style={{ fontWeight: 'bold', padding: '4px 10px', background: isCheckPrinted ? '#d97706' : '#eab308', color: '#000' }}
                            onClick={(e) => {
                              e.stopPropagation();
                              handlePrintPreBillCheck(tbl, tableCartsMap[tbl.id].cart);
                            }}
                          >
                            {isCheckPrinted ? '🔔 شيك' : '🧾 شيك'}
                          </button>
                        )}
                        {hasPending && (
                          <button
                            type="button"
                            className="btn btn-sm btn-warning"
                            title="نقل طلب هذه الطاولة لطاولة أخرى"
                            style={{ fontWeight: 'bold', padding: '4px 10px' }}
                            onClick={(e) => {
                              e.stopPropagation();
                              setTransferModal({ sourceTable: tbl });
                              setTransferTargetId('');
                            }}
                          >
                            🔀 نقل
                          </button>
                        )}
                        {(vendorDevFeatures.enable_customer_qr || (vendorDevFeatures.enable_customer_qr === undefined && vendorDevFeatures.enable_waiter_qr)) && (
                          <div style={{ display: 'inline-flex', gap: '3px' }}>
                            <button
                              type="button"
                              className={`btn btn-sm ${tbl.qr_enabled !== 0 ? 'btn-outline-success' : 'btn-outline-danger'}`}
                              title={tbl.qr_enabled !== 0 ? 'طلبات الويتر والباركود مفعلة لهذه الطاولة - اضغط للتعطيل' : 'طلبات الويتر والباركود معطلة لهذه الطاولة - اضغط للتفعيل'}
                              style={{ padding: '4px 7px', fontSize: '13px' }}
                              onClick={async (e) => {
                                e.stopPropagation();
                                const nextVal = tbl.qr_enabled === 0 ? 1 : 0;
                                try {
                                  const updated = await api.toggleTableQr(tbl.id, nextVal === 1);
                                  setTables((prev) => prev.map((t) => t.id === tbl.id ? { ...t, qr_enabled: nextVal } : t));
                                  showToast(nextVal === 1 ? `✅ تم تفعيل طلبات الويتر والموبايل لطاولة ${tbl.name || tbl.number}` : `🚫 تم تعطيل طلبات الويتر والموبايل لطاولة ${tbl.name || tbl.number}`);
                                } catch (err) {
                                  showToast('❌ تعذر تغيير حالة طلبات الطاولة');
                                }
                              }}
                            >
                              {tbl.qr_enabled !== 0 ? '📱' : '🚫'}
                            </button>
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-warning"
                              title="تجديد باركود الطاولة (فصل أي زبون كان ماسح الكود القديم فوراً)"
                              style={{ padding: '4px 7px', fontSize: '13px' }}
                              onClick={async (e) => {
                                e.stopPropagation();
                                if (!window.confirm(`هل أنت متأكد من تجديد باركود الطاولة "${tbl.name || tbl.number}"؟\nسيتم إنهاء اتصال أي زبون مسجل بالباركود القديم فوراً.`)) return;
                                try {
                                  const res = await api.regenerateTableQrToken(tbl.id);
                                  const newToken = res?.qr_token;
                                  setTables((prev) => prev.map((t) => t.id === tbl.id ? { ...t, qr_token: newToken } : t));
                                  showToast(`🔄 تم تجديد باركود الطاولة بنجاح`);
                                } catch (err) {
                                  showToast('❌ تعذر تجديد باركود الطاولة');
                                }
                              }}
                            >
                              🔄
                            </button>
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-light"
                              title="عرض صفحة كود QR والمنيو لهذه الطاولة"
                              style={{ padding: '4px 7px', fontSize: '13px' }}
                              onClick={(e) => {
                                e.stopPropagation();
                                const param = tbl.number || tbl.name || tbl.id;
                                const tokenParam = tbl.qr_token || '';
                                const url = (qrInfo?.url ? `${qrInfo.url}?table=${encodeURIComponent(param)}&tableId=${tbl.id}&token=${encodeURIComponent(tokenParam)}` : `http://localhost:3000/menu?table=${encodeURIComponent(param)}&tableId=${tbl.id}&token=${encodeURIComponent(tokenParam)}`);
                                window.open(url, '_blank');
                              }}
                            >
                              🔗
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
  );
}
