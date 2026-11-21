import React from 'react';

export default function TabNavigation({
  activeTab,
  currentUser,
  debtsList,
  loadDebts,
  setActiveTab,
  setNotebookModal,
  vendorDevFeatures
}) {
  return (
    <nav className="tab-navigation">
        <button className={`tab-btn ${activeTab === 'pos' ? 'active' : ''}`} onClick={() => setActiveTab('pos')}>
          🛒 الكاشير ونقطة البيع
        </button>
        <button className={`tab-btn ${activeTab === 'tables' ? 'active' : ''}`} onClick={() => setActiveTab('tables')}>
          🪑 الصالة والطاولات
        </button>
        {(vendorDevFeatures.enable_notebook_for_admin !== false && (currentUser?.role === 'admin' || vendorDevFeatures.show_notebook_to_cashier)) && (
          <button
            type="button"
            className="tab-btn"
            style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.3)', fontWeight: '700' }}
            onClick={() => {
              loadDebts();
              setNotebookModal(true);
            }}
            title="فتح دفتر النوتة ومتابعة ديون الزبائن والآجل"
          >
            📝 دفتر النوتة والآجل
            {(Array.isArray(debtsList) ? debtsList : []).filter((d) => d.status !== 'paid').length > 0 && (
              <span className="badge-debt-count" style={{ marginRight: '6px' }}>
                {(Array.isArray(debtsList) ? debtsList : []).filter((d) => d.status !== 'paid').length}
              </span>
            )}
          </button>
        )}
        {(currentUser?.role === 'admin' || vendorDevFeatures.show_orders_to_cashier) && (
          <button className={`tab-btn ${activeTab === 'orders' ? 'active' : ''}`} onClick={() => setActiveTab('orders')}>
            📜 سجل الفواتير
          </button>
        )}
        {currentUser?.role === 'admin' && (
          <>
            <button className={`tab-btn ${activeTab === 'menu' ? 'active' : ''}`} onClick={() => setActiveTab('menu')}>
              📦 المنيو والمخزون
            </button>
            <button className={`tab-btn ${activeTab === 'reports' ? 'active' : ''}`} onClick={() => setActiveTab('reports')}>
              📊 التقارير والإحصائيات
            </button>
            <button className={`tab-btn ${activeTab === 'users' ? 'active' : ''}`} onClick={() => setActiveTab('users')}>
              👥 الموظفين والشيفتات
            </button>
            <button className={`tab-btn ${activeTab === 'settings' ? 'active' : ''}`} onClick={() => setActiveTab('settings')}>
              ⚙️ إعدادات الكافيه
            </button>
          </>
        )}
      </nav>
  );
}
