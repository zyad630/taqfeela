import React, { useEffect, useMemo, useState, useRef } from 'react';
import LoginScreen from './components/screens/LoginScreen.jsx';
import ShiftOpenScreen from './components/screens/ShiftOpenScreen.jsx';
import AppHeader from './components/layout/AppHeader.jsx';
import TabNavigation from './components/layout/TabNavigation.jsx';
import PosTab from './components/tabs/PosTab.jsx';
import TablesTab from './components/tabs/TablesTab.jsx';
import OrdersTab from './components/tabs/OrdersTab.jsx';
import MenuTab from './components/tabs/MenuTab.jsx';
import ReportsTab from './components/tabs/ReportsTab.jsx';
import SettingsTab from './components/tabs/SettingsTab.jsx';
import UsersTab from './components/tabs/UsersTab.jsx';
import TransferTableModal from './components/modals/TransferTableModal.jsx';
import TransferItemModal from './components/modals/TransferItemModal.jsx';
import ClockErrorModal from './components/modals/ClockErrorModal.jsx';
import ReceiptModal from './components/print/ReceiptModal.jsx';
import BarTicketModal from './components/print/BarTicketModal.jsx';
import ShishaTicketModal from './components/print/ShishaTicketModal.jsx';
import ExpensesPrintModal from './components/print/ExpensesPrintModal.jsx';
import PrintableReportModal from './components/print/PrintableReportModal.jsx';
import AddExpenseModal from './components/modals/AddExpenseModal.jsx';
import ExpensesLogModal from './components/modals/ExpensesLogModal.jsx';
import EditExpenseModal from './components/modals/EditExpenseModal.jsx';
import CloseShiftModal from './components/modals/CloseShiftModal.jsx';
import ProductModal from './components/modals/ProductModal.jsx';
import SectionModal from './components/modals/SectionModal.jsx';
import TablesConfigModal from './components/modals/TablesConfigModal.jsx';
import UserModal from './components/modals/UserModal.jsx';
import NotebookModal from './components/modals/NotebookModal.jsx';
import PayDebtModal from './components/modals/PayDebtModal.jsx';
import PayCustomerDebtModal from './components/modals/PayCustomerDebtModal.jsx';
import DeleteDebtModal from './components/modals/DeleteDebtModal.jsx';
import CustomerDetailsModal from './components/modals/CustomerDetailsModal.jsx';
import AdjustmentModal from './components/modals/AdjustmentModal.jsx';
import PayrollDetailsModal from './components/modals/PayrollDetailsModal.jsx';
import ForcePasswordModal from './components/modals/ForcePasswordModal.jsx';
import ExpiredLicenseScreen from './components/screens/ExpiredLicenseScreen.jsx';
import LicenseActivationScreen from './components/screens/LicenseActivationScreen.jsx';
import CancelOrderModal from './components/modals/CancelOrderModal.jsx';
import RestoreOrderModal from './components/modals/RestoreOrderModal.jsx';
import DeleteExpenseModal from './components/modals/DeleteExpenseModal.jsx';
import AdminAuthModal from './components/modals/AdminAuthModal.jsx';
import AdminOverlayModal from './components/modals/AdminOverlayModal.jsx';
import BarVoidTicketModal from './components/print/BarVoidTicketModal.jsx';
import CategoryManagerModal from './components/modals/CategoryManagerModal.jsx';
import CategoryModal from './components/modals/CategoryModal.jsx';
import SystemResetModal from './components/modals/SystemResetModal.jsx';
import NoteModal from './components/modals/NoteModal.jsx';
import PreBillCheckPrint from './components/print/PreBillCheckPrint.jsx';
import PrinterWizardModal from './components/modals/PrinterWizardModal.jsx';
import api from './api';
import { DEFAULT_SHIFT_SCHEDULES, MIN_PASSWORD_LENGTH } from './constants.js';
import { cartChanged, escapeHtml, isSnapshotStale } from './tableSyncUtils.js';
import { formatCairoDateTime, formatShiftTime, getLocalDateString, getShiftDisplayName, toCairoDate } from './utils/dateTime.js';
import { formatTableDisplay, isSameHall } from './utils/hall.js';
import { useSingleFlight } from './hooks/useSingleFlight.js';
import { toCents, fromCents, subMoney, addMoney, roundMoney, fmtMoney, lineTotal } from './utils/money.js';

// إعادة تصدير دوال الصالات (كانت مُصدَّرة من App.jsx في الملف الأصلي)
export { normalizeHallName, isSameHall, formatTableDisplay } from './utils/hall.js';



export default function App() {
  // Flight locks to prevent double-clicks / concurrent duplicate actions
  const [flightSendToBar, pendingSendToBar] = useSingleFlight();
  const [flightCheckout, pendingCheckout] = useSingleFlight();
  const [flightCloseShift, pendingCloseShift] = useSingleFlight();
  const [flightOpenShift, pendingOpenShift] = useSingleFlight();
  const [flightLogin, pendingLogin] = useSingleFlight();
  const [flightExpense, pendingExpense] = useSingleFlight();
  const [flightPayDebt, pendingPayDebt] = useSingleFlight();
  const [flightCancelOrder, pendingCancelOrder] = useSingleFlight();
  const [flightRestoreOrder, pendingRestoreOrder] = useSingleFlight();
  const [flightTransferTable, pendingTransferTable] = useSingleFlight();
  // Navigation & View
  const [activeTab, setActiveTab] = useState('pos'); // 'pos' | 'tables' | 'orders' | 'menu' | 'reports' | 'settings'

  // Shift & Status
  const [appLoading, setAppLoading] = useState(true);
  const [shift, setShift] = useState(null);
  const [shiftSchedules, setShiftSchedules] = useState(DEFAULT_SHIFT_SCHEDULES);
  const [openingCashInput, setOpeningCashInput] = useState('');
  const [openingNotesInput, setOpeningNotesInput] = useState('');
  const [closeShiftModal, setCloseShiftModal] = useState(false);
  const [actualCashInput, setActualCashInput] = useState('');
  const [closeNotesInput, setCloseNotesInput] = useState('');
  const [closeSummary, setCloseSummary] = useState(null);
  const [shiftBlockerModal, setShiftBlockerModal] = useState(null);
  const [shiftOverridePassword, setShiftOverridePassword] = useState('');

  // Restore Order
  function handleRestoreOrder(id) {
    const order = ordersList.find((o) => o.id === id);
    if (!order) return;
    setOrderToRestore(order);
    setRestoreAdminPassword('');
    setRestoreModal(true);
  }

  async function handleConfirmRestoreOrder() {
    return flightRestoreOrder(async () => {
      if (!orderToRestore) return;
      try {
        if (!restoreAdminPassword || !restoreAdminPassword.trim()) {
          showToast('⚠️ يرجى إدخال كلمة مرور المدير لاستعادة هذه الفاتورة');
          return;
        }
        const res = await api.restoreOrder(orderToRestore.id, restoreAdminPassword);
        if (res && res.error) {
          showToast(`❌ ${res.error}`);
          return;
        }
        setRestoreModal(false);
        setOrderToRestore(null);
        setRestoreAdminPassword('');
        showToast('✅ تم استعادة الفاتورة وإلغاء حالة الإلغاء بنجاح.');
        loadOrders();
        refreshData();
      } catch (err) {
        console.error(err);
        showToast(`❌ ${err.message || 'حدث خطأ أثناء استعادة الطلب'}`);
      }
    });
  }

  // Cancel Order Modal State
  // Restore Order Modal State
  const [restoreModal, setRestoreModal] = useState(false);
  const [orderToRestore, setOrderToRestore] = useState(null);
  const [restoreAdminPassword, setRestoreAdminPassword] = useState('');
  const [cancelModal, setCancelModal] = useState(false);
  const [orderToCancel, setOrderToCancel] = useState(null);
  const [cancelReasonInput, setCancelReasonInput] = useState('إلغاء بناءً على رغبة العميل');
  const [cancelAdminPassword, setCancelAdminPassword] = useState('');
  const [deleteExpenseData, setDeleteExpenseData] = useState(null);
  const [deleteExpensePassword, setDeleteExpensePassword] = useState('');

  // Data
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [tables, setTables] = useState([]);
  const [ordersList, setOrdersList] = useState([]);
  const [settings, setSettings] = useState({});
  const [availablePrinters, setAvailablePrinters] = useState([]);
  const [showPrinterWizard, setShowPrinterWizard] = useState(false);
  const [wizardPrinters, setWizardPrinters] = useState({
    printer_name: '',
    bar_printer_name: '',
    shisha_printer_name: '',
    silent_print: '1'
  });
  const [qrInfo, setQrInfo] = useState(null);
  const [dashboardData, setDashboardData] = useState(null);

  // Sections & Tables Management
  const [sections, setSections] = useState([]);
  const [activeHall, setActiveHall] = useState('all'); // 'all' | section name
  const [activeHallFilter, setActiveHallFilter] = useState('all');
  const [showAllTablesTab, setShowAllTablesTab] = useState(() => {
    try {
      const saved = localStorage.getItem('cafepos_show_all_tables_tab');
      if (saved !== null) return saved === 'true';
    } catch (_) { }
    return true;
  });
  const [tablesConfigModal, setTablesConfigModal] = useState(false);
  const [tableCountsForm, setTableCountsForm] = useState({ indoorCount: 8, outdoorCount: 6 });
  const [sectionModal, setSectionModal] = useState(false);
  const [sectionForm, setSectionForm] = useState({ id: null, name: '', sort_order: '' });
  const [sectionTableCounts, setSectionTableCounts] = useState({}); // { sectionId: count }
  const [sectionRanges, setSectionRanges] = useState({}); // { sectionId: { start: 1, end: 18 } }

  // Reports State
  const [reportsTab, setReportsTab] = useState('sales'); // 'sales' | 'inventory' | 'shifts'
  const [reportDatePreset, setReportDatePreset] = useState('today');
  const [reportDateFrom, setReportDateFrom] = useState(getLocalDateString());
  const [reportDateTo, setReportDateTo] = useState(getLocalDateString());
  const [reportShiftId, setReportShiftId] = useState('');
  const [reportUserId, setReportUserId] = useState('all');
  const [allShiftsList, setAllShiftsList] = useState([]);
  const [reportShiftTypeFilter, setReportShiftTypeFilter] = useState('all'); // 'all' | 'morning' | 'evening' | 'night'
  const [reportShiftUserFilter, setReportShiftUserFilter] = useState('all'); // 'all' | username/name
  const [reportShiftDateFilter, setReportShiftDateFilter] = useState(getLocalDateString());
  const [reportShiftDateMode, setReportShiftDateMode] = useState('today'); // 'today' | 'yesterday' | 'custom' | 'all'
  const [shiftReportSection, setShiftReportSection] = useState('all'); // 'all' | 'cash' | 'orders' | 'items' | 'expenses' | 'stock'

  // Expenses Management State
  const [expensesModal, setExpensesModal] = useState(false);
  const [expenseList, setExpenseList] = useState([]);
  const [editingExpense, setEditingExpense] = useState(null);
  const [editExpenseForm, setEditExpenseForm] = useState({ id: null, amount: '', category: 'مشتريات خامات (بن/حليب/سكر/مستلزمات)', notes: '' });
  const [expenseFilterMode, setExpenseFilterMode] = useState('shift'); // 'shift' | 'range' | 'all'
  const [expenseFromDate, setExpenseFromDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [expenseToDate, setExpenseToDate] = useState(() => new Date().toISOString().slice(0, 10));

  const filteredShiftsList = useMemo(() => {
    const list = allShiftsList.filter((s) => {
      // 1. Employee / Cashier filter
      if (reportShiftUserFilter !== 'all') {
        const target = String(reportShiftUserFilter).trim().toLowerCase();
        const userName = String(s.user_name || '').trim().toLowerCase();
        const userId = String(s.user_id || '').trim();
        if (userName !== target && userId !== target) return false;
      }
      // 2. Shift Period filter (checks both preset name and actual opening hour in Cairo)
      if (reportShiftTypeFilter !== 'all') {
        const cairo = toCairoDate(s.opened_at);
        const hour = cairo ? cairo.getUTCHours() : 0;
        const type = (s.shift_type || '').toLowerCase();
        if (reportShiftTypeFilter === 'morning' && !(type.includes('صباح') || (hour >= 5 && hour < 14))) return false;
        if (reportShiftTypeFilter === 'evening' && !(type.includes('مساء') || (hour >= 14 && hour < 22))) return false;
        if (reportShiftTypeFilter === 'night' && !(type.includes('ليل') || (hour >= 22 || hour < 5))) return false;
      }
      // 3. Date filter
      if (reportShiftDateMode === 'all') return true;
      const sDate = s.opened_at ? getLocalDateString(s.opened_at) : '';
      if (reportShiftDateMode === 'today') {
        const today = getLocalDateString();
        return sDate === today;
      }
      if (reportShiftDateMode === 'yesterday') {
        const yesterday = getLocalDateString(new Date(Date.now() - 86400000));
        return sDate === yesterday;
      }
      if (reportShiftDateMode === 'custom') {
        if (reportShiftDateFilter) {
          return sDate === reportShiftDateFilter;
        }
      }
      return true;
    });

    // 4. Strict Ordering: Active open shift at the top, then newest to oldest by opened_at / id
    return list.sort((a, b) => {
      const aOpen = !a.closed_at;
      const bOpen = !b.closed_at;
      if (aOpen && !bOpen) return -1;
      if (!aOpen && bOpen) return 1;
      const aTime = a.opened_at ? new Date(a.opened_at).getTime() : a.id;
      const bTime = b.opened_at ? new Date(b.opened_at).getTime() : b.id;
      return bTime - aTime;
    });
  }, [allShiftsList, reportShiftTypeFilter, reportShiftUserFilter, reportShiftDateMode, reportShiftDateFilter]);

  const [reportData, setReportData] = useState(null);
  const [selectedDailyShiftIds, setSelectedDailyShiftIds] = useState([]);
  const [reportLoading, setReportLoading] = useState(false);
  const [activeReportForPrint, setActiveReportForPrint] = useState(null); // 'sales'|'inventory'|'shifts'|'quick'
  const [printReportFormat, setPrintReportFormat] = useState('thermal'); // 'thermal' | 'a4'
  const [inventorySearch, setInventorySearch] = useState('');
  const [inventoryFilterMode, setInventoryFilterMode] = useState('all'); // 'all' | 'low' | 'today' | 'week'
  const [invProductFilter, setInvProductFilter] = useState('all'); // 'all' | product id
  // Custom note modal (replaces blocked prompt())
  const [noteModal, setNoteModal] = useState(null); // { item } or null
  const [noteModalText, setNoteModalText] = useState('');

  const [activeCategory, setActiveCategory] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [cart, setCart] = useState([]);
  const [orderType, setOrderType] = useState('takeaway'); // 'takeaway' | 'dine_in' | 'notebook'
  const [selectedTable, setSelectedTable] = useState(null);
  // Per-table cart persistence with localStorage
  const [tableCartsMap, setTableCartsMap] = useState(() => {
    try {
      const saved = localStorage.getItem('cafepos_table_carts');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  // Integrated Barometer Rail State
  const [isRailCollapsed, setIsRailCollapsed] = useState(() => {
    try {
      const saved = localStorage.getItem('cafepos_rail_collapsed');
      if (saved !== null) return saved === 'true';
      return typeof window !== 'undefined' && window.innerWidth <= 1024;
    } catch {
      return false;
    }
  });

  const toggleRailCollapse = () => {
    setIsRailCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem('cafepos_rail_collapsed', String(next)); } catch (_) { }
      return next;
    });
  };

  const tableSessionTimesRef = useRef({});
  // Lightweight 30s tick to keep elapsed session times ticking smoothly
  const [, setSessionTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setSessionTick((v) => v + 1), 30000);
    return () => clearInterval(t);
  }, []);

  // Ensure session start time is recorded whenever a table gets items
  useEffect(() => {
    if (!tableCartsMap) return;
    Object.keys(tableCartsMap).forEach((tId) => {
      const entry = tableCartsMap[tId];
      if (entry && entry.cart && entry.cart.length > 0) {
        if (!tableSessionTimesRef.current[tId]) {
          tableSessionTimesRef.current[tId] = entry.openedAt || Date.now();
        }
      } else {
        delete tableSessionTimesRef.current[tId];
      }
    });
  }, [tableCartsMap]);

  // Group tables by Hall for the Barometer Rail
  const barometerHalls = useMemo(() => {
    const list = (sections || []).map((sec) => ({
      id: sec.id,
      name: sec.name,
      tables: (tables || []).filter((t) => isSameHall(t.hall, sec.name))
    }));
    const unassigned = (tables || []).filter((t) => !(sections || []).some((s) => isSameHall(s.name, t.hall)));
    if (unassigned.length > 0) {
      list.push({ id: 'other', name: 'طاولات عامة', tables: unassigned });
    }
    return list;
  }, [sections, tables]);

  const [editingOrderModal, setEditingOrderModal] = useState(null);
  const [editOrderForm, setEditOrderForm] = useState({
    customerName: '',
    customerPhone: '',
    orderType: 'takeaway',
    tableName: '',
    paymentMethod: 'cash',
    cashAmount: '',
    cardAmount: '',
    walletAmount: '',
    discount: 0,
    notes: ''
  });

  const isTableCartsHydrated = useRef(false);
  const prevTableCartsRef = useRef({});
  const pendingChangedTablesRef = useRef(new Set());
  const saveTableCartTimeoutRef = useRef(null);
  // تتبع الطاولات التي يجري حفظها الآن عبر API (in-flight)
  // يمنع poll من الكتابة فوق بيانات لم تُستكمل في قاعدة البيانات بعد
  const inFlightTablesRef = useRef(new Set());
  const mutationSeqRef = useRef(0);   // يزيد مع أي تعديل محلي أو عملية حساسة
  const pollBusyRef = useRef(false);  // true أثناء النقل/الدفع
  const checkoutInFlightRef = useRef(false); // حماية فورية من النقر المزدوج على إتمام الدفع
  const pendingCheckoutOrderIdRef = useRef(null); // معرف فريد مستقر للمحاولة لمنع تكرار الفاتورة عند إعادة الضغط بعد المهلة
  const missCountRef = useRef({});    // عدّاد غياب الطاولة عن الداتابيز
  const retryTimerRef = useRef(null);
  const saveRetryCountRef = useRef({});
  // حماية النقل: مجموعة بأرقام الطاولات المصدر التي تم نقلها مؤخراً — لمنع أي auto-save أو poll من إعادة كتابة بياناتها
  const transferBlockedTablesRef = useRef(new Set());

  // Addendum 17: refs ثابتة لتفادي إعادة تسجيل مستمع QR مع كل تحديث لـ tables/categories/selectedTable
  // Addendum 17: refs ثابتة لتفادي إعادة تسجيل مستمع QR مع كل تحديث لـ tables/categories/selectedTable/settings/printers/products
  const tablesRef = useRef(tables);
  const categoriesRef = useRef(categories);
  const selectedTableRef = useRef(selectedTable);
  const orderTypeRef = useRef(orderType);
  const settingsRef = useRef(settings);
  const availablePrintersRef = useRef(availablePrinters);
  const productsRef = useRef(products);
  useEffect(() => { tablesRef.current = tables; }, [tables]);
  useEffect(() => { categoriesRef.current = categories; }, [categories]);
  useEffect(() => { selectedTableRef.current = selectedTable; }, [selectedTable]);
  useEffect(() => { orderTypeRef.current = orderType; }, [orderType]);
  useEffect(() => { settingsRef.current = settings; }, [settings]);
  useEffect(() => { availablePrintersRef.current = availablePrinters; }, [availablePrinters]);
  useEffect(() => { productsRef.current = products; }, [products]);


  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [customerSuggestions, setCustomerSuggestions] = useState([]);
  const [showCustomerSuggestions, setShowCustomerSuggestions] = useState(false);
  const [discountAmount, setDiscountAmount] = useState(0);
  const [orderNotes, setOrderNotes] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [splitCash, setSplitCash] = useState('');
  const [splitWallet, setSplitWallet] = useState('');
  const [splitCard, setSplitCard] = useState('');
  const [paidAmount, setPaidAmount] = useState('');

  const searchCustomerTimeoutRef = useRef(null);
  const saveCustomerAddrTimeoutRef = useRef(null);
  const isSwitchingTabRef = useRef(false);

  // Multi-Takeaway Sessions & Hold State
  const [takeawayTabs, setTakeawayTabs] = useState(() => {
    try {
      const saved = localStorage.getItem('cafepos_takeaway_tabs');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (_) { }
    return [{
      id: 'tab_takeaway_1',
      name: 'طلب 1',
      cart: [],
      customerName: '',
      customerPhone: '',
      customerAddress: '',
      discountAmount: 0,
      orderNotes: '',
      isHeld: false
    }];
  });

  const [activeTakeawayId, setActiveTakeawayId] = useState(() => {
    try {
      const savedId = localStorage.getItem('cafepos_active_takeaway_id');
      if (savedId) return savedId;
    } catch (_) { }
    return 'tab_takeaway_1';
  });

  // Auto-sync active takeaway tab when cart or customer info changes
  useEffect(() => {
    if (orderType === 'takeaway' && activeTakeawayId && !isSwitchingTabRef.current) {
      setTakeawayTabs((prev) => {
        const idx = prev.findIndex((t) => t.id === activeTakeawayId);
        if (idx === -1) return prev;
        const current = prev[idx];
        if (
          current.cart === cart &&
          current.customerName === customerName &&
          current.customerPhone === customerPhone &&
          current.customerAddress === customerAddress &&
          current.discountAmount === discountAmount &&
          current.orderNotes === orderNotes
        ) {
          return prev;
        }
        const updated = [...prev];
        updated[idx] = {
          ...current,
          cart,
          customerName,
          customerPhone,
          customerAddress,
          discountAmount,
          orderNotes
        };
        try {
          localStorage.setItem('cafepos_takeaway_tabs', JSON.stringify(updated));
          localStorage.setItem('cafepos_active_takeaway_id', activeTakeawayId);
        } catch (_) { }
        return updated;
      });
    }
  }, [orderType, activeTakeawayId, cart, customerName, customerPhone, customerAddress, discountAmount, orderNotes]);

  // Customer Debts & Notebook State
  const [debtsList, setDebtsList] = useState([]);
  const [debtsGroupedList, setDebtsGroupedList] = useState([]); // Grouped by customer
  const [notebookModal, setNotebookModal] = useState(false);
  const [payDebtData, setPayDebtData] = useState(null);
  const [payAmountInput, setPayAmountInput] = useState('');
  const [payNotesInput, setPayNotesInput] = useState('');
  const [payCustomerModalData, setPayCustomerModalData] = useState(null);
  const [payCustomerAmountInput, setPayCustomerAmountInput] = useState('');
  const [payCustomerNotesInput, setPayCustomerNotesInput] = useState('');
  const [deleteDebtData, setDeleteDebtData] = useState(null);
  const [adminPasswordInput, setAdminPasswordInput] = useState('');
  const [debtFilter, setDebtFilter] = useState('all'); // 'all' | 'unpaid' | 'partial' | 'paid'
  const [debtSearch, setDebtSearch] = useState('');
  const [viewCustomerDetails, setViewCustomerDetails] = useState(null); // Customer details modal
  const [debtViewMode, setDebtViewMode] = useState('by_customer'); // 'by_customer' | 'by_date'

  // Transfer Table Order State
  const [transferModal, setTransferModal] = useState(null); // { sourceTable }
  const [transferTargetId, setTransferTargetId] = useState('');

  // Transfer Single Item Between Tables State
  const [transferItemModal, setTransferItemModal] = useState(null); // { item, sourceTable }
  const [transferItemTargetId, setTransferItemTargetId] = useState('');
  const [transferItemQty, setTransferItemQty] = useState(1);
  const [transferItemAdminPassword, setTransferItemAdminPassword] = useState('');
  const [transferItemError, setTransferItemError] = useState('');
  const [clockError, setClockError] = useState(null);

  // User & Authentication State
  // The main process is the only trusted source of authentication state.
  const [currentUser, setCurrentUser] = useState(null);
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [loginError, setLoginError] = useState('');
  const [loginFailCount, setLoginFailCount] = useState(0);
  const [emergencyResetModal, setEmergencyResetModal] = useState(false);
  const [emergencyPin, setEmergencyPin] = useState('');
  const [emergencyNewPass, setEmergencyNewPass] = useState('');
  const [emergencyConfirmPass, setEmergencyConfirmPass] = useState('');
  const [emergencyError, setEmergencyError] = useState('');
  const [emergencySuccess, setEmergencySuccess] = useState('');
  const [usersList, setUsersList] = useState([]);
  const [attendanceData, setAttendanceData] = useState({ users: [], shifts: [] });
  const [adjustmentsList, setAdjustmentsList] = useState([]);
  const [payrollData, setPayrollData] = useState(null);
  // FIX BUG-06: helper يعطي الشهر بتوقيت القاهرة بدلاً من UTC
  function getCairoLocalYYYYMM() {
    const now = new Date();
    // القاهرة UTC+2 (أو +3 DST) — نستخدم Intl للدقة
    try {
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Africa/Cairo',
        year: 'numeric', month: '2-digit'
      }).format(now).split('-');
      return `${parts[0]}-${parts[1]}`;
    } catch {
      // fallback: تعويض ثابت +2
      const offset = 2 * 60;
      const local = new Date(now.getTime() + offset * 60000);
      return local.toISOString().slice(0, 7);
    }
  }
  function getCairoLocalYYYYMMDD() {
    const now = new Date();
    try {
      return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Africa/Cairo',
        year: 'numeric', month: '2-digit', day: '2-digit'
      }).format(now);
    } catch {
      const offset = 2 * 60;
      const local = new Date(now.getTime() + offset * 60000);
      return local.toISOString().slice(0, 10);
    }
  }
  const [payrollMonth, setPayrollMonth] = useState(getCairoLocalYYYYMM);
  const [selectedPayrollDetails, setSelectedPayrollDetails] = useState(null);
  const [orderDateFilter, setOrderDateFilter] = useState(() => getLocalDateString(new Date()));
  const [orderDateMode, setOrderDateMode] = useState('all'); // 'day' | 'all' (يفتح افتراضياً على جميع الفواتير)
  const [orderSearchQuery, setOrderSearchQuery] = useState('');
  const [userManagementTab, setUserManagementTab] = useState('users'); // 'users' | 'attendance' | 'adjustments' | 'payroll'
  const [adjUserFilter, setAdjUserFilter] = useState('all');
  const [adjTypeFilter, setAdjTypeFilter] = useState('all');
  const [userModal, setUserModal] = useState(false);
  const [adjustmentModal, setAdjustmentModal] = useState(false);
  const [adjustmentForm, setAdjustmentForm] = useState({
    userId: '',
    type: 'penalty',
    amount: '',
    daysCount: '1',
    date: new Date().toISOString().slice(0, 10),
    reason: ''
  });
  const [userForm, setUserForm] = useState({
    id: null,
    username: '',
    name: '',
    password: '',
    role: 'cashier',
    phone: '',
    salary: 3500,
    shift_name: 'الشيفت الصباحي (الأول)',
    shift_start: '06:00',
    shift_end: '14:00'
  });
  const [shiftTypeInput, setShiftTypeInput] = useState('الشيفت الصباحي (الأول: 06:00 ص - 02:00 م)');

  // Modals
  const [receiptOrder, setReceiptOrder] = useState(null);
  const [barTicketOrder, setBarTicketOrder] = useState(null);
  const [shishaTicketOrder, setShishaTicketOrder] = useState(null);
  const [barVoidTicket, setBarVoidTicket] = useState(null);
  const [expensesPrintData, setExpensesPrintData] = useState(null);
  const [adminAuthModal, setAdminAuthModal] = useState(null);
  const [adminAuthPassword, setAdminAuthPassword] = useState('');
  const [adminAuthTargetQty, setAdminAuthTargetQty] = useState(0);
  const [adminAuthError, setAdminAuthError] = useState('');
  const [adminAuthPrintVoid, setAdminAuthPrintVoid] = useState(true);
  const [adminAuthReason, setAdminAuthReason] = useState('');
  // شيك الحساب: بيانات الطباعة الصامتة بدون فتح مودال الفاتورة الكبير
  const [preBillCheckData, setPreBillCheckData] = useState(null);

  // إعدادات المطور وتفعيل الخواص الخاصة (Developer Features)
  const [vendorDevUnlocked, setVendorDevUnlocked] = useState(false);
  const [vendorDevPassword, setVendorDevPassword] = useState('');
  const [vendorDevError, setVendorDevError] = useState('');
  const [vendorDevFeatures, setVendorDevFeatures] = useState({
    enable_bar_order: true,
    enable_guest_check: true,
    require_password_transfer_tables: false,
    allow_cashier_cancel_orders: false,
    show_notebook_to_cashier: false,
    enable_notebook_for_admin: true,
    show_stock_alert_on_order: false,
    enable_multi_shifts: false,
    show_orders_to_cashier: false,
    require_check_print_before_checkout: true,
    enable_waiter_qr: false,
    enable_waiter_system: false,
    enable_customer_qr: false,
    enable_mobile_hub: false,
    enable_takeaway: true,
    show_shift_status_bar: false,
    show_bar_ticket_in_receipt: false
  });
  const [vendorDevSaving, setVendorDevSaving] = useState(false);

  useEffect(() => {
    if (!isTableCartsHydrated.current) {
      // Do NOT overwrite database table carts on initial mount before hydration
      prevTableCartsRef.current = tableCartsMap;
      return;
    }
    try {
      // 1) LocalStorage is updated immediately (zero debounce)
      localStorage.setItem('cafepos_table_carts', JSON.stringify(tableCartsMap));
      localStorage.setItem('cafepos_table_carts_timestamp', Date.now().toString());

      // 2) Identify which table IDs actually changed (ignore _rev differences)
      const prev = prevTableCartsRef.current || {};
      const allKeys = new Set([...Object.keys(prev), ...Object.keys(tableCartsMap || {})]);
      let anyRealChange = false;
      allKeys.forEach((tblId) => {
        const prevCart = prev[tblId];
        const nextCart = tableCartsMap ? tableCartsMap[tblId] : null;
        if (cartChanged(prevCart, nextCart)) {
          pendingChangedTablesRef.current.add(tblId);
          anyRealChange = true;
        }
      });
      if (anyRealChange) {
        mutationSeqRef.current += 1;
      }
      prevTableCartsRef.current = tableCartsMap;

      // 3) Debounce the backend save (400ms) for changed tables only (only when user is logged in)
      if (saveTableCartTimeoutRef.current) {
        clearTimeout(saveTableCartTimeoutRef.current);
      }

      if (!currentUser) {
        pendingChangedTablesRef.current.clear();
        return;
      }

      saveTableCartTimeoutRef.current = setTimeout(() => {
        if (!currentUser) return;
        if (pendingChangedTablesRef.current.size === 0) return;
        const tablesToSave = Array.from(pendingChangedTablesRef.current);
        pendingChangedTablesRef.current.clear();

        tablesToSave.forEach((tableId) => {
          // حماية النقل: لا تحفظ طاولة تم نقل بياناتها (المصدر) — هذا يمنع إعادة كتابة بيانات محذوفة
          if (transferBlockedTablesRef.current.has(tableId) || transferBlockedTablesRef.current.has(String(tableId)) || transferBlockedTablesRef.current.has(Number(tableId))) {
            console.log(`[Autosave] Skipping save for transfer-blocked table ${tableId}`);
            return;
          }
          const cartData = tableCartsMap ? tableCartsMap[tableId] : null;
          if (!api.saveTableCart) return;

          // سجّل الطاولة كـ in-flight قبل إرسال الطلب
          inFlightTablesRef.current.add(tableId);
          inFlightTablesRef.current.add(String(tableId));

          api.saveTableCart(tableId, cartData).then((res) => {
            // أزل من in-flight بعد نجاح الحفظ
            inFlightTablesRef.current.delete(tableId);
            inFlightTablesRef.current.delete(String(tableId));

            // البند 4ب: إذا كان هناك تعارض rev — أعد السلة من الداتابيز
            if (res && res.conflict && res.current) {
              console.warn(`[Autosave] Rev conflict on table ${tableId} — reloading from DB`);
              mutationSeqRef.current += 1;
              let serverCart = null;
              setTableCartsMap((prev) => {
                const prevEntry = prev[tableId] || prev[String(tableId)] || {};
                serverCart = {
                  ...res.current,
                  printedCheck: Boolean(res.current.printedCheck),
                  printedCheckTime: res.current.printedCheck ? (res.current.printedCheckTime || prevEntry.printedCheckTime || null) : null
                };
                const next = { ...prev };
                next[tableId] = serverCart;
                next[String(tableId)] = serverCart;
                if (prevTableCartsRef.current) {
                  prevTableCartsRef.current[tableId] = serverCart;
                  prevTableCartsRef.current[String(tableId)] = serverCart;
                }
                return next;
              });
              // لو الطاولة المفتوحة وكان الكاشير في وضع الصالة: حدّث الشاشة
              if (orderType === 'dine_in' && selectedTable && String(selectedTable.id) === String(tableId) && serverCart) {
                setCart(serverCart.cart || []);
                setCustomerName(serverCart.customerName || '');
                setDiscountAmount(serverCart.discountAmount || 0);
                setOrderNotes(serverCart.orderNotes || '');
                showToast('⚠️ الطاولة اتحدثت بطلب جديد من الويتر. راجع الأصناف');
              }
            } else if (res && res.success === false && !res.conflict) {
              // فشل: محاولة بحد أقصى 3 مرات فقط لمنع التجميد وحلقات التكرار اللانهائية
              const curRetries = (saveRetryCountRef.current[tableId] || 0) + 1;
              saveRetryCountRef.current[tableId] = curRetries;
              if (curRetries <= 3) {
                console.warn(`[Autosave] Save failed for table ${tableId} (retry ${curRetries}/3):`, res.error);
                pendingChangedTablesRef.current.add(tableId);
                if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
                retryTimerRef.current = setTimeout(() => {
                  setTableCartsMap((p) => ({ ...p }));
                }, 3000);
              } else {
                delete saveRetryCountRef.current[tableId];
                console.error(`[Autosave] Table ${tableId} exceeded max retries (3), aborting autosave loop:`, res.error);
              }
            } else if (res && res.rev !== undefined) {
              // نجاح: تصفير عداد المحاولات وتحديث _rev
              delete saveRetryCountRef.current[tableId];
              delete saveRetryCountRef.current[String(tableId)];
              setTableCartsMap((prev) => {
                if (!prev[tableId]) return prev;
                const updated = { ...prev[tableId], _rev: res.rev };
                return { ...prev, [tableId]: updated, [String(tableId)]: updated };
              });
              // حدّث prevTableCartsRef لمنع حلقة الحفظ اللانهائية
              if (prevTableCartsRef.current && prevTableCartsRef.current[tableId]) {
                const updatedPrev = { ...prevTableCartsRef.current[tableId], _rev: res.rev };
                prevTableCartsRef.current[tableId] = updatedPrev;
              }
            }
          }).catch((err) => {
            inFlightTablesRef.current.delete(tableId);
            inFlightTablesRef.current.delete(String(tableId));
            const curRetries = (saveRetryCountRef.current[tableId] || 0) + 1;
            saveRetryCountRef.current[tableId] = curRetries;
            if (curRetries <= 3) {
              pendingChangedTablesRef.current.add(tableId);
              if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
              retryTimerRef.current = setTimeout(() => {
                setTableCartsMap((p) => ({ ...p }));
              }, 3000);
            } else {
              delete saveRetryCountRef.current[tableId];
              console.error(`[Autosave] Table ${tableId} catch() exceeded max retries (3), aborting:`, err);
            }
            console.error(`Error saving table cart ${tableId}:`, err);
          });
        });
      }, 400);
    } catch (e) {
      console.error('Error saving table carts:', e);
    }

    return () => {
      if (saveTableCartTimeoutRef.current) {
        clearTimeout(saveTableCartTimeoutRef.current);
      }
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
      }
    };
  }, [tableCartsMap, currentUser]);

  useEffect(() => {
    const notebookAllowed = vendorDevFeatures.enable_notebook_for_admin !== false && (currentUser?.role === 'admin' || vendorDevFeatures.show_notebook_to_cashier);
    if (!notebookAllowed && orderType === 'notebook') {
      setOrderType('takeaway');
      setPaymentMethod('cash');
    }
    // حماية إضافية: لو paymentMethod فاضل 'notebook' والنوتة مش مسموحة أو نوع الطلب ليس نوتة، ارجعه لـ cash
    if ((!notebookAllowed || orderType !== 'notebook') && paymentMethod === 'notebook') {
      setPaymentMethod('cash');
    }
    if (vendorDevFeatures.enable_takeaway === false && orderType === 'takeaway') {
      setOrderType('dine_in');
    }
    if (currentUser && currentUser.role !== 'admin' && !vendorDevFeatures.show_orders_to_cashier && activeTab === 'orders') {
      setActiveTab('pos');
    }
  }, [currentUser, orderType, paymentMethod, vendorDevFeatures.show_notebook_to_cashier, vendorDevFeatures.enable_notebook_for_admin, vendorDevFeatures.show_orders_to_cashier, activeTab]);

  // Checkout Processing Guard (prevents double-click duplicate orders)
  const [isCheckingOut, setIsCheckingOut] = useState(false);

  // Admin Quick-Access Overlay (admin can access admin tabs without closing shift)
  const [adminOverlayModal, setAdminOverlayModal] = useState(false);
  const [adminOverlayPassword, setAdminOverlayPassword] = useState('');
  const [adminOverlayError, setAdminOverlayError] = useState('');
  const [savedCashierUser, setSavedCashierUser] = useState(null); // stores original cashier session
  const [expenseModal, setExpenseModal] = useState(false);
  const [expenseForm, setExpenseForm] = useState({ amount: '', category: 'مشتريات خامات (بن/حليب/سكر)', notes: '' });
  const [productModal, setProductModal] = useState(false);
  const [productForm, setProductForm] = useState({ id: null, name: '', price: '', cost: '', category_id: '', stock_qty: 100, low_stock_threshold: 10 });
  const [categoryModal, setCategoryModal] = useState(false);
  const [categoryForm, setCategoryForm] = useState({ id: null, name: '', icon: '☕' });
  const [categoryManagerModal, setCategoryManagerModal] = useState(false);

  // Menu / Products Search & Category Filter
  const [menuSearchQuery, setMenuSearchQuery] = useState('');
  const [menuActiveCategoryFilter, setMenuActiveCategoryFilter] = useState('all');
  const [menuLowStockOnly, setMenuLowStockOnly] = useState(false);

  // System Reset Modal
  const [systemResetModal, setSystemResetModal] = useState(false);
  const [systemResetType, setSystemResetType] = useState('transactions_only'); // 'transactions_only' | 'full_factory'
  const [systemResetPassword, setSystemResetPassword] = useState('');
  const [systemResetError, setSystemResetError] = useState('');
  const [systemResetLoading, setSystemResetLoading] = useState(false);

  // Notifications
  const [toast, setToast] = useState('');

  // Mandatory Default Password Change State
  const [forcePasswordModal, setForcePasswordModal] = useState(false);
  const [newPasswordInput, setNewPasswordInput] = useState('');
  const [confirmPasswordInput, setConfirmPasswordInput] = useState('');
  const [passwordChangeError, setPasswordChangeError] = useState('');

  // Licensing State
  const [licenseData, setLicenseData] = useState({ isActivated: true, machineId: '' });
  const [licenseInput, setLicenseInput] = useState('');
  const [licenseError, setLicenseError] = useState('');

  // Refresh data from API
  async function refreshData(skipTableId = null) {
    try {
      const [cats, prods, tbls, curShift, setts, uList, secs, savedCarts] = await Promise.all([
        api.listCategories(),
        api.listProducts(),
        api.listTables(),
        api.currentShift(),
        api.getSettings(),
        api.listUsers ? api.listUsers() : Promise.resolve([]),
        api.listSections ? api.listSections() : Promise.resolve([]),
        api.getTableCarts ? api.getTableCarts() : Promise.resolve({})
      ]);

      setCategories(Array.isArray(cats) ? cats : []);
      setProducts(Array.isArray(prods) ? prods : []);

      const finalTbls = Array.isArray(tbls) ? tbls.map((t) => {
        if (skipTableId && (Number(t.id) === Number(skipTableId) || String(t.id) === String(skipTableId))) {
          return { ...t, status: 'available', current_order_id: null };
        }
        return t;
      }) : [];
      setTables(finalTbls);

      setShift(curShift && !curShift.error ? curShift : null);
      setSettings(setts && !setts.error ? setts : {});
      if (setts?.show_all_tables_tab !== undefined) {
        setShowAllTablesTab(setts.show_all_tables_tab !== 'false');
      }
      if (savedCarts && typeof savedCarts === 'object') {
        if (skipTableId) {
          delete savedCarts[skipTableId];
          delete savedCarts[String(skipTableId)];
          delete savedCarts[Number(skipTableId)];
        }
        setTableCartsMap((prev) => {
          // قاعدة البيانات هي مصدر الحقيقة للطلبات النشطة — لا ندمج prev القديم حتى لا تعود سلات تم نقلها أو مسحها
          const next = { ...savedCarts };
          if (skipTableId) {
            delete next[skipTableId];
            delete next[String(skipTableId)];
            delete next[Number(skipTableId)];
          }
          // نحافظ فقط على الطاولات التي لديها تغييرات محلية قيد الحفظ
          pendingChangedTablesRef.current.forEach((pId) => {
            if (skipTableId && (Number(pId) === Number(skipTableId) || String(pId) === String(skipTableId))) return;
            if (prev[pId]) next[pId] = prev[pId];
          });
          const isCurrentSelectedSkipped = skipTableId && selectedTable && (
            Number(selectedTable.id) === Number(skipTableId) ||
            String(selectedTable.id) === String(skipTableId)
          );
          // حماية النقل: لا تعيد كتابة بيانات الطاولة المفتوحة لو كانت طاولة تم نقلها أو لو selectedTable هي المصدر
          const isTransferBlocked = selectedTable && (
            transferBlockedTablesRef.current.has(selectedTable.id) ||
            transferBlockedTablesRef.current.has(String(selectedTable.id)) ||
            transferBlockedTablesRef.current.has(Number(selectedTable.id))
          );
          if (orderType === 'dine_in' && selectedTable && !isCurrentSelectedSkipped && !isTransferBlocked && cart && cart.length > 0) {
            next[selectedTable.id] = {
              ...(next[selectedTable.id] || {}),
              cart: [...cart],
              customerName: (customerName || '').trim(),
              discountAmount,
              orderNotes
            };
          }
          return next;
        });
      }
      if (skipTableId) {
        if (prevTableCartsRef.current) {
          delete prevTableCartsRef.current[skipTableId];
          delete prevTableCartsRef.current[String(skipTableId)];
          delete prevTableCartsRef.current[Number(skipTableId)];
        }
        try {
          const stored = localStorage.getItem('cafepos_table_carts');
          if (stored) {
            const parsed = JSON.parse(stored);
            delete parsed[skipTableId];
            delete parsed[String(skipTableId)];
            delete parsed[Number(skipTableId)];
            localStorage.setItem('cafepos_table_carts', JSON.stringify(parsed));
          }
        } catch (_) { }
      }
      isTableCartsHydrated.current = true;
      if (Array.isArray(uList)) {
        setUsersList(uList);
      }
      if (Array.isArray(secs)) {
        setSections(secs);
        // Build sectionTableCounts from actual tables
        const counts = {};
        if (Array.isArray(tbls)) {
          for (const sec of secs) {
            counts[sec.id] = tbls.filter(t => isSameHall(t.hall, sec.name)).length;
          }
        }
        setSectionTableCounts(counts);
      }
      if (setts?.shift_schedules) {
        try {
          const parsed = typeof setts.shift_schedules === 'string' ? JSON.parse(setts.shift_schedules) : setts.shift_schedules;
          if (Array.isArray(parsed) && parsed.length > 0) {
            setShiftSchedules(parsed);
          }
        } catch (e) { }
      }

      if (setts && typeof setts === 'object') {
        const legacyWaiterQr = setts.enable_waiter_qr === 'true';
        const waiterSysActive = setts.enable_waiter_system !== undefined
          ? setts.enable_waiter_system === 'true'
          : legacyWaiterQr;
        const customerQrActive = setts.enable_customer_qr !== undefined
          ? setts.enable_customer_qr === 'true'
          : legacyWaiterQr;

        setVendorDevFeatures({
          enable_bar_order: setts.enable_bar_order !== 'false',
          enable_guest_check: setts.enable_guest_check !== 'false',
          require_password_transfer_tables: setts.require_password_transfer_tables === 'true',
          allow_cashier_cancel_orders: setts.allow_cashier_cancel_orders === 'true',
          show_notebook_to_cashier: setts.show_notebook_to_cashier === 'true',
          enable_notebook_for_admin: setts.enable_notebook_for_admin !== 'false',
          show_stock_alert_on_order: setts.show_stock_alert_on_order === 'true',
          enable_multi_shifts: setts.enable_multi_shifts === 'true',
          show_orders_to_cashier: setts.show_orders_to_cashier === 'true',
          require_check_print_before_checkout: setts.require_check_print_before_checkout !== 'false',
          enable_waiter_qr: waiterSysActive || customerQrActive,
          enable_waiter_system: waiterSysActive,
          enable_customer_qr: customerQrActive,
          enable_mobile_hub: setts.enable_mobile_hub === 'true',
          enable_takeaway: setts.enable_takeaway !== 'false',
          show_shift_status_bar: setts.show_shift_status_bar === 'true',
          show_bar_ticket_in_receipt: setts.show_bar_ticket_in_receipt === 'true'
        });
        setSettings(prev => ({
          ...prev,
          ...setts,
          enable_waiter_qr: (waiterSysActive || customerQrActive) ? 'true' : 'false',
          enable_waiter_system: waiterSysActive ? 'true' : 'false',
          enable_customer_qr: customerQrActive ? 'true' : 'false',
          enable_mobile_hub: setts.enable_mobile_hub === 'true' ? 'true' : 'false'
        }));
      }

      if (api.getQrInfo) {
        api.getQrInfo().then((info) => {
          if (info) setQrInfo(info);
        }).catch(() => { });
      }

      if (!activeCategory && Array.isArray(cats) && cats.length > 0) {
        setActiveCategory(cats[0].id);
      }

      loadDebts();
      loadAdjustments();
    } catch (err) {
      console.error('Error refreshing data:', err);
    }
  }

  async function loadAdjustments() {
    try {
      if (api.listEmployeeAdjustments) {
        const list = await api.listEmployeeAdjustments();
        setAdjustmentsList(Array.isArray(list) ? list : []);
      }
    } catch (err) {
      console.error('Error loading adjustments:', err);
      setAdjustmentsList([]);
    }
  }

  async function loadPayroll(month) {
    try {
      if (api.getMonthlyPayroll) {
        const data = await api.getMonthlyPayroll(month);
        setPayrollData(data);
      }
    } catch (err) {
      console.error('Error loading payroll:', err);
      setPayrollData(null);
    }
  }

  async function loadDebts() {
    let debts = [];
    let grouped = [];
    try {
      if (api.listDebts) {
        const res = await api.listDebts();
        if (Array.isArray(res)) debts = res;
      }
    } catch (err) {
      console.error('Error loading debts:', err);
    }

    try {
      if (api.listDebtsGrouped) {
        const res = await api.listDebtsGrouped();
        if (Array.isArray(res)) grouped = res;
      }
    } catch (err) {
      console.error('Error loading grouped debts:', err);
    }

    // Client-side auto-grouping fallback if grouped is empty but debts exist
    if (grouped.length === 0 && debts.length > 0) {
      const grpMap = {};
      for (const d of debts) {
        if (d.status === 'paid') continue;
        const cName = (d.customer_name || 'عميل').trim();
        if (!grpMap[cName]) {
          grpMap[cName] = {
            customer_id: d.customer_id,
            customer_name: cName,
            customer_phone: d.customer_phone || '',
            debt_count: 0,
            invoices_count: 0,
            total_amount: 0,
            total_paid: 0,
            paid_amount: 0,
            total_remaining: 0,
            remaining_amount: 0,
            debts: [],
            payments: []
          };
        }
        grpMap[cName].debt_count += 1;
        grpMap[cName].invoices_count += 1;
        grpMap[cName].total_amount += (Number(d.total_amount) || 0);
        grpMap[cName].total_paid += (Number(d.paid_amount) || 0);
        grpMap[cName].paid_amount += (Number(d.paid_amount) || 0);
        grpMap[cName].total_remaining += (Number(d.remaining_amount) || 0);
        grpMap[cName].remaining_amount += (Number(d.remaining_amount) || 0);
        grpMap[cName].debts.push(d);
        if (Array.isArray(d.payments)) {
          grpMap[cName].payments.push(...d.payments);
        }
      }
      grouped = Object.values(grpMap);
    }

    grouped = grouped.map((c) => ({
      ...c,
      debt_count: c.debt_count ?? c.invoices_count ?? (Array.isArray(c.debts) ? c.debts.length : 1),
      total_amount: Number(c.total_amount) || 0,
      total_paid: Number(c.total_paid ?? c.paid_amount) || 0,
      total_remaining: Number(c.total_remaining ?? c.remaining_amount) || 0
    }));

    setDebtsList(debts);
    setDebtsGroupedList(grouped);
  }

  const [attendanceDateFilter, setAttendanceDateFilter] = useState(() => getLocalDateString(new Date()));
  const [attendanceDateMode, setAttendanceDateMode] = useState('all'); // 'day' | 'month' | 'all'
  const [attendanceMonthFilter, setAttendanceMonthFilter] = useState(getCairoLocalYYYYMM);
  const [attendanceUserFilter, setAttendanceUserFilter] = useState('all');
  const [orderTypeFilter, setOrderTypeFilter] = useState('all'); // 'all' | 'dine_in' | 'takeaway' | 'notebook' | 'notebook_paid' | 'notebook_unpaid'
  const [orderCashierFilter, setOrderCashierFilter] = useState('all');

  async function loadDashboard() {
    try {
      const data = await api.dashboardStats();
      setDashboardData(data);
    } catch (e) {
      console.error(e);
    }
  }

  async function loadAllShifts() {
    try {
      if (api.listShifts) {
        const sList = await api.listShifts(100);
        const arr = Array.isArray(sList) ? sList : [];
        setAllShiftsList(arr);
      }
    } catch (e) {
      console.error('Error loading shifts for reports:', e);
    }
  }

  async function handleGenerateReport(tab = reportsTab, overrideFrom = null, overrideTo = null, overrideUserId = null, overrideShiftId = null) {
    setReportLoading(true);
    const fromDate = overrideFrom !== null ? overrideFrom : reportDateFrom;
    const toDate = overrideTo !== null ? overrideTo : reportDateTo;
    const effectiveUserId = overrideUserId !== null && overrideUserId !== undefined ? overrideUserId : reportUserId;

    try {
      if (tab === 'quick') {
        await loadDashboard();
        setReportLoading(false);
        return;
      }
      if (tab === 'sales') {
        const res = await api.getReportSales({
          dateFrom: fromDate ? String(fromDate).slice(0, 10) : null,
          dateTo: toDate ? String(toDate).slice(0, 10) : null,
          shiftId: overrideShiftId || reportShiftId || null,
          userId: effectiveUserId !== 'all' ? effectiveUserId : null
        });
        if (res && !res.error) {
          setReportData({
            summary: res.summary || {},
            topProducts: Array.isArray(res.topProducts) ? res.topProducts : [],
            allProducts: Array.isArray(res.allProducts) ? res.allProducts : [],
            dailyBreakdown: Array.isArray(res.dailyBreakdown) ? res.dailyBreakdown : [],
            bySection: Array.isArray(res.bySection) ? res.bySection : [],
            userBreakdown: Array.isArray(res.userBreakdown) ? res.userBreakdown : [],
            ordersList: Array.isArray(res.ordersList) ? res.ordersList : []
          });
        } else {
          showToast(res?.error || '❌ تعذر استخراج تقرير المبيعات');
          setReportData(null);
        }
      } else if (tab === 'cancellations') {
        const res = await api.getReportSales({
          reportType: 'cancellations',
          dateFrom: fromDate ? String(fromDate).slice(0, 10) : null,
          dateTo: toDate ? String(toDate).slice(0, 10) : null
        });
        if (res && !res.error) {
          setReportData({
            type: 'cancellations',
            dateFrom: res.dateFrom,
            dateTo: res.dateTo,
            summary: res.summary || {},
            entries: Array.isArray(res.entries) ? res.entries : []
          });
        } else {
          showToast(res?.error || '❌ تعذر استخراج تقرير الإلغاءات');
          setReportData(null);
        }
      } else if (tab === 'inventory') {
        const pid = invProductFilter && invProductFilter !== 'all' ? invProductFilter : null;
        const res = await api.getReportInventory({
          dateFrom: fromDate ? String(fromDate).slice(0, 10) : null,
          dateTo: toDate ? String(toDate).slice(0, 10) : null,
          productId: pid
        });
        if (res && !res.error) {
          setReportData({
            allProducts: Array.isArray(res.allProducts) ? res.allProducts : [],
            movements: Array.isArray(res.movements) ? res.movements : [],
            movementSummary: Array.isArray(res.movementSummary) ? res.movementSummary : [],
            lowStock: Array.isArray(res.lowStock) ? res.lowStock : [],
            consumedToday: Array.isArray(res.consumedToday) ? res.consumedToday : [],
            consumedWeek: Array.isArray(res.consumedWeek) ? res.consumedWeek : [],
            productDetails: res.productDetails || null
          });
        } else {
          showToast(res?.error || '❌ تعذر استخراج تقرير المخزون');
          setReportData(null);
        }
      } else if (tab === 'shifts') {
        const targetShiftId = overrideShiftId || reportShiftId || (shift?.id);
        if (!targetShiftId) {
          showToast('⚠️ يرجى اختيار الشيفت أولاً');
          setReportLoading(false);
          return;
        }
        const res = await api.getReportShift({ shiftId: Number(targetShiftId) });
        if (res && !res.error && res.shift) {
          setReportData({
            shiftId: Number(targetShiftId),
            shift: res.shift,
            orders: Array.isArray(res.orders) ? res.orders : [],
            itemsSummary: Array.isArray(res.itemsSummary) ? res.itemsSummary : [],
            expenses: Array.isArray(res.expenses) ? res.expenses : [],
            stockConsumed: Array.isArray(res.stockConsumed) ? res.stockConsumed : []
          });
        } else {
          showToast(res?.error || '⚠️ لم يتم العثور على بيانات لهذا الشيفت');
          setReportData(null);
        }
      } else if (tab === 'daily_summary') {
        const targetDate = fromDate ? String(fromDate).slice(0, 10) : getLocalDateString(new Date());
        const res = await api.getReportDaily(targetDate);
        if (res && !res.error) {
          setReportData(res);
          setSelectedDailyShiftIds(Array.isArray(res.shifts) ? res.shifts.map(s => s.shift.id) : []);
        } else {
          showToast(res?.error || '⚠️ لم يتم العثور على بيانات لهذا اليوم');
          setReportData(null);
          setSelectedDailyShiftIds([]);
        }
      }
    } catch (err) {
      console.error('Error generating report:', err);
      showToast('❌ حدث خطأ أثناء جلب بيانات التقرير');
    } finally {
      setReportLoading(false);
    }
  }

  function handleQuickDate(preset) {
    const today = new Date();
    const todayStr = getLocalDateString(today);

    let from = todayStr;
    let to = todayStr;
    if (preset === 'today') {
      from = todayStr;
      to = todayStr;
    } else if (preset === 'yesterday') {
      const y = new Date(today);
      y.setDate(y.getDate() - 1);
      from = getLocalDateString(y);
      to = getLocalDateString(y);
    } else if (preset === 'week') {
      const w = new Date(today);
      w.setDate(w.getDate() - 7);
      from = getLocalDateString(w);
      to = todayStr;
    } else if (preset === 'month') {
      const m = new Date(today.getFullYear(), today.getMonth(), 1);
      from = getLocalDateString(m);
      to = todayStr;
    }
    setReportDatePreset(preset);
    setReportDateFrom(from);
    setReportDateTo(to);

    setReportsTab('sales');
    handleGenerateReport('sales', from, to, reportUserId);
  }

  async function loadExpensesList(overrideShiftId = undefined, fromDate = null, toDate = null) {
    try {
      if (api.listExpenses) {
        let sId = null;
        let from = fromDate;
        let to = toDate;
        if (overrideShiftId !== undefined) {
          sId = overrideShiftId;
        } else if (currentUser?.role === 'admin' && expenseFilterMode === 'all') {
          sId = null;
        } else if (currentUser?.role === 'admin' && expenseFilterMode === 'range') {
          sId = null;
          from = from || expenseFromDate;
          to = to || expenseToDate;
        } else {
          sId = shift?.id || null;
        }
        const list = await api.listExpenses(sId, from, to);
        setExpenseList(Array.isArray(list) ? list : []);
      }
    } catch (e) {
      console.error('Error loading expenses:', e);
      setExpenseList([]);
    }
  }

  async function handleUpdateExpense(e) {
    e.preventDefault();
    if (!editExpenseForm.id) return;
    try {
      const res = await api.updateExpense({
        id: editExpenseForm.id,
        amount: editExpenseForm.amount,
        category: editExpenseForm.category,
        notes: editExpenseForm.notes
      });
      if (res && res.success !== false) {
        showToast('✅ تم تعديل بند المصروف بنجاح وتحديث الخزينة');
        setEditingExpense(null);
        await loadExpensesList();
        await refreshData();
        if (reportsTab === 'shifts' && reportShiftId) {
          handleGenerateReport('shifts');
        }
      } else {
        showToast(res?.error || '❌ تعذر تعديل المصروف');
      }
    } catch (err) {
      console.error(err);
      showToast('❌ حدث خطأ أثناء تعديل المصروف');
    }
  }

  async function handleDeleteExpense(id) {
    if (currentUser?.role === 'admin') {
      if (!window.confirm('هل أنت متأكد من حذف هذا المصروف؟ سيتم إرجاع مبلغه لرصيد الخزينة.')) return;
      try {
        const res = await api.deleteExpense(id);
        if (res && res.success !== false) {
          showToast('🗑️ تم حذف المصروف وإرجاع المبلغ للخزينة بنجاح');
          await loadExpensesList();
          await refreshData();
          if (reportsTab === 'shifts' && reportShiftId) {
            handleGenerateReport('shifts');
          }
        } else {
          showToast(res?.error || '❌ تعذر حذف المصروف');
        }
      } catch (err) {
        console.error(err);
        showToast('❌ حدث خطأ أثناء حذف المصروف');
      }
    } else {
      setDeleteExpenseData({ id });
      setDeleteExpensePassword('');
    }
  }

  async function handleConfirmDeleteExpense(e) {
    if (e) e.preventDefault();
    return flightExpense(async () => {
      if (!deleteExpenseData) return;
      if (!deleteExpensePassword) {
        showToast('⚠️ يرجى إدخال كلمة مرور المدير');
        return;
      }
      try {
        const res = await api.deleteExpense(deleteExpenseData.id, deleteExpensePassword);
        if (res && res.success !== false) {
          showToast('🗑️ تم حذف المصروف وإرجاع المبلغ للخزينة بنجاح');
          setDeleteExpenseData(null);
          setDeleteExpensePassword('');
          await loadExpensesList();
          await refreshData();
          if (reportsTab === 'shifts' && reportShiftId) {
            handleGenerateReport('shifts');
          }
        } else {
          showToast(res?.error || '❌ تعذر حذف المصروف: كلمة المرور غير صحيحة');
        }
      } catch (err) {
        console.error(err);
        showToast('❌ حدث خطأ أثناء حذف المصروف');
      }
    });
  }

  function handleExportCsv() {
    if (!reportData && reportsTab !== 'quick') {
      showToast('⚠️ يرجى النقر على "عرض التقرير" أولاً');
      return;
    }

    try {
      let filename = 'report.xls';
      let title = 'تقرير مبيعات الكافيه';
      let headers = [];
      let rows = [];
      let totals = [];

      if (reportsTab === 'sales') {
        filename = `تقرير_مبيعات_${reportDateFrom}_إلى_${reportDateTo}.xls`;
        title = `تقرير المبيعات من ${reportDateFrom} إلى ${reportDateTo}`;
        headers = ['م', 'اسم الصنف', 'الكمية المباعة', 'إجمالي القيمة'];
        const exportProducts = (Array.isArray(reportData.allProducts) && reportData.allProducts.length) ? reportData.allProducts : (reportData.topProducts || []);
        exportProducts.forEach((p, idx) => {
          rows.push([idx + 1, p.product_name || '', p.total_qty || 0, `${p.total_sales || 0} ${settings.currency || 'ج.م'}`]);
        });
        totals = ['الإجمالي العام', `عدد الفواتير: ${reportData.summary?.order_count || 0}`, `كاش: ${reportData.summary?.cash_sales || 0}`, `${reportData.summary?.total_sales || 0} ${settings.currency || 'ج.م'}`];
      } else if (reportsTab === 'inventory') {
        filename = `تقرير_جرد_المخزون_${new Date().toISOString().slice(0, 10)}.xls`;
        title = 'تقرير جرد المخزون والأصناف';
        headers = ['م', 'الصنف', 'القسم', 'سعر البيع', 'سعر التكلفة', 'الرصيد الحالي', 'حد التنبيه', 'الحالة', 'إجمالي قيمة المخزون'];
        let grandTotalVal = 0;
        (reportData.allProducts || []).forEach((p, idx) => {
          const isLow = Number(p.stock_qty) <= Number(p.low_stock_threshold || 10);
          const cost = Number(p.cost ?? 0);
          const totalVal = (Number(p.stock_qty) || 0) * cost;
          grandTotalVal += totalVal;
          rows.push([
            idx + 1,
            p.name || '',
            p.category_name || 'عام',
            `${p.price || 0} ${settings.currency || 'ج.م'}`,
            `${cost} ${settings.currency || 'ج.م'}`,
            p.stock_qty || 0,
            p.low_stock_threshold || 10,
            isLow ? '⚠️ منخفض' : '✅ آمن',
            `${totalVal.toFixed(2)} ${settings.currency || 'ج.م'}`
          ]);
        });
        totals = ['الإجمالي', '', '', '', '', '', '', 'إجمالي قيمة المخزون:', `${grandTotalVal.toFixed(2)} ${settings.currency || 'ج.م'}`];
      } else if (reportsTab === 'shifts') {
        const s = reportData.shift || {};
        filename = `تقرير_شيفت_${s.id || 'حالي'}.xls`;
        title = `تقرير وردية #${s.id || ''} - ${getShiftDisplayName(s)} (${s.user_name || 'كاشير'})`;
        headers = ['م', 'الصنف المباع', 'الكمية', 'إجمالي المبيعات'];
        (reportData.itemsSummary || []).forEach((it, idx) => {
          rows.push([idx + 1, it.product_name || '', it.total_qty || 0, `${it.total_sales ?? 0} ${settings.currency || 'ج.م'}`]);
        });
        totals = [
          'ملخص الخزينة',
          `كاش البداية: ${s.opening_cash || 0}`,
          `مصروفات: ${s.expenses_total || 0}`,
          `مبيعات كاش: ${s.cash_sales || 0} ${settings.currency || 'ج.م'}`
        ];
      } else if (reportsTab === 'quick') {
        filename = `ملخص_اليوم_${new Date().toISOString().slice(0, 10)}.xls`;
        title = `ملخص المبيعات السريع - ${new Date().toLocaleDateString('ar-EG', { timeZone: 'Africa/Cairo' })}`;
        headers = ['البيان', 'القيمة'];
        rows = [
          ['إجمالي مبيعات اليوم', `${dashboardData?.today?.total || 0} ${settings.currency || 'ج.م'}`],
          ['عدد الفواتير المنفذة', `${dashboardData?.today?.count || 0} طلب`],
          ['المبيعات النقدية (كاش)', `${dashboardData?.today?.cash_total || 0} ${settings.currency || 'ج.م'}`],
          ['مبيعات المحافظ والفيزا', `${((dashboardData?.today?.card_total || 0) + (dashboardData?.today?.wallet_total || 0))} ${settings.currency || 'ج.م'}`],
          ['أصناف أوشكت على النفاد', `${dashboardData?.lowStockCount || 0} صنف`]
        ];
        totals = ['الصافي الإجمالي', `${dashboardData?.today?.total || 0} ${settings.currency || 'ج.م'}`];
      } else if (reportsTab === 'daily_summary' && reportData?.grandTotal) {
        filename = `تقرير_اليوم_الشامل_${reportData.date || new Date().toISOString().slice(0, 10)}.xls`;
        title = `تقرير نهاية اليوم الشامل - ${reportData.date || ''}`;
        headers = ['الوردية', 'الكاشير', 'الفترة', 'المبيعات', 'كاش', 'محفظة', 'فيزا', 'المصروفات', 'صافي الكاش', 'فارق الدرج'];
        (reportData.shifts || []).forEach((sh) => {
          rows.push([
            `${getShiftDisplayName(sh.shift)} (#${sh.shift.id})`,
            sh.shift.user_name || 'كاشير',
            `${formatShiftTime(sh.shift.opened_at)} - ${sh.shift.closed_at ? formatShiftTime(sh.shift.closed_at) : 'مفتوح'}`,
            `${sh.totalSales} ${settings.currency || 'ج.م'}`,
            `${sh.cashSales} ${settings.currency || 'ج.م'}`,
            `${sh.walletSales} ${settings.currency || 'ج.م'}`,
            `${sh.cardSales} ${settings.currency || 'ج.م'}`,
            `-${sh.totalExpenses} ${settings.currency || 'ج.م'}`,
            `${sh.netCash} ${settings.currency || 'ج.م'}`,
            `${sh.shift.cash_difference || 0} ${settings.currency || 'ج.م'}`
          ]);
        });
        totals = [
          'الإجمالي العام لليوم',
          '',
          `إجمالي الطلبات: ${reportData.grandTotal.ordersCount || 0}`,
          `${reportData.grandTotal.totalSales} ${settings.currency || 'ج.م'}`,
          `كاش: ${reportData.grandTotal.cashSales}`,
          `محفظة: ${reportData.grandTotal.walletSales}`,
          `فيزا: ${reportData.grandTotal.cardSales}`,
          `-${reportData.grandTotal.totalExpenses} ${settings.currency || 'ج.م'}`,
          `صافي: ${reportData.grandTotal.netCash} ${settings.currency || 'ج.م'}`,
          ''
        ];
      }

      // Generate styled HTML Spreadsheet with RTL direction
      const headerThs = headers.map(h => `<th style="background-color:#1e293b; color:#ffffff; font-weight:bold; border:1px solid #000; padding:10px; font-size:14px; text-align:right;">${h}</th>`).join('');
      const bodyRows = rows.map((row, rIdx) => {
        const bg = rIdx % 2 === 0 ? '#ffffff' : '#f8fafc';
        const tds = row.map(cell => `<td style="border:1px solid #cbd5e1; padding:8px; font-size:13px; text-align:right;">${cell !== null && cell !== undefined ? cell : ''}</td>`).join('');
        return `<tr style="background-color:${bg};">${tds}</tr>`;
      }).join('');

      let totalsRow = '';
      if (totals && totals.length > 0) {
        const tds = totals.map(cell => `<td style="border:1.5px solid #000; padding:10px; font-weight:bold; font-size:14px; background-color:#e2e8f0; text-align:right;">${cell !== null && cell !== undefined ? cell : ''}</td>`).join('');
        totalsRow = `<tfoot><tr>${tds}</tr></tfoot>`;
      }

      const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta charset="utf-8">
  <!--[if gte mso 9]>
  <xml>
    <x:ExcelWorkbook>
      <x:ExcelWorksheets>
        <x:ExcelWorksheet>
          <x:Name>${title.slice(0, 30)}</x:Name>
          <x:WorksheetOptions>
            <x:DisplayRightToLeft/>
          </x:WorksheetOptions>
        </x:ExcelWorksheet>
      </x:ExcelWorksheets>
    </x:ExcelWorkbook>
  </xml>
  <![endif]-->
  <style>
    body { font-family: 'Segoe UI', Tahoma, Arial, sans-serif; direction: rtl; }
    table { border-collapse: collapse; width: 100%; direction: rtl; margin-top: 15px; }
  </style>
</head>
<body>
  <div style="direction:rtl; text-align:right; margin-bottom:15px;">
    <h2 style="color:#0f172a; margin:0 0 5px 0;">${settings.cafe_name || 'التكية أسيوط الجديدة'}</h2>
    <h3 style="color:#2563eb; margin:0 0 5px 0;">${title}</h3>
    <p style="color:#64748b; font-size:12px; margin:0;">تاريخ التصدير: ${new Date().toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' })}</p>
  </div>
  <table>
    <thead>
      <tr>${headerThs}</tr>
    </thead>
    <tbody>
      ${bodyRows}
    </tbody>
    ${totalsRow}
  </table>
</body>
</html>`;

      const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast('📥 تم تصدير ملف الإكسيل المنسق بنجاح!');
    } catch (e) {
      console.error(e);
      showToast('❌ حدث خطأ أثناء تصدير التقرير');
    }
  }


  async function loadOrders(overrideFilter = null) {
    try {
      let filter = {};
      if (currentUser?.role === 'cashier') {
        if (shift?.id) {
          filter.shiftId = shift.id;
          filter.userId = currentUser.id;
        } else if (currentUser?.id) {
          filter.userId = currentUser.id;
        }
      }
      if (overrideFilter) {
        filter = { ...filter, ...overrideFilter };
      }
      const orders = await api.listOrders(filter);
      setOrdersList(Array.isArray(orders) ? orders : []);
    } catch (e) {
      console.error(e);
      setOrdersList([]);
    }
  }

  async function loadUsersAndAttendance(dateFilterParam = undefined) {
    try {
      let dFilter = dateFilterParam;
      if (dFilter === undefined) {
        if (attendanceDateMode === 'day') dFilter = attendanceDateFilter;
        else if (attendanceDateMode === 'month') dFilter = attendanceMonthFilter;
        else dFilter = null;
      }
      try {
        const uList = await api.listUsers();
        if (Array.isArray(uList)) setUsersList(uList);
      } catch (err) {
        console.error('Error loading users list:', err);
      }

      try {
        const attData = await api.getUserAttendanceReports(dFilter);
        setAttendanceData(attData && typeof attData === 'object' && !attData.error ? attData : { users: [], shifts: [], userSummaries: [] });
      } catch (err) {
        console.error('Error loading attendance reports:', err);
      }
    } catch (e) {
      console.error('Error in loadUsersAndAttendance:', e);
    }
  }

  useEffect(() => {
    (async () => {
      try {
        const session = api.getSession ? await api.getSession() : null;
        setCurrentUser(session || null);
        if (session) {
          await refreshData();
          if (session.role === 'admin') await loadUsersAndAttendance();
        } else {
          // If no session, load users so login buttons / avatars work
          if (api.listUsers) {
            try {
              const uList = await api.listUsers();
              if (Array.isArray(uList)) setUsersList(uList);
            } catch (_) { }
          }
          // Also load settings for cafe name
          if (api.getSettings) {
            try {
              const setts = await api.getSettings();
              if (setts && !setts.error) setSettings(setts);
            } catch (_) { }
          }
        }
      } catch (e) {
        console.error('Error restoring session:', e);
        setCurrentUser(null);
      } finally {
        setAppLoading(false);
      }
      if (api.checkClock) {
        api.checkClock().then((chk) => {
          if (chk && !chk.valid) setClockError(chk.error);
        }).catch(console.error);
      }
      if (api.getLicenseStatus) {
        api.getLicenseStatus().then((st) => {
          if (st) {
            setLicenseData(st);
            if (st.isClockTampered) setClockError(st.error);
          }
        }).catch((e) => console.error('Error fetching license:', e));
      }
      if (api.listPrinters) {
        api.listPrinters().then((printers) => {
          if (Array.isArray(printers)) setAvailablePrinters(printers);
        }).catch((e) => console.error('Error fetching printers:', e));
      }
      if (api.getQrInfo) {
        api.getQrInfo().then((info) => {
          if (info) setQrInfo(info);
        }).catch((e) => console.error('Error fetching QR info:', e));
      }
    })();
  }, []);

  // مزامنة الإعدادات مع window ref عشان يُقرأ في الـ timeouts (QR auto-print)
  useEffect(() => {
    window.__posSettingsRef = settings;
  }, [settings]);

  // إظهار معالج إعداد وتعيين الطابعات تلقائياً عند أول تشغيل إذا لم تكن مضبوطة مسبقاً
  useEffect(() => {
    if (currentUser && settings && Object.keys(settings).length > 0) {
      if (settings.printer_setup_done !== 'true' && !sessionStorage.getItem('skip_printer_wizard')) {
        setWizardPrinters({
          printer_name: settings.printer_name || '',
          bar_printer_name: settings.bar_printer_name || '',
          shisha_printer_name: settings.shisha_printer_name !== undefined ? settings.shisha_printer_name : 'شيشة',
          silent_print: settings.silent_print !== undefined ? settings.silent_print : '1'
        });
        setShowPrinterWizard(true);
      }
    }
  }, [currentUser, settings?.printer_setup_done]);

  // Web Audio chime for incoming QR orders
  function playQrChime() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.4);
    } catch (e) {
      console.warn('Audio chime error:', e);
    }
  }

  // استقبال أصناف QR من الموبايل ودمجها في سلة الطاولة المطابقة + إرسال تلقائي للبار
  useEffect(() => {
    if (!api.onQrOrderReceived) return;

    const unsubscribe = api.onQrOrderReceived((payload) => {
      if (!payload || !payload.items || payload.items.length === 0) return;
      console.info('[QR Order recv]', payload.tableId, payload.tableName, payload.hall);

      try { playQrChime(); } catch (e) { }

      const mergeItems = (existing) => {
        const merged = [...(existing || [])];
        payload.items.forEach((incoming) => {
          const idx = merged.findIndex(
            (it) => Number(it.id) === Number(incoming.id) && (it.notes || '') === (incoming.notes || '')
          );
          if (idx >= 0) {
            merged[idx] = {
              ...merged[idx],
              qty: merged[idx].qty + incoming.qty,
              sent_qty: (merged[idx].sent_qty || 0) + incoming.qty
            };
          } else {
            merged.push({
              id: incoming.id,
              name: incoming.name,
              price: incoming.price,
              category_id: incoming.category_id || null,
              category_name: incoming.category_name || '',
              qty: incoming.qty,
              notes: incoming.notes || '',
              sent_qty: incoming.qty
            });
          }
        });
        return merged;
      };

      // A3: تحديد الطاولة بـ tableId فقط — السيرفر دائماً يبعت tableId صحيح
      mutationSeqRef.current += 1;
      let matchedTable = null;
      if (payload.tableId) {
        matchedTable = (tablesRef.current || []).find((t) => String(t.id) === String(payload.tableId));
      }
      // A3: احذف فرع البحث بالقسم والفرع بدون قسم (يمنع اختيار طاولة غلط)

      const tableIdKey = payload.tableId;
      if (!tableIdKey) {
        console.warn('[QR Order] Could not resolve table for payload (missing tableId):', payload);
        return;
      }

      const rawHall = payload.hall || matchedTable?.hall || '';
      const hallFormatted = rawHall === 'indoor' ? 'صالة داخلية' : (rawHall === 'outdoor' ? 'صالة خارجية' : (rawHall || 'الصالة الرئيسية'));

      // البند 5أ: جمع بيانات الطباعة قبل setState حتى لا تستدعي دالة غير متزامنة داخل setState
      const newItemsForPrint = payload.items.map(it => ({ ...it, printQty: it.qty }));

      const separateShisha = hasDedicatedShishaStation();
      const qrShishaItems = separateShisha ? newItemsForPrint.filter((it) => isShishaItem(it, categoriesRef.current)) : [];
      const qrBarItems = separateShisha ? newItemsForPrint.filter((it) => !isShishaItem(it, categoriesRef.current)) : newItemsForPrint;
      const printTicketBase = {
        id: Date.now().toString().slice(-4),
        tableName: payload.tableName || matchedTable?.name || (payload.tableNumber ? `طاولة رقم ${payload.tableNumber}` : 'صالة'),
        tableNumber: payload.tableNumber || matchedTable?.number || '',
        hall: hallFormatted,
        orderType: 'dine_in',
        customerName: payload.customerName || '',
        cashierName: payload.waiterName || 'طلب QR (ويتر)',
        time: formatShiftTime(new Date()),
        items: newItemsForPrint,
        orderNotes: payload.notes || ''
      };

      // استخدم payload.tableCart من الخادم (الداتابيز هي المصدر)، وإلا ادمج محلياً
      const serverCartData = payload.tableCart || null;

      setTableCartsMap((tm) => {
        let mergedCart;
        if (serverCartData && Array.isArray(serverCartData.cart)) {
          // اتكل على نتيجة داتابيز الخادم مباشرة
          mergedCart = serverCartData.cart;
        } else {
          // fallback: ادمج محلياً
          const existingEntry = tm[tableIdKey] || tm[String(tableIdKey)] || { cart: [], customerName: '', discountAmount: 0, orderNotes: '' };
          const merged = [...(existingEntry.cart || [])];
          payload.items.forEach((incoming) => {
            const idx = merged.findIndex(
              (it) => Number(it.id) === Number(incoming.id) && (it.notes || '') === (incoming.notes || '')
            );
            if (idx >= 0) {
              merged[idx] = { ...merged[idx], qty: merged[idx].qty + incoming.qty, sent_qty: (merged[idx].sent_qty || 0) + incoming.qty };
            } else {
              merged.push({
                id: incoming.id,
                name: incoming.name,
                price: incoming.price,
                category_id: incoming.category_id || null,
                category_name: incoming.category_name || '',
                qty: incoming.qty,
                notes: incoming.notes || '',
                sent_qty: incoming.qty
              });
            }
          });
          mergedCart = merged;
        }

        const baseEntry = tm[tableIdKey] || tm[String(tableIdKey)] || { customerName: '', discountAmount: 0, orderNotes: '' };
        const updatedEntry = {
          ...baseEntry,
          cart: mergedCart,
          customerName: baseEntry.customerName || payload.customerName || '',
          discountAmount: baseEntry.discountAmount || 0,
          orderNotes: baseEntry.orderNotes || payload.notes || '',
          lastUpdated: new Date().toISOString(),
          ...(serverCartData ? { _rev: serverCartData._rev } : {})
        };

        return { ...tm, [tableIdKey]: updatedEntry };
      });
      // A3: حدّث prevTableCartsRef لمنع autosave من كتابة صدى للطاولة غير المفتوحة
      if (!selectedTableRef.current || String(selectedTableRef.current.id) !== String(tableIdKey)) {
        const updatedEntryForRef = {
          cart: serverCartData && Array.isArray(serverCartData.cart) ? serverCartData.cart : [],
          ...(serverCartData ? { _rev: serverCartData._rev } : {})
        };
        prevTableCartsRef.current = {
          ...prevTableCartsRef.current,
          [tableIdKey]: updatedEntryForRef,
          [String(tableIdKey)]: updatedEntryForRef
        };
      }

      // البند 5أ: طباعة بون البار خارج setState (side effect آمن)
      setTimeout(() => {
        setReceiptOrder(null);
        if (qrBarItems.length > 0 && qrShishaItems.length > 0) {
          const barTicket = { ...printTicketBase, id: Date.now().toString().slice(-4), items: qrBarItems, ticketType: 'bar' };
          const shishaTicket = { ...printTicketBase, id: (Date.now() + 1).toString().slice(-4), items: qrShishaItems, ticketType: 'shisha' };
          printBarTicket(barTicket);
          setTimeout(() => { printShishaTicket(shishaTicket); }, 300);
        } else if (qrShishaItems.length > 0) {
          const shishaTicket = { ...printTicketBase, id: Date.now().toString().slice(-4), items: qrShishaItems, ticketType: 'shisha' };
          printShishaTicket(shishaTicket);
        } else if (qrBarItems.length > 0) {
          const barTicket = { ...printTicketBase, id: Date.now().toString().slice(-4), items: qrBarItems, ticketType: 'bar' };
          printBarTicket(barTicket);
        }
      }, 150);

      // تحويل حالة الطاولة المحددة فقط إلى مشغولة فوراً في الواجهة
      setTables((prevTables) =>
        prevTables.map((t) => {
          const isMatch = String(t.id) === String(tableIdKey);
          return isMatch ? { ...t, status: 'occupied' } : t;
        })
      );

      // مزامنة فورية بالخلفية مع قاعدة البيانات للتأكيد التام
      if (api.listTables) {
        api.listTables().then((freshTables) => {
          if (Array.isArray(freshTables) && freshTables.length > 0) {
            setTables(freshTables);
          }
        }).catch(() => { });
      }
      // لا نُعيد جلب قاعدة البيانات هنا لأن payload.tableCart تحتوي على الحالة الصحيحة بالفعل
      // (إعادة الجلب الفوري ستسبب race condition وتكتب فوق الحالة التي رسمناها للتو)

      // تحديث شاشة الكاشير فقط إذا كان الكاشير في وضع الصالة ونفس الطاولة بالضبط هي المفتوحة حالياً
      if (orderTypeRef.current === 'dine_in' && selectedTableRef.current && String(selectedTableRef.current.id) === String(tableIdKey)) {
        setCart((prev) => mergeItems(prev));
        setSelectedTable((prev) => prev ? { ...prev, status: 'occupied' } : null);
      }

      const qrRouteText = qrBarItems.length > 0 && qrShishaItems.length > 0
        ? 'تم إرساله للبار والشيشة'
        : (qrShishaItems.length > 0 ? 'تم إرساله لطابعة الشيشة' : 'تم إرساله للبار');
      showToast(`🔔 طلب جديد من ${payload.tableName || ('طاولة ' + (payload.tableNumber || ''))} (${hallFormatted}) — ${qrRouteText}`);
    });

    return unsubscribe;
  }, []); // Addendum 17: اشتراك واحد فقط عند التركيب — بيانات tables/categories/selectedTable تُقرأ عبر refs

  // مزامنة دورية حية لسلات الطاولات وحالتها من قاعدة البيانات كل 3 ثوانٍ
  // يضمن هذا ظهور أي طلب يرسله الويتر فوراً على شاشة الكاشير حتى لو كانت الشاشة مفتوحة
  useEffect(() => {
    let isMounted = true;
    const intervalId = setInterval(async () => {
      try {
        if (!api.getTableCarts) return;
        if (pollBusyRef.current) return;
        const seqAtStart = mutationSeqRef.current;
        const [dbCarts, tbls] = await Promise.all([
          api.getTableCarts(),
          api.listTables ? api.listTables() : Promise.resolve(null)
        ]);

        if (!isMounted) return;
        if (isSnapshotStale({ busy: pollBusyRef.current, seqAtStart, seqNow: mutationSeqRef.current })) return;

        if (Array.isArray(tbls) && tbls.length > 0) {
          setTables((prev) => {
            if (JSON.stringify(prev) !== JSON.stringify(tbls)) {
              return tbls;
            }
            return prev;
          });
        }

        if (dbCarts && typeof dbCarts === 'object') {
          // صفّر عداد الغياب لأي طاولة موجودة في الداتابيز (خارج updater — آمن)
          for (const tId of Object.keys(dbCarts)) {
            delete missCountRef.current[tId];
            delete missCountRef.current[String(tId)];
          }

          // جمع بيانات الطاولة المفتوحة قبل الدخول للـ updater لتجنّب side effects داخله
          let openTableUpdate = null;

          setTableCartsMap((prev) => {
            let hasChange = false;
            const next = { ...prev };

            // 1. مسح أي طاولات تم تحصيلها أو إغلاقها ولم تعد موجودة في قاعدة البيانات
            for (const tId of Object.keys(next)) {
              // إذا كانت الطاولة محظورة النقل أو التحصيل: امسحها فوراً دون انتظار عداد الغياب
              if (transferBlockedTablesRef.current.has(tId) || transferBlockedTablesRef.current.has(String(tId)) || transferBlockedTablesRef.current.has(Number(tId))) {
                delete missCountRef.current[tId];
                delete next[tId];
                hasChange = true;
                continue;
              }
              // تجاهل الطاولة المفتوحة دائمًا في المسح لو كان الكاشير في وضع الصالة
              if (orderType === 'dine_in' && selectedTable && String(selectedTable.id) === String(tId)) {
                continue;
              }
              // البند 5ج: لا تمسح طاولة عندها تغييرات معلقة لم تُحفظ بعد
              if (pendingChangedTablesRef.current.has(tId) || pendingChangedTablesRef.current.has(String(tId)) || pendingChangedTablesRef.current.has(Number(tId))) {
                continue;
              }
              // لا تمسح طاولة يجري حفظها الآن (in-flight)
              if (inFlightTablesRef.current.has(tId) || inFlightTablesRef.current.has(String(tId))) {
                continue;
              }
              if (!dbCarts[tId] && !dbCarts[String(tId)] && !dbCarts[Number(tId)]) {
                const curMiss = (missCountRef.current[tId] || 0) + 1;
                missCountRef.current[tId] = curMiss;
                if (curMiss < 2) continue; // تأكيد غياب لمرتين متتاليتين (6 ثوانٍ) لمنع أي تذبذب شبكي
                delete missCountRef.current[tId];
                delete next[tId];
                hasChange = true;
              }
            }

            // 2. تحديث السلات الموجودة في قاعدة البيانات
            for (const [tId, cData] of Object.entries(dbCarts)) {
              // لا تحدّث طاولة محظورة النقل
              if (transferBlockedTablesRef.current.has(tId) || transferBlockedTablesRef.current.has(String(tId)) || transferBlockedTablesRef.current.has(Number(tId))) {
                continue;
              }
              // البند 5ج: لا تكتب فوق تغييرات معلقة لم تُحفظ بعد
              if (pendingChangedTablesRef.current.has(tId) || pendingChangedTablesRef.current.has(String(tId)) || pendingChangedTablesRef.current.has(Number(tId))) {
                continue;
              }
              // لا تكتب فوق طاولة يجري حفظها الآن (in-flight)
              if (inFlightTablesRef.current.has(tId) || inFlightTablesRef.current.has(String(tId))) {
                continue;
              }
              // للطاولة المفتوحة: حدّث فقط لو كان الكاشير في وضع الصالة ولو rev أكبر ومفيش تغيير معلّق
              if (orderType === 'dine_in' && selectedTable && String(selectedTable.id) === String(tId)) {
                const localRev = Number(prev[tId]?._rev) || 0;
                const dbRev = Number(cData._rev) || 0;
                if (dbRev > localRev) {
                  next[tId] = cData;
                  hasChange = true;
                  // احفظ للتحديث بعد الـ updater (لا setState داخل setState)
                  openTableUpdate = cData;
                }
                continue;
              }
              if (JSON.stringify(prev[tId]) !== JSON.stringify(cData)) {
                next[tId] = cData;
                hasChange = true;
              }
            }
            if (hasChange) {
              prevTableCartsRef.current = next;
              return next;
            }
            return prev;
          });

          // تطبيق تحديث الطاولة المفتوحة خارج الـ updater (آمن في React) - فقط إذا كان الكاشير في وضع الصالة
          if (openTableUpdate && orderType === 'dine_in') {
            setCart(openTableUpdate.cart || []);
            setCustomerName(openTableUpdate.customerName || '');
            setDiscountAmount(openTableUpdate.discountAmount || 0);
            setOrderNotes(openTableUpdate.orderNotes || '');
          }
        }
      } catch (_) { }
    }, 2000);

    return () => {
      isMounted = false;
      clearInterval(intervalId);
    };
  }, [selectedTable, cart]);

  useEffect(() => {
    if (currentUser && (currentUser.must_change_password === 1 || currentUser.must_change_password === true)) {
      setForcePasswordModal(true);
    }
    if (!currentUser) {
      if (api.listUsers) {
        api.listUsers().then((uList) => {
          if (Array.isArray(uList)) setUsersList(uList);
        }).catch(console.error);
      }
      if (api.getSettings) {
        api.getSettings().then((setts) => {
          if (setts && !setts.error) setSettings(setts);
        }).catch(console.error);
      }
    }
  }, [currentUser]);

  useEffect(() => {
    if (activeTab === 'reports') {
      loadUsersAndAttendance();
      loadDashboard();
      loadAllShifts();
      handleGenerateReport(reportsTab || 'sales');
    }
    if (activeTab === 'orders') loadOrders();
    if (activeTab === 'users') loadUsersAndAttendance();
  }, [activeTab, shift?.id, currentUser?.id]);

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  }

  // Filtered Products
  const visibleProducts = useMemo(() => {
    return products.filter((p) => {
      const matchCat = !activeCategory || p.category_id === activeCategory;
      const matchSearch = !searchQuery || p.name.toLowerCase().includes(searchQuery.toLowerCase());
      return matchCat && matchSearch;
    });
  }, [products, activeCategory, searchQuery]);

  // Filtered Products for Menu & Stock Tab
  const filteredMenuProducts = useMemo(() => {
    return products.filter((p) => {
      if (menuActiveCategoryFilter !== 'all' && String(p.category_id) !== String(menuActiveCategoryFilter)) {
        return false;
      }
      if (menuLowStockOnly && p.stock_qty > p.low_stock_threshold) {
        return false;
      }
      if (menuSearchQuery.trim()) {
        const q = menuSearchQuery.toLowerCase();
        const matchesName = (p.name || '').toLowerCase().includes(q);
        const matchesCat = (p.category_name || '').toLowerCase().includes(q);
        const matchesPrice = String(p.price || '').includes(q);
        if (!matchesName && !matchesCat && !matchesPrice) return false;
      }
      return true;
    });
  }, [products, menuActiveCategoryFilter, menuLowStockOnly, menuSearchQuery]);

  // Hall & Tables helpers
  const indoorTables = useMemo(() => tables.filter((t) => isSameHall(t.hall, 'indoor') || isSameHall(t.hall, 'أرضي')), [tables]);
  const outdoorTables = useMemo(() => tables.filter((t) => isSameHall(t.hall, 'outdoor') || isSameHall(t.hall, 'علوي')), [tables]);

  const filteredTables = useMemo(() => {
    if (!activeHall || activeHall === 'all') return tables;
    if (activeHall === 'indoor') return indoorTables;
    if (activeHall === 'outdoor') return outdoorTables;
    return tables.filter((t) => isSameHall(t.hall, activeHall));
  }, [tables, activeHall, indoorTables, outdoorTables]);


  // Cart Calculations
  const cartSubtotal = useMemo(() => {
    const totalCents = cart.reduce((sum, it) => sum + Math.round(toCents(it.price) * (Number(it.qty) || 0)), 0);
    return fromCents(totalCents);
  }, [cart]);

  const cartTotal = useMemo(() => {
    return Math.max(0, subMoney(cartSubtotal, discountAmount));
  }, [cartSubtotal, discountAmount]);

  const changeDue = useMemo(() => {
    const paid = Number(paidAmount) || 0;
    return paid > cartTotal ? subMoney(paid, cartTotal) : 0;
  }, [paidAmount, cartTotal]);

  // Cart Actions
  function addToCart(product) {
    if (vendorDevFeatures.require_check_print_before_checkout && orderType === 'dine_in' && selectedTable && tableCartsMap[selectedTable.id]?.printedCheck) {
      handleRequestAdminAuth({
        type: 'edit_after_check_printed',
        table: selectedTable,
        actionName: `إضافة "${product.name}"`
      });
      return;
    }

    // إذا كان الكاشير يفتح طلباً جديداً على طاولة تم تحصيلها/نقلها للتو، أزل الحظر المؤقت فوراً حتى لا يمسحها الـ poll
    if (orderType === 'dine_in' && selectedTable) {
      transferBlockedTablesRef.current.delete(selectedTable.id);
      transferBlockedTablesRef.current.delete(String(selectedTable.id));
      transferBlockedTablesRef.current.delete(Number(selectedTable.id));
    }

    // السماح بإضافة الصنف وإصدار الفاتورة حتى لو المخزون خلصان وتتسجل بالسالب بناءً على طلب المستخدم
    setCart((prev) => {
      const existing = prev.find((it) => it.id === product.id);
      let newCart;
      if (existing) {
        newCart = prev.map((it) => (it.id === product.id ? { ...it, qty: it.qty + 1 } : it));
      } else {
        newCart = [...prev, { id: product.id, name: product.name, price: product.price, qty: 1, sent_qty: 0, notes: '' }];
      }
      if (orderType === 'dine_in' && selectedTable) {
        setTableCartsMap((tm) => ({
          ...tm,
          [selectedTable.id]: {
            ...(tm[selectedTable.id] || {}),
            cart: newCart,
            customerName,
            discountAmount,
            orderNotes
          }
        }));
      } else if (orderType === 'takeaway' && activeTakeawayId) {
        setTakeawayTabs((prev) => {
          const next = prev.map((t) => (t.id === activeTakeawayId ? {
            ...t,
            cart: newCart,
            customerName,
            customerPhone,
            customerAddress,
            discountAmount,
            orderNotes
          } : t));
          try { localStorage.setItem('cafepos_takeaway_tabs', JSON.stringify(next)); } catch (_) { }
          return next;
        });
      }
      return newCart;
    });

    // تنبيه المخزون عند الطلب (إذا كانت الخاصية مفعّلة من إعدادات المطور)
    if (vendorDevFeatures.show_stock_alert_on_order) {
      const prod = products.find(p => p.id === product.id);
      if (prod) {
        const currentStock = Number(prod.stock_qty);
        const threshold = Number(prod.low_stock_threshold || 10);
        if (!isNaN(currentStock) && currentStock <= threshold) {
          showToast(`⚠️ تنبيه مخزون: "${prod.name}" - الرصيد المتبقي (${currentStock}) أقل من أو يساوي حد التنبيه (${threshold})`);
        }
      }
    }
  }

  function handleRequestAdminAuth(config) {
    setAdminAuthModal(config);
    setAdminAuthPassword('');
    setAdminAuthError('');
    setAdminAuthTargetQty(
      typeof config.targetQty === 'number'
        ? config.targetQty
        : config.item
          ? Math.max(0, config.item.qty - 1)
          : 0
    );
    setAdminAuthPrintVoid(true);
    setAdminAuthReason('');
  }

  async function handleConfirmAdminAuth(e) {
    if (e) e.preventDefault();
    if (!adminAuthModal) return;

    if (!adminAuthPassword || !adminAuthPassword.trim()) {
      setAdminAuthError('يرجى إدخال كلمة مرور الأدمن للموافقة');
      return;
    }

    const { type, item, table, cart: authCart } = adminAuthModal;
    const targetQty = adminAuthTargetQty;
    const tblRef = table || selectedTable;
    const tblLabel = tblRef ? (tblRef.name || `طاولة ${tblRef.number || ''}`) : (orderType === 'delivery' ? 'دليفري' : 'تيك أواي');
    const hallLabel = tblRef ? (tblRef.hall === 'indoor' ? 'صالة داخلية' : (tblRef.hall === 'outdoor' ? 'صالة خارجية' : (tblRef.hall || ''))) : '';

    let voidAudit = null;
    if (type === 'clear_cart') {
      const totalCartVal = (cart || []).reduce((s, it) => s + ((Number(it.price) || 0) * (Number(it.qty) || 1)), 0);
      const totalCartQty = (cart || []).reduce((s, it) => s + (Number(it.qty) || 1), 0);
      const itemNamesSummary = (cart || []).map((it) => `${it.name} (×${it.qty})`).join('، ');
      voidAudit = {
        action: 'clear_cart_void',
        itemName: itemNamesSummary || 'تفريغ كامل السلة',
        oldQty: totalCartQty,
        newQty: 0,
        cancelledQty: totalCartQty || 1,
        unitPrice: totalCartQty > 0 ? Math.round((totalCartVal / totalCartQty) * 100) / 100 : totalCartVal,
        tableName: tblLabel,
        hall: hallLabel,
        reason: adminAuthReason.trim() || 'تفريغ السلة بموافقة الإدارة',
        actorName: currentUser?.name || currentUser?.username || 'كاشير'
      };
    } else if (item && (type === 'delete_item' || type === 'reduce_item' || targetQty <= 0)) {
      const cancelledQty = Math.max(1, (Number(item.qty) || 1) - (type === 'delete_item' ? 0 : Math.max(0, Number(targetQty) || 0)));
      voidAudit = {
        action: (type === 'delete_item' || targetQty <= 0) ? 'void_item' : 'reduce_item_void',
        itemName: item.name || item.product_name || 'صنف',
        oldQty: Number(item.qty) || 1,
        newQty: type === 'delete_item' ? 0 : Math.max(0, Number(targetQty) || 0),
        cancelledQty,
        unitPrice: Number(item.price || item.unit_price) || 0,
        tableName: tblLabel,
        hall: hallLabel,
        reason: adminAuthReason.trim() || ((type === 'delete_item' || targetQty <= 0) ? 'إلغاء صنف بموافقة الإدارة' : 'تخفيض كمية بموافقة الإدارة'),
        actorName: currentUser?.name || currentUser?.username || 'كاشير'
      };
    }

    try {
      const res = await api.verifyAdminPassword(voidAudit ? { password: adminAuthPassword, voidAudit } : adminAuthPassword);
      if (!res || !res.success) {
        setAdminAuthError(res?.error || 'كلمة مرور الأدمن غير صحيحة!');
        return;
      }

      if (type === 'edit_after_check_printed') {
        const tbl = table || selectedTable;
        if (tbl) {
          setTableCartsMap((prev) => {
            const next = { ...prev };
            if (next[tbl.id]) {
              next[tbl.id] = { ...next[tbl.id], printedCheck: false, printedCheckTime: null };
            }
            try { localStorage.setItem('cafepos_table_carts', JSON.stringify(next)); } catch (_) { }
            return next;
          });
          if (api.saveTableCart) {
            const currentData = tableCartsMap[tbl.id] || {};
            api.saveTableCart(tbl.id, { ...currentData, printedCheck: false, printedCheckTime: null }).catch(console.error);
          }
        }
        showToast('🔓 تم فك قفل الطاولة بنجاح بعد موافقة الإدارة. يمكنك الآن تعديل الطلب.');
      } else if (type === 'reprint_prebill_check') {
        const tbl = table || selectedTable;
        const currentCartItems = authCart || (tbl ? tableCartsMap[tbl.id]?.cart : cart);
        handlePrintPreBillCheck(tbl, currentCartItems, true);
        showToast('🖨️ تمت إعادة طباعة الشيك بعد موافقة الإدارة');
      } else if (type === 'clear_cart') {
        clearCart(true);
        showToast('🗑️ تم إفراغ السلة بنجاح بعد موافقة الإدارة');
      } else if (type === 'delete_item' || targetQty <= 0) {
        if (item) {
          forceRemoveFromCart(item.id);
          showToast(`🗑️ تم حذف صنف "${item.name}" بعد موافقة الإدارة`);
        }
      } else if (type === 'reduce_item') {
        if (item) {
          forceUpdateQty(item.id, targetQty);
          showToast(`✅ تم تعديل كمية "${item.name}" إلى (${targetQty}) بعد موافقة الإدارة`);
        }
      }

      if (type === 'transfer_table_order_with_sent') {
        setAdminAuthModal(null);
        setAdminAuthPassword('');
        setAdminAuthError('');
        handleTransferTableOrder(true);
        return;
      }

      // Print void / modification slip for bar if requested
      if (adminAuthPrintVoid && (item || type === 'clear_cart')) {
        const cancelledQty = item ? (item.qty - targetQty) : 'كافة الأصناف';
        const voidTicket = {
          id: Date.now().toString().slice(-4),
          tableName: selectedTable ? selectedTable.name : 'تيك أواي',
          hall: selectedTable ? (selectedTable.hall === 'indoor' ? 'صالة داخلية' : (selectedTable.hall === 'outdoor' ? 'صالة خارجية' : (selectedTable.hall || 'صالة داخلية'))) : 'تيك أواي',
          time: formatShiftTime(new Date()),
          cashierName: currentUser?.name || 'كاشير',
          actionType: type === 'clear_cart' ? 'إلغاء الطلب كاملاً' : (targetQty <= 0 ? 'إلغاء الصنف كاملاً' : 'تخفيض كمية الصنف'),
          itemName: item ? item.name : 'إلغاء كافة محتويات السلة',
          oldQty: item ? item.qty : 0,
          newQty: targetQty,
          cancelledQty: cancelledQty
        };
        setBarVoidTicket(voidTicket);
        setTimeout(() => {
          printBarVoidTicket(voidTicket);
        }, 150);
      }

      setAdminAuthModal(null);
      setAdminAuthPassword('');
      setAdminAuthError('');
    } catch (err) {
      console.error(err);
      setAdminAuthError('حدث خطأ أثناء التحقق من كلمة المرور');
    }
  }

  function forceUpdateQty(id, newQty) {
    if (newQty <= 0) {
      forceRemoveFromCart(id);
      return;
    }
    setCart((prev) => {
      const newCart = prev
        .map((it) => {
          if (it.id === id) {
            return {
              ...it,
              qty: newQty,
              sent_qty: Math.min(Number(it.sent_qty) || 0, newQty)
            };
          }
          return it;
        })
        .filter((it) => it.qty > 0);

      if (orderType === 'dine_in' && selectedTable) {
        setTableCartsMap((tm) => {
          if (newCart.length === 0) {
            const next = { ...tm };
            delete next[selectedTable.id];
            return next;
          }
          return {
            ...tm,
            [selectedTable.id]: {
              ...(tm[selectedTable.id] || {}),
              cart: newCart,
              customerName,
              discountAmount,
              orderNotes
            }
          };
        });
      } else if (orderType === 'takeaway' && activeTakeawayId) {
        setTakeawayTabs((prev) => {
          const next = prev.map((t) => (t.id === activeTakeawayId ? {
            ...t,
            cart: newCart,
            customerName,
            customerPhone,
            customerAddress,
            discountAmount,
            orderNotes
          } : t));
          try { localStorage.setItem('cafepos_takeaway_tabs', JSON.stringify(next)); } catch (_) { }
          return next;
        });
      }
      return newCart;
    });
  }

  function forceRemoveFromCart(id) {
    setCart((prev) => {
      const newCart = prev.filter((it) => it.id !== id);
      if (orderType === 'dine_in' && selectedTable) {
        setTableCartsMap((tm) => {
          if (newCart.length === 0) {
            const next = { ...tm };
            delete next[selectedTable.id];
            return next;
          }
          return {
            ...tm,
            [selectedTable.id]: {
              ...(tm[selectedTable.id] || {}),
              cart: newCart,
              customerName,
              discountAmount,
              orderNotes
            }
          };
        });
      } else if (orderType === 'takeaway' && activeTakeawayId) {
        setTakeawayTabs((prev) => {
          const next = prev.map((t) => (t.id === activeTakeawayId ? {
            ...t,
            cart: newCart,
            customerName,
            customerPhone,
            customerAddress,
            discountAmount,
            orderNotes
          } : t));
          try { localStorage.setItem('cafepos_takeaway_tabs', JSON.stringify(next)); } catch (_) { }
          return next;
        });
      }
      return newCart;
    });
  }

  function updateQty(id, delta) {
    if (vendorDevFeatures.require_check_print_before_checkout && orderType === 'dine_in' && selectedTable && tableCartsMap[selectedTable.id]?.printedCheck) {
      handleRequestAdminAuth({
        type: 'edit_after_check_printed',
        table: selectedTable,
        actionName: 'تعديل كمية الصنف'
      });
      return;
    }

    const allowNegative = settings.allow_negative_stock === '1';
    const prod = products.find((p) => p.id === id);
    const itemInCart = cart.find((it) => it.id === id);

    // Anti-Waste Bar Lock: Cannot reduce quantity below what was already sent to the bar without Admin approval!
    if (delta < 0 && itemInCart) {
      const sentQty = Number(itemInCart.sent_qty) || 0;
      if (itemInCart.qty + delta < sentQty) {
        handleRequestAdminAuth({
          type: 'reduce_item',
          item: itemInCart,
          targetQty: Math.max(0, itemInCart.qty + delta)
        });
        return;
      }
    }

    if (!allowNegative && delta > 0 && prod) {
      const currentInCart = itemInCart?.qty || 0;
      if (currentInCart + delta > prod.stock_qty) {
        showToast(`⚠️ الكمية لا يمكن أن تتجاوز الرصيد المتبقي في المخزون (${prod.stock_qty})`);
        return;
      }
    }

    setCart((prev) => {
      const newCart = prev
        .map((it) => (it.id === id ? { ...it, qty: it.qty + delta } : it))
        .filter((it) => it.qty > 0);
      if (orderType === 'dine_in' && selectedTable) {
        setTableCartsMap((tm) => {
          if (newCart.length === 0 && !tm[selectedTable.id]?.printedCheck) {
            const next = { ...tm };
            delete next[selectedTable.id];
            return next;
          }
          return {
            ...tm,
            [selectedTable.id]: {
              ...(tm[selectedTable.id] || {}),
              cart: newCart,
              customerName,
              discountAmount,
              orderNotes
            }
          };
        });
      } else if (orderType === 'takeaway' && activeTakeawayId) {
        setTakeawayTabs((prev) => {
          const next = prev.map((t) => (t.id === activeTakeawayId ? {
            ...t,
            cart: newCart,
            customerName,
            customerPhone,
            customerAddress,
            discountAmount,
            orderNotes
          } : t));
          try { localStorage.setItem('cafepos_takeaway_tabs', JSON.stringify(next)); } catch (_) { }
          return next;
        });
      }
      return newCart;
    });
  }

  function removeFromCart(id) {
    if (vendorDevFeatures.require_check_print_before_checkout && orderType === 'dine_in' && selectedTable && tableCartsMap[selectedTable.id]?.printedCheck) {
      handleRequestAdminAuth({
        type: 'edit_after_check_printed',
        table: selectedTable,
        actionName: 'حذف صنف'
      });
      return;
    }

    const itemInCart = cart.find((it) => it.id === id);
    if (itemInCart && Number(itemInCart.sent_qty) > 0) {
      handleRequestAdminAuth({
        type: 'delete_item',
        item: itemInCart,
        targetQty: 0
      });
      return;
    }

    setCart((prev) => {
      const newCart = prev.filter((it) => it.id !== id);
      if (orderType === 'dine_in' && selectedTable) {
        const targetTblId = selectedTable.id;
        if (newCart.length === 0) {
          if (api.saveTableCart) {
            api.saveTableCart(targetTblId, null).catch(console.error);
          }
          setTableCartsMap((tm) => {
            const next = { ...tm };
            delete next[targetTblId];
            delete next[String(targetTblId)];
            return next;
          });
          if (prevTableCartsRef.current) {
            delete prevTableCartsRef.current[targetTblId];
            delete prevTableCartsRef.current[String(targetTblId)];
          }
          pendingChangedTablesRef.current.delete(targetTblId);
          pendingChangedTablesRef.current.delete(String(targetTblId));
        } else {
          setTableCartsMap((tm) => ({
            ...tm,
            [targetTblId]: {
              ...(tm[targetTblId] || {}),
              cart: newCart,
              customerName,
              discountAmount,
              orderNotes
            }
          }));
        }
      } else if (orderType === 'takeaway' && activeTakeawayId) {
        setTakeawayTabs((prev) => {
          const next = prev.map((t) => (t.id === activeTakeawayId ? {
            ...t,
            cart: newCart,
            customerName,
            customerPhone,
            customerAddress,
            discountAmount,
            orderNotes
          } : t));
          try { localStorage.setItem('cafepos_takeaway_tabs', JSON.stringify(next)); } catch (_) { }
          return next;
        });
      }
      return newCart;
    });
  }

  function clearCart(force = false, preserveTable = false) {
    if (!force) {
      if (vendorDevFeatures.require_check_print_before_checkout && orderType === 'dine_in' && selectedTable && tableCartsMap[selectedTable.id]?.printedCheck) {
        handleRequestAdminAuth({
          type: 'edit_after_check_printed',
          table: selectedTable,
          actionName: 'إفراغ السلة'
        });
        return;
      }
      const hasSentToBar = cart.some((it) => (Number(it.sent_qty) || 0) > 0);
      if (hasSentToBar) {
        handleRequestAdminAuth({
          type: 'clear_cart'
        });
        return;
      }
    }
    if (orderType === 'dine_in' && selectedTable) {
      const targetTblId = selectedTable.id;
      if (api.saveTableCart) {
        api.saveTableCart(targetTblId, null).catch(console.error);
      }
      setTableCartsMap((prev) => {
        const next = { ...prev };
        delete next[targetTblId];
        delete next[String(targetTblId)];
        return next;
      });
      if (prevTableCartsRef.current) {
        delete prevTableCartsRef.current[targetTblId];
        delete prevTableCartsRef.current[String(targetTblId)];
      }
      pendingChangedTablesRef.current.delete(targetTblId);
      pendingChangedTablesRef.current.delete(String(targetTblId));
    }
    if (orderType === 'takeaway') {
      setTakeawayTabs((prev) => {
        const next = prev.map((t) => t.id === activeTakeawayId ? {
          ...t,
          cart: [],
          customerName: '',
          customerPhone: '',
          customerAddress: '',
          discountAmount: 0,
          orderNotes: '',
          isHeld: false
        } : t);
        try { localStorage.setItem('cafepos_takeaway_tabs', JSON.stringify(next)); } catch (_) { }
        return next;
      });
    }
    setCart([]);
    setDiscountAmount(0);
    setPaidAmount('');
    setSplitCash('');
    setSplitWallet('');
    setSplitCard('');
    setCustomerName('');
    setCustomerPhone('');
    setCustomerAddress('');
    if (!preserveTable) setSelectedTable(null);
    setOrderNotes('');
    setShowCustomerSuggestions(false);
  }

  // Multi-Takeaway Sessions & Hold Handlers
  function switchTakeawayTab(targetTabId) {
    if (targetTabId === activeTakeawayId) return;
    isSwitchingTabRef.current = true;
    const updated = takeawayTabs.map((t) => {
      if (t.id === activeTakeawayId) {
        return {
          ...t,
          cart: [...cart],
          customerName,
          customerPhone,
          customerAddress,
          discountAmount,
          orderNotes
        };
      }
      return t;
    });
    const target = updated.find((t) => t.id === targetTabId);
    if (!target) {
      isSwitchingTabRef.current = false;
      return;
    }
    setTakeawayTabs(updated);
    setActiveTakeawayId(targetTabId);
    setCart(target.cart || []);
    setCustomerName(target.customerName || '');
    setCustomerPhone(target.customerPhone || '');
    setCustomerAddress(target.customerAddress || '');
    setDiscountAmount(target.discountAmount || 0);
    setOrderNotes(target.orderNotes || '');
    setPaidAmount('');
    setShowCustomerSuggestions(false);
    try {
      localStorage.setItem('cafepos_takeaway_tabs', JSON.stringify(updated));
      localStorage.setItem('cafepos_active_takeaway_id', targetTabId);
    } catch (_) { }
    setTimeout(() => {
      isSwitchingTabRef.current = false;
    }, 50);
  }

  function createNewTakeawayTab() {
    isSwitchingTabRef.current = true;
    const updated = takeawayTabs.map((t) => {
      if (t.id === activeTakeawayId) {
        return {
          ...t,
          cart: [...cart],
          customerName,
          customerPhone,
          customerAddress,
          discountAmount,
          orderNotes
        };
      }
      return t;
    });
    const newIndex = updated.length + 1;
    const newId = `tab_takeaway_${Date.now()}`;
    const newTab = {
      id: newId,
      name: `طلب ${newIndex}`,
      cart: [],
      customerName: '',
      customerPhone: '',
      customerAddress: '',
      discountAmount: 0,
      orderNotes: '',
      isHeld: false
    };
    updated.push(newTab);
    setTakeawayTabs(updated);
    setActiveTakeawayId(newId);
    setCart([]);
    setCustomerName('');
    setCustomerPhone('');
    setCustomerAddress('');
    setDiscountAmount(0);
    setOrderNotes('');
    setPaidAmount('');
    setShowCustomerSuggestions(false);
    try {
      localStorage.setItem('cafepos_takeaway_tabs', JSON.stringify(updated));
      localStorage.setItem('cafepos_active_takeaway_id', newId);
    } catch (_) { }
    showToast(`➕ تم فتح طلب تيك أواي جديد (${newTab.name})`);
    setTimeout(() => {
      isSwitchingTabRef.current = false;
    }, 50);
  }

  function closeTakeawayTab(tabIdToClose) {
    const targetToClose = takeawayTabs.find((t) => t.id === tabIdToClose);
    const hasItems = targetToClose && Array.isArray(targetToClose.cart) && targetToClose.cart.length > 0;
    if (hasItems) {
      const confirmDelete = window.confirm(`هل أنت متأكد من إلغاء هذا الطلب (${targetToClose.customerName?.trim() || targetToClose.name})؟ يحتوي على ${targetToClose.cart.length} أصناف.`);
      if (!confirmDelete) return;
    }

    isSwitchingTabRef.current = true;
    if (takeawayTabs.length <= 1) {
      const resetTab = {
        id: 'tab_takeaway_1',
        name: 'طلب 1',
        cart: [],
        customerName: '',
        customerPhone: '',
        customerAddress: '',
        discountAmount: 0,
        orderNotes: '',
        isHeld: false
      };
      setTakeawayTabs([resetTab]);
      setActiveTakeawayId('tab_takeaway_1');
      setCart([]);
      setCustomerName('');
      setCustomerPhone('');
      setCustomerAddress('');
      setDiscountAmount(0);
      setOrderNotes('');
      setPaidAmount('');
      setShowCustomerSuggestions(false);
      try {
        localStorage.setItem('cafepos_takeaway_tabs', JSON.stringify([resetTab]));
        localStorage.setItem('cafepos_active_takeaway_id', 'tab_takeaway_1');
      } catch (_) { }
      setTimeout(() => {
        isSwitchingTabRef.current = false;
      }, 50);
      return;
    }
    const filtered = takeawayTabs.filter((t) => t.id !== tabIdToClose);
    setTakeawayTabs(filtered);
    if (activeTakeawayId === tabIdToClose) {
      const nextActive = filtered[0];
      setActiveTakeawayId(nextActive.id);
      setCart(nextActive.cart || []);
      setCustomerName(nextActive.customerName || '');
      setCustomerPhone(nextActive.customerPhone || '');
      setCustomerAddress(nextActive.customerAddress || '');
      setDiscountAmount(nextActive.discountAmount || 0);
      setOrderNotes(nextActive.orderNotes || '');
      setPaidAmount('');
      setShowCustomerSuggestions(false);
      try {
        localStorage.setItem('cafepos_takeaway_tabs', JSON.stringify(filtered));
        localStorage.setItem('cafepos_active_takeaway_id', nextActive.id);
      } catch (_) { }
    } else {
      try {
        localStorage.setItem('cafepos_takeaway_tabs', JSON.stringify(filtered));
      } catch (_) { }
    }
    setTimeout(() => {
      isSwitchingTabRef.current = false;
    }, 50);
  }

  function toggleHoldTakeawayTab(tabId) {
    setTakeawayTabs((prev) => {
      const next = prev.map((t) => {
        if (t.id === tabId) {
          const newHeld = !t.isHeld;
          if (newHeld) {
            showToast(`⏳ تم تعليق الطلب (${t.customerName?.trim() || t.name})`);
          } else {
            showToast(`▶️ تم استئناف الطلب (${t.customerName?.trim() || t.name})`);
          }
          return {
            ...t,
            cart: t.id === activeTakeawayId ? [...cart] : (t.cart || []),
            customerName: t.id === activeTakeawayId ? customerName : (t.customerName || ''),
            customerPhone: t.id === activeTakeawayId ? customerPhone : (t.customerPhone || ''),
            customerAddress: t.id === activeTakeawayId ? customerAddress : (t.customerAddress || ''),
            discountAmount: t.id === activeTakeawayId ? discountAmount : (t.discountAmount || 0),
            orderNotes: t.id === activeTakeawayId ? orderNotes : (t.orderNotes || ''),
            isHeld: newHeld
          };
        }
        return t;
      });
      try {
        localStorage.setItem('cafepos_takeaway_tabs', JSON.stringify(next));
      } catch (_) { }
      return next;
    });
  }

  function handleCustomerPhoneChange(val) {
    setCustomerPhone(val);
    const clean = String(val || '').trim();
    if (clean.length >= 2) {
      if (searchCustomerTimeoutRef.current) clearTimeout(searchCustomerTimeoutRef.current);
      searchCustomerTimeoutRef.current = setTimeout(async () => {
        try {
          if (api.searchCustomers) {
            const results = await api.searchCustomers(clean);
            if (Array.isArray(results) && results.length > 0) {
              setCustomerSuggestions(results);
              setShowCustomerSuggestions(true);
              const exact = results.find((c) => c.phone && c.phone.trim() === clean);
              if (exact) {
                if (exact.name) setCustomerName(exact.name);
                if (exact.address) setCustomerAddress(exact.address);
                showToast(`👤 تم التعرف على العميل: ${exact.name || exact.phone}${exact.address ? ` (📍 ${exact.address})` : ''}`);
              }
            } else {
              setCustomerSuggestions([]);
              setShowCustomerSuggestions(false);
            }
          }
        } catch (e) {
          console.error('Customer search error:', e);
        }
      }, 250);
    } else {
      setCustomerSuggestions([]);
      setShowCustomerSuggestions(false);
    }
  }

  function handleCustomerAddressChange(val) {
    setCustomerAddress(val);
    const cleanAddr = String(val || '').trim();
    const cleanPhone = String(customerPhone || '').trim();
    if (cleanPhone.length >= 3 && cleanAddr.length >= 2 && api.saveCustomerDetails) {
      if (saveCustomerAddrTimeoutRef.current) clearTimeout(saveCustomerAddrTimeoutRef.current);
      saveCustomerAddrTimeoutRef.current = setTimeout(async () => {
        try {
          await api.saveCustomerDetails({ phone: cleanPhone, name: customerName, address: cleanAddr });
        } catch (_) { }
      }, 400);
    }
  }

  function selectCustomerSuggestion(cust) {
    if (!cust) return;
    setCustomerName(cust.name || '');
    setCustomerPhone(cust.phone || '');
    setCustomerAddress(cust.address || '');
    setShowCustomerSuggestions(false);
    showToast(`👤 تم اختيار العميل: ${cust.name || cust.phone}${cust.address ? ` (📍 ${cust.address})` : ''}`);
  }

  // Switch / Select Table with automatic saving and loading
  function switchTable(newTable) {
    // 0. Synchronously save takeaway tab if moving away from takeaway
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
        try { localStorage.setItem('cafepos_takeaway_tabs', JSON.stringify(next)); } catch (_) { }
        return next;
      });
    }

    // Deselecting table (newTable is null)
    if (!newTable) {
      if (orderType === 'dine_in' && selectedTable) {
        const isOutgoingBlocked = transferBlockedTablesRef.current.has(selectedTable.id);
        if (!isOutgoingBlocked && ((cart && cart.length > 0) || (customerName && customerName.trim()))) {
          const updatedTable = {
            ...(tableCartsMap[selectedTable.id] || {}),
            cart: [...cart],
            customerName: customerName.trim(),
            discountAmount,
            orderNotes
          };
          setTableCartsMap((prev) => ({ ...prev, [selectedTable.id]: updatedTable }));
          if (api.saveTableCart) api.saveTableCart(selectedTable.id, updatedTable).catch(console.error);
        }
      }
      setSelectedTable(null);
      if (orderType === 'dine_in') {
        setCart([]);
        setCustomerName('');
        setCustomerPhone('');
        setCustomerAddress('');
        setDiscountAmount(0);
        setOrderNotes('');
        setPaidAmount('');
      }
      return;
    }

    // 1. If clicking on the exact same table that is already active, stay on it and do NOT reset cart!
    if (orderType === 'dine_in' && selectedTable && Number(selectedTable.id) === Number(newTable.id)) {
      return;
    }

    // فحص: هل كان الكاشير قد أضاف أصنافاً للسلة في شاشة البيع قبل أن يختار الطاولة؟
    // صمام أمان حاسم: لا يتم تفعيل هذا الفحص إطلاقاً إلا إذا كان نوع الطلب صالة حصراً وكان المستخدم يقف في شاشة البيع بدون طاولة
    const hadStrayCart = orderType === 'dine_in' && !selectedTable && cart && cart.length > 0 && activeTab === 'pos';
    const strayCartItems = hadStrayCart ? [...cart] : [];
    const strayCustName = customerName;
    const strayDiscount = discountAmount;
    const strayNotes = orderNotes;

    // 2. Synchronously calculate updated cart map for current selected table
    let nextMap = { ...tableCartsMap };
    if (orderType === 'dine_in' && selectedTable) {
      const isOutgoingBlocked = transferBlockedTablesRef.current.has(selectedTable.id) ||
        transferBlockedTablesRef.current.has(String(selectedTable.id)) ||
        transferBlockedTablesRef.current.has(Number(selectedTable.id));

      if (!isOutgoingBlocked && ((cart && cart.length > 0) || (customerName && customerName.trim()))) {
        nextMap[selectedTable.id] = {
          ...(nextMap[selectedTable.id] || {}),
          cart: [...cart],
          customerName: customerName.trim(),
          discountAmount,
          orderNotes
        };
        if (api.saveTableCart) {
          const outgoingTableId = selectedTable.id;
          mutationSeqRef.current += 1;
          api.saveTableCart(outgoingTableId, nextMap[outgoingTableId]).then((res) => {
            if (res && res.conflict && res.current) {
              const sc = res.current;
              mutationSeqRef.current += 1;
              setTableCartsMap((p) => ({ ...p, [outgoingTableId]: sc, [String(outgoingTableId)]: sc }));
              prevTableCartsRef.current = { ...prevTableCartsRef.current, [outgoingTableId]: sc, [String(outgoingTableId)]: sc };
              // فقط إذا كان المستخدم ما زال يقف على نفس الطاولة نقوم بتحديث السلة المعروضة
              if (selectedTableRef.current && Number(selectedTableRef.current.id) === Number(outgoingTableId)) {
                setCart(sc.cart || []);
                setCustomerName(sc.customerName || '');
              }
            } else if (res && res.success === false && !res.conflict) {
              showToast('❌ تعذر حفظ الطاولة عند الانتقال: ' + (res.error || ''));
              pendingChangedTablesRef.current.add(outgoingTableId);
            }
          }).catch(console.error);
        }
      } else {
        // حماية فائقة: لا تحذف مدخل الطاولة من nextMap إلا إذا كانت فارغة أو محظورة النقل/التحصيل
        const existingEntry = nextMap[selectedTable.id] || nextMap[String(selectedTable.id)] || nextMap[Number(selectedTable.id)];
        if (isOutgoingBlocked || !existingEntry || !existingEntry.cart || existingEntry.cart.length === 0) {
          delete nextMap[selectedTable.id];
          delete nextMap[String(selectedTable.id)];
          delete nextMap[Number(selectedTable.id)];
        }
      }
      try {
        localStorage.setItem('cafepos_table_carts', JSON.stringify(nextMap));
      } catch (_) { }
      setTableCartsMap(nextMap);
    }

    // 3. Set new selected table
    const incomingTableId = newTable?.id;
    setSelectedTable(newTable || null);

    // 4. Load new table's saved cart OR transfer/merge stray cart items onto it
    if (newTable) {
      setOrderType('dine_in');
      const saved = nextMap[newTable.id] || nextMap[String(newTable.id)] || nextMap[Number(newTable.id)];

      // إذا كان الكاشير قد أضاف أصنافاً قبل تحديد الطاولة، انقلها أو ادمجها مباشرة مع الطاولة المختارة
      if (hadStrayCart) {
        if (saved && saved.cart && saved.cart.length > 0) {
          // دمج الأصناف مع ما هو موجود بالفعل على الطاولة
          const mergedCart = [...saved.cart];
          for (const it of strayCartItems) {
            const exIdx = mergedCart.findIndex(m => m.id === it.id && (m.notes || '') === (it.notes || ''));
            if (exIdx >= 0) {
              mergedCart[exIdx] = { ...mergedCart[exIdx], qty: mergedCart[exIdx].qty + it.qty };
            } else {
              mergedCart.push({ ...it });
            }
          }
          const updatedTableData = {
            ...saved,
            cart: mergedCart,
            customerName: saved.customerName || strayCustName || '',
            discountAmount: (saved.discountAmount || 0) + (strayDiscount || 0),
            orderNotes: saved.orderNotes || strayNotes || ''
          };
          nextMap[newTable.id] = updatedTableData;
          setTableCartsMap((prev) => ({ ...prev, [newTable.id]: updatedTableData }));
          setCart(mergedCart);
          setCustomerName(updatedTableData.customerName);
          setDiscountAmount(updatedTableData.discountAmount);
          setOrderNotes(updatedTableData.orderNotes);
          if (api.saveTableCart) api.saveTableCart(newTable.id, updatedTableData).catch(console.error);
          showToast(`📍 ${newTable.name} - تم دمج الأصناف التي اخترتها مع طلب الطاولة بنجاح!`);
        } else {
          // الطاولة كانت فارغة: إسناد الأصناف المضافة مباشرة إلى هذه الطاولة وحفظها
          const assignedTableData = {
            cart: strayCartItems,
            customerName: strayCustName || '',
            discountAmount: strayDiscount || 0,
            orderNotes: strayNotes || ''
          };
          nextMap[newTable.id] = assignedTableData;
          setTableCartsMap((prev) => ({ ...prev, [newTable.id]: assignedTableData }));
          setCart(strayCartItems);
          setCustomerName(strayCustName || '');
          setDiscountAmount(strayDiscount || 0);
          setOrderNotes(strayNotes || '');
          if (api.saveTableCart) api.saveTableCart(newTable.id, assignedTableData).catch(console.error);
          showToast(`📍 ${newTable.name} - تم إسناد (${strayCartItems.length}) أصناف من السلة إلى الطاولة بنجاح!`);
        }
      } else if (!transferBlockedTablesRef.current.has(newTable.id) && !transferBlockedTablesRef.current.has(String(newTable.id)) && saved && ((saved.cart && saved.cart.length > 0) || (saved.customerName && saved.customerName.trim()))) {
        setCart(saved.cart || []);
        setCustomerName(saved.customerName || '');
        setDiscountAmount(saved.discountAmount || 0);
        setOrderNotes(saved.orderNotes || '');
        if (saved.cart && saved.cart.length > 0) {
          showToast(`📍 ${newTable.name} (${saved.cart.length} صنف محفوظ)${saved.customerName ? ` - 👤 ${saved.customerName}` : ''}`);
        } else {
          showToast(`📍 تم فتح ${newTable.name}${saved.customerName ? ` (العميل: ${saved.customerName})` : ''}`);
        }
      } else {
        // Fallback safety check: verify directly with SQLite/backend so no waiter order is ever lost
        if (api.getTableCarts && incomingTableId) {
          api.getTableCarts().then((allDbCarts) => {
            if (allDbCarts && typeof allDbCarts === 'object') {
              const dbEntry = allDbCarts[incomingTableId] || allDbCarts[String(incomingTableId)] || allDbCarts[Number(incomingTableId)];
              if (dbEntry && dbEntry.cart && Array.isArray(dbEntry.cart) && dbEntry.cart.length > 0) {
                // تحديث الخريطة دائمًا في الذاكرة
                setTableCartsMap((prev) => ({
                  ...prev,
                  [incomingTableId]: dbEntry
                }));
                // صمام أمان حاسم: لا تستبدل سلة الشاشة إلا لو كان الكاشير ما زال على هذه الطاولة تحديدًا!
                if (selectedTableRef.current && Number(selectedTableRef.current.id) === Number(incomingTableId)) {
                  setCart(dbEntry.cart || []);
                  setCustomerName(dbEntry.customerName || '');
                  setDiscountAmount(dbEntry.discountAmount || 0);
                  setOrderNotes(dbEntry.orderNotes || '');
                  showToast(`📍 ${newTable.name} (${dbEntry.cart.length} صنف مسجل من الويتر)`);
                }
              }
            }
          }).catch(console.error);
        }
        setCart([]);
        setCustomerName('');
        setDiscountAmount(0);
        setOrderNotes('');
        showToast(`📍 تم فتح ${newTable.name}`);
      }
      setPaidAmount('');
    } else {
      setCart([]);
      setCustomerName('');
      setDiscountAmount(0);
      setOrderNotes('');
      setPaidAmount('');
    }
  }

  // Transfer Table Order to Another Table
  async function handleTransferTableOrder(forceAdmin = false) {
    if (!transferModal || !transferTargetId) {
      showToast('⚠️ يرجى اختيار الطاولة المطلوب النقل إليها');
      return;
    }
    const source = transferModal.sourceTable;
    const target = tables.find((t) => Number(t.id) === Number(transferTargetId));
    if (!source || !target) {
      showToast('⚠️ طاولة غير صحيحة');
      return;
    }
    if (Number(source.id) === Number(target.id)) {
      showToast('⚠️ يرجى اختيار طاولة مختلفة عن الطاولة الحالية');
      return;
    }

    const sourceData = tableCartsMap[source.id] || tableCartsMap[String(source.id)] || tableCartsMap[Number(source.id)];
    const isCurrentActive = selectedTable && Number(selectedTable.id) === Number(source.id);
    const sourceCart = isCurrentActive && cart.length > 0 ? [...cart] : (sourceData?.cart || []);

    if (!sourceCart || sourceCart.length === 0) {
      showToast('⚠️ لا توجد طلبات معلقة على هذه الطاولة لنقلها!');
      return;
    }

    // شرط أمان: إذا أُرسل أي صنف للبار يجب كلمة مرور الأدمن للنقل
    const hasSentToBar = sourceCart.some((it) => (Number(it.sent_qty) || 0) > 0);
    if (hasSentToBar && !transferModal._adminVerified && !forceAdmin) {
      handleRequestAdminAuth({
        type: 'transfer_table_order_with_sent',
        sourceTable: source,
        targetId: transferTargetId
      });
      return;
    }

    // A1 بند 1: احفظ السلة المفتوحة قبل النقل حتى لا يكون _rev المحلي قديماً
    if (isCurrentActive && sourceCart.length > 0) {
      const curEntry = tableCartsMap[source.id] || tableCartsMap[String(source.id)] || {};
      const saved = await api.saveTableCart(Number(source.id), { ...curEntry, cart: sourceCart, customerName, discountAmount, orderNotes });
      if (saved && saved.conflict) {
        const sc = saved.current;
        if (sc) {
          setTableCartsMap((p) => ({ ...p, [source.id]: sc, [String(source.id)]: sc }));
          prevTableCartsRef.current = { ...prevTableCartsRef.current, [source.id]: sc, [String(source.id)]: sc };
          setCart(sc.cart || []); setCustomerName(sc.customerName || ''); setDiscountAmount(sc.discountAmount || 0); setOrderNotes(sc.orderNotes || '');
        }
        showToast('⚠️ الطاولة اتحدثت بطلب جديد، راجعها وأعد النقل');
        return;
      }
      if (!saved || saved.success !== true) { showToast('❌ تعذر حفظ الطاولة قبل النقل'); return; }
    }

    // ====== حماية النقل: أوقف أي debounced save فوراً قبل النقل ======
    if (saveTableCartTimeoutRef.current) {
      clearTimeout(saveTableCartTimeoutRef.current);
      saveTableCartTimeoutRef.current = null;
    }

    // A1 بند 3: احذف فقط مدخلات الطاولتين من pendingChangedTablesRef — لا clearTimeout شامل
    pendingChangedTablesRef.current.delete(String(source.id));
    pendingChangedTablesRef.current.delete(Number(source.id));
    pendingChangedTablesRef.current.delete(source.id);
    pendingChangedTablesRef.current.delete(String(target.id));
    pendingChangedTablesRef.current.delete(Number(target.id));
    pendingChangedTablesRef.current.delete(target.id);

    // ====== حماية النقل: سجّل الطاولة المصدر في القائمة المحظورة لمنع أي auto-save أو poll ======
    transferBlockedTablesRef.current.add(source.id);
    transferBlockedTablesRef.current.add(String(source.id));
    transferBlockedTablesRef.current.add(Number(source.id));

    // حفظ نسخة احتياطية من الحالة المفتوحة للاسترجاع التلقائي إذا فشل النقل
    const backupCustomerName = customerName;
    const backupDiscountAmount = discountAmount;
    const backupOrderNotes = orderNotes;

    // ====== مسح فوري: فرّغ الـ cart لو الطاولة المصدر هي المفتوحة — ده يمنع أي useEffect أو closure يقرأ بيانات قديمة ======
    if (isCurrentActive) {
      setCart([]);
      setCustomerName('');
      setDiscountAmount(0);
      setOrderNotes('');
    }

    // احجب الـ poll أثناء النقل ومرّر حدث تعديل لمنع snapshot قديم
    pollBusyRef.current = true;
    mutationSeqRef.current += 1;

    // A1 بند 4: النداء — أشترط res.success === true
    let res = null;
    if (api.transferTable) {
      try {
        res = await api.transferTable({
          fromTableId: Number(source.id),
          toTableId: Number(target.id)
        });
      } catch (e) {
        console.error('transferTable error:', e);
        // إزالة الحظر واستعادة السلة عند الفشل حتى لا تختفي الأصناف من شاشة الكاشير
        transferBlockedTablesRef.current.delete(source.id);
        transferBlockedTablesRef.current.delete(String(source.id));
        transferBlockedTablesRef.current.delete(Number(source.id));
        if (isCurrentActive) {
          setCart(sourceCart);
          setCustomerName(backupCustomerName);
          setDiscountAmount(backupDiscountAmount);
          setOrderNotes(backupOrderNotes);
        }
        showToast('❌ حدث خطأ أثناء الاتصال بقاعدة البيانات أثناء النقل — لم يتم النقل');
        return;
      } finally {
        pollBusyRef.current = false;
      }
    } else {
      // A1: api.transferTable غير موجودة — النقل غير مدعوم
      pollBusyRef.current = false;
      transferBlockedTablesRef.current.delete(source.id);
      transferBlockedTablesRef.current.delete(String(source.id));
      transferBlockedTablesRef.current.delete(Number(source.id));
      if (isCurrentActive) {
        setCart(sourceCart);
        setCustomerName(backupCustomerName);
        setDiscountAmount(backupDiscountAmount);
        setOrderNotes(backupOrderNotes);
      }
      showToast('❌ النقل غير مدعوم في هذا الإصدار');
      return;
    }

    // A1 بند 4: شرط النجاح الصارم — أي حاجة غير نجاح نتوقف ونستعيد السلة
    if (!res || res.success !== true) {
      transferBlockedTablesRef.current.delete(source.id);
      transferBlockedTablesRef.current.delete(String(source.id));
      transferBlockedTablesRef.current.delete(Number(source.id));
      if (isCurrentActive) {
        setCart(sourceCart);
        setCustomerName(backupCustomerName);
        setDiscountAmount(backupDiscountAmount);
        setOrderNotes(backupOrderNotes);
      }
      showToast(`❌ ${res?.error || 'حدث خطأ أثناء نقل الطلب'}`);
      return;
    }
    // A1 بند 5: updateTableStatus محذوفة — الداتابيز تدير الحالة داخل الـ transaction

    // A1 بند 6: استخدم res.tableCarts أو اجلب من الداتابيز
    const fresh = res.tableCarts || (api.getTableCarts ? await api.getTableCarts().catch(() => null) : null) || {};
    // تنظيف فوري وشامل للطاولة المصدر من كافة الـ refs والذاكرة المؤقتة لمنع أي ارتداد
    inFlightTablesRef.current.delete(source.id);
    inFlightTablesRef.current.delete(String(source.id));
    delete missCountRef.current[source.id];
    delete missCountRef.current[String(source.id)];
    delete saveRetryCountRef.current[source.id];
    delete saveRetryCountRef.current[String(source.id)];
    pendingChangedTablesRef.current.delete(source.id);
    pendingChangedTablesRef.current.delete(String(source.id));
    pendingChangedTablesRef.current.delete(Number(source.id));
    delete fresh[source.id];
    delete fresh[String(source.id)];
    delete fresh[Number(source.id)];

    const nextCleanMap = { ...fresh };
    delete nextCleanMap[source.id];
    delete nextCleanMap[String(source.id)];
    delete nextCleanMap[Number(source.id)];

    setTableCartsMap(nextCleanMap);
    prevTableCartsRef.current = { ...nextCleanMap };
    mutationSeqRef.current += 1;
    try { localStorage.setItem('cafepos_table_carts', JSON.stringify(nextCleanMap)); } catch (_) { }

    // A1 بند 6: تحديث شاشة الطاولة الهدف لو كانت مفتوحة
    const freshTarget = nextCleanMap[target.id] || nextCleanMap[String(target.id)] || {};
    if (isCurrentActive || (selectedTable && Number(selectedTable.id) === Number(source.id))) {
      setSelectedTable(target);
      selectedTableRef.current = target;
      setCart(freshTarget.cart || []);
      setCustomerName(freshTarget.customerName || '');
      setDiscountAmount(freshTarget.discountAmount ?? 0);
      setOrderNotes(freshTarget.orderNotes || '');
    } else {
      // لو الكاشير كان في شاشة الطاولات، فرّغ cart لمنع hadStrayCart من إعادة لصق الطلب على الطاولة القديمة
      if (!selectedTable || Number(selectedTable.id) === Number(source.id)) {
        setSelectedTable(null);
        selectedTableRef.current = null;
        setCart([]);
        setCustomerName('');
        setDiscountAmount(0);
        setOrderNotes('');
      }
    }

    // A1 بند 7: تحديث حالة الطاولات في الواجهة
    setTables((prevTables) =>
      prevTables.map((t) => {
        if (Number(t.id) === Number(source.id)) return { ...t, status: 'available', current_order_id: null };
        if (Number(t.id) === Number(target.id)) return { ...t, status: 'occupied' };
        return t;
      })
    );

    showToast(`✅ تم نقل الطلب بنجاح من ${source.name} إلى ${target.name}!`);
    setTransferModal(null);
    setTransferTargetId('');
    await refreshData(source.id);

    // ====== إزالة الحظر بعد 5 ثوانٍ — مدة كافية لانتهاء أي debounced save أو poll cycle ======
    setTimeout(() => {
      transferBlockedTablesRef.current.delete(source.id);
      transferBlockedTablesRef.current.delete(String(source.id));
      transferBlockedTablesRef.current.delete(Number(source.id));
    }, 5000);
  }

  // Transfer Single Item to Another Table
  function handleOpenTransferItemModal(item) {
    if (!selectedTable) {
      showToast('⚠️ يجب اختيار طاولة أولاً لنقل الصنف منها');
      return;
    }
    setTransferItemModal({ item, sourceTable: selectedTable });
    setTransferItemQty(1);
    setTransferItemTargetId('');
    setTransferItemAdminPassword('');
    setTransferItemError('');
  }

  async function handleConfirmTransferItem() {
    if (!transferItemModal || !transferItemTargetId) {
      setTransferItemError('يرجى اختيار الطاولة المراد النقل إليها');
      return;
    }
    const source = transferItemModal.sourceTable;
    const item = transferItemModal.item;
    const target = tables.find((t) => t.id === Number(transferItemTargetId));

    if (!source || !target) {
      setTransferItemError('بيانات الطاولة غير صحيحة');
      return;
    }
    if (source.id === target.id) {
      setTransferItemError('يرجى اختيار طاولة مختلفة عن الطاولة الحالية');
      return;
    }

    const moveQty = Math.max(1, Math.min(Number(transferItemQty) || 1, item.qty));

    // فحص الفاتورة الأولية: إذا طُبع الشيك الأولي لهذه الطاولة يلزم كلمة سر الأدمن
    const isPreBillPrinted = Boolean(tableCartsMap[source.id]?.printedCheck);
    if (isPreBillPrinted) {
      if (!transferItemAdminPassword.trim()) {
        setTransferItemError('⚠️ تم طباعة الفاتورة الأولية لهذا الشيك مسبقاً! يلزم إدخال كلمة سر الأدمن للموافقة على نقل الصنف.');
        return;
      }
      try {
        const auth = await api.verifyAdminPassword(transferItemAdminPassword.trim());
        if (!auth || !auth.success) {
          setTransferItemError(auth?.error || 'كلمة سر الأدمن غير صحيحة!');
          return;
        }
      } catch (err) {
        setTransferItemError('خطأ أثناء التحقق من كلمة السر');
        return;
      }
    }

    // A2 بند 3: لا clearTimeout شامل — فقط مدخلات الطاولتين
    pendingChangedTablesRef.current.delete(String(source.id));
    pendingChangedTablesRef.current.delete(Number(source.id));
    pendingChangedTablesRef.current.delete(String(target.id));
    pendingChangedTablesRef.current.delete(Number(target.id));

    // 1. حساب السلات الجديدة متزامناً قبل أي استدعاء غير متزامن
    const sData = tableCartsMap[source.id] || tableCartsMap[String(source.id)] || { cart: [] };
    const currentSourceCart = Array.isArray(sData.cart) && sData.cart.length > 0
      ? sData.cart
      : (selectedTable && Number(selectedTable.id) === Number(source.id) ? cart : []);

    const transferredSentQty = Math.min(Number(item.sent_qty) || 0, moveQty);

    const newSourceCart = currentSourceCart.map((it) => {
      if (Number(it.id) === Number(item.id)) {
        const remQty = it.qty - moveQty;
        const remSent = Math.max(0, (Number(it.sent_qty) || 0) - transferredSentQty);
        return remQty > 0 ? { ...it, qty: remQty, sent_qty: remSent } : null;
      }
      return it;
    }).filter(Boolean);

    const tData = tableCartsMap[target.id] || tableCartsMap[String(target.id)] || { cart: [], customerName: '', discountAmount: 0, orderNotes: '' };
    const currentTargetCart = Array.isArray(tData.cart) ? [...tData.cart] : [];
    const tIdx = currentTargetCart.findIndex((it) => Number(it.id) === Number(item.id));
    if (tIdx >= 0) {
      currentTargetCart[tIdx] = {
        ...currentTargetCart[tIdx],
        qty: currentTargetCart[tIdx].qty + moveQty,
        sent_qty: (Number(currentTargetCart[tIdx].sent_qty) || 0) + transferredSentQty
      };
    } else {
      currentTargetCart.push({
        ...item,
        qty: moveQty,
        sent_qty: transferredSentQty
      });
    }

    try {
      // A2 بند 1: لو المصدر هو الطاولة المفتوحة احفظ سلتها أولاً
      if (selectedTable && Number(selectedTable.id) === Number(source.id) && currentSourceCart.length > 0) {
        const curEntry = tableCartsMap[source.id] || tableCartsMap[String(source.id)] || {};
        const preSaved = await api.saveTableCart(Number(source.id), { ...curEntry, cart: currentSourceCart, customerName, discountAmount, orderNotes });
        if (preSaved && preSaved.conflict) {
          const sc = preSaved.current;
          if (sc) {
            setTableCartsMap((p) => ({ ...p, [source.id]: sc, [String(source.id)]: sc }));
            prevTableCartsRef.current = { ...prevTableCartsRef.current, [source.id]: sc, [String(source.id)]: sc };
            setCart(sc.cart || []); setCustomerName(sc.customerName || ''); setDiscountAmount(sc.discountAmount || 0); setOrderNotes(sc.orderNotes || '');
          }
          setTransferItemError('⚠️ الطاولة اتحدثت بطلب جديد، راجعها وأعد النقل');
          return;
        }
      }

      let res = null;
      // A2 بند 5: pollBusyRef و mutationSeqRef
      pollBusyRef.current = true;
      mutationSeqRef.current += 1;
      if (api.transferTableItem) {
        res = await api.transferTableItem({
          fromTableId: Number(source.id),
          toTableId: Number(target.id),
          itemId: Number(item.id),
          qty: moveQty,
          notes: item.notes || ''
        });
        // A2 بند 3: اشترط res.success === true
        if (!res || res.success !== true) {
          setTransferItemError(res?.error || 'حدث خطأ أثناء نقل الصنف');
          return;
        }
      }

      const afterSource = res && res.tableCarts ? (res.tableCarts[source.id] || res.tableCarts[String(source.id)]) : null;
      const finalSourceCart = (res && res.tableCarts) ? (afterSource?.cart || []) : newSourceCart;

      // A2 بند 4: استخدم res.tableCarts دائماً إن وجدت
      if (res && res.tableCarts) {
        setTableCartsMap(res.tableCarts);
        prevTableCartsRef.current = { ...res.tableCarts };
        mutationSeqRef.current += 1;
        try { localStorage.setItem('cafepos_table_carts', JSON.stringify(res.tableCarts)); } catch (_) { }

        const freshSource = res.tableCarts[source.id] || res.tableCarts[String(source.id)];
        const freshTarget = res.tableCarts[target.id] || res.tableCarts[String(target.id)];
        if (selectedTable && Number(selectedTable.id) === Number(source.id)) {
          setCart(freshSource?.cart || []);
        } else if (selectedTable && Number(selectedTable.id) === Number(target.id)) {
          setCart(freshTarget?.cart || []);
        }
      } else {
        // fallback محلي لو res.tableCarts غير موجود
        const finalTargetCart = currentTargetCart;

        setTableCartsMap((prev) => {
          const next = { ...prev };
          if (finalSourceCart.length === 0) {
            delete next[source.id];
            delete next[String(source.id)];
            delete next[Number(source.id)];
          } else {
            const updatedSourceData = { ...sData, cart: finalSourceCart };
            next[source.id] = updatedSourceData;
            next[String(source.id)] = updatedSourceData;
          }
          const updatedTargetData = {
            ...tData,
            cart: finalTargetCart,
            printedCheck: false,
            printedCheckTime: null
          };
          next[target.id] = updatedTargetData;
          next[String(target.id)] = updatedTargetData;
          try { localStorage.setItem('cafepos_table_carts', JSON.stringify(next)); } catch (_) { }
          return next;
        });

        if (selectedTable && Number(selectedTable.id) === Number(source.id)) {
          setCart(finalSourceCart);
        } else if (selectedTable && Number(selectedTable.id) === Number(target.id)) {
          setCart(finalTargetCart);
        }

        if (finalSourceCart.length === 0 && prevTableCartsRef.current) {
          delete prevTableCartsRef.current[source.id];
          delete prevTableCartsRef.current[String(source.id)];
          delete prevTableCartsRef.current[Number(source.id)];
        }
      }

      // تحديث حالة الطاولات في الواجهة
      setTables((prevTables) =>
        prevTables.map((t) => {
          if (Number(t.id) === Number(source.id)) {
            return {
              ...t,
              status: finalSourceCart.length === 0 ? 'available' : 'occupied',
              current_order_id: finalSourceCart.length === 0 ? null : t.current_order_id
            };
          }
          if (Number(t.id) === Number(target.id)) {
            return { ...t, status: 'occupied' };
          }
          return t;
        })
      );

      if (finalSourceCart.length === 0) {
        // حماية شاملة لنقل الصنف الأخير: إيقاف الحفظ المجدول وحظر الطاولة المصدر فوراً
        if (saveTableCartTimeoutRef.current) {
          clearTimeout(saveTableCartTimeoutRef.current);
          saveTableCartTimeoutRef.current = null;
        }
        pendingChangedTablesRef.current.delete(source.id);
        pendingChangedTablesRef.current.delete(String(source.id));
        pendingChangedTablesRef.current.delete(Number(source.id));

        transferBlockedTablesRef.current.add(source.id);
        transferBlockedTablesRef.current.add(String(source.id));
        transferBlockedTablesRef.current.add(Number(source.id));

        if (selectedTable && Number(selectedTable.id) === Number(source.id)) {
          setCart([]);
          setCustomerName('');
          setDiscountAmount(0);
          setOrderNotes('');
        }

        if (prevTableCartsRef.current) {
          delete prevTableCartsRef.current[source.id];
          delete prevTableCartsRef.current[String(source.id)];
          delete prevTableCartsRef.current[Number(source.id)];
        }
        try {
          const stored = localStorage.getItem('cafepos_table_carts');
          if (stored) {
            const parsed = JSON.parse(stored);
            delete parsed[source.id];
            delete parsed[String(source.id)];
            delete parsed[Number(source.id)];
            localStorage.setItem('cafepos_table_carts', JSON.stringify(parsed));
          }
        } catch (_) { }

        setTimeout(() => {
          transferBlockedTablesRef.current.delete(source.id);
          transferBlockedTablesRef.current.delete(String(source.id));
          transferBlockedTablesRef.current.delete(Number(source.id));
        }, 5000);
      }

      showToast(`✅ تم نقل (${moveQty}) من "${item.name}" إلى ${target.name} بنجاح!`);
      setTransferItemModal(null);
      setTransferItemTargetId('');
      setTransferItemAdminPassword('');
      setTransferItemError('');
      await refreshData(finalSourceCart.length === 0 ? source.id : null);
    } catch (err) {
      console.error(err);
      setTransferItemError('حدث خطأ أثناء نقل الصنف');
    } finally {
      pollBusyRef.current = false;
    }
  }

  // Authentication Handlers
  async function handleLogin(e) {
    if (e) e.preventDefault();
    return flightLogin(async () => {
      setLoginError('');
      if (!loginForm.username || !loginForm.password) {
        setLoginError('يرجى إدخال اسم المستخدم وكلمة المرور');
        return;
      }
      try {
        const user = await api.loginUser(loginForm.username, loginForm.password);
        if (user && user.error) {
          setLoginError(user.error);
          if (user.clockTampered) {
            setClockError(user.error);
          }
          return;
        }
        if (user && user.id) {
          setLoginForm({ username: '', password: '' });
          setLoginFailCount(0);
          setActiveTab('pos');
          setCart([]);
          setSelectedTable(null);
          showToast(`👋 أهلاً بك يا ${user.name}`);
          await refreshData();
          setCurrentUser(user);
        } else {
          setLoginFailCount(prev => prev + 1);
          setLoginError('اسم المستخدم أو كلمة المرور غير صحيحة');
        }
      } catch (err) {
        console.error(err);
        setLoginError('حدث خطأ أثناء تسجيل الدخول');
      }
    });
  }

  async function handleEmergencyReset(e) {
    e.preventDefault();
    setEmergencyError('');
    setEmergencySuccess('');
    if (!emergencyPin.trim()) { setEmergencyError('يرجى إدخال رمز المورد'); return; }
    if (!emergencyNewPass || emergencyNewPass.trim().length < MIN_PASSWORD_LENGTH) { setEmergencyError(`كلمة المرور يجب أن تكون ${MIN_PASSWORD_LENGTH} أحرف/أرقام على الأقل`); return; }
    if (emergencyNewPass !== emergencyConfirmPass) { setEmergencyError('كلمتا المرور غير متطابقتين'); return; }
    try {
      const res = api.resetAdminPassword
        ? await api.resetAdminPassword(emergencyPin.trim(), emergencyNewPass.trim())
        : { success: false, error: 'غير متاح في الوضع التجريبي' };
      if (res && res.success) {
        setEmergencySuccess(`✅ تم إعادة تعيين كلمة مرور المدير بنجاح! المستخدمون المُصلَحون: ${(res.admins || []).join(', ') || 'admin'}`);
        setEmergencyPin('');
        setEmergencyNewPass('');
        setEmergencyConfirmPass('');
        setLoginFailCount(0);
        // Reload users list
        if (api.listUsers) { const ul = await api.listUsers(); if (Array.isArray(ul)) setUsersList(ul); }
      } else {
        setEmergencyError(res?.error || 'رمز المورد غير صحيح');
      }
    } catch (err) {
      setEmergencyError('حدث خطأ أثناء عملية إعادة التعيين');
    }
  }

  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (shift && shift.id) {
        e.preventDefault();
        e.returnValue = '⚠️ تنبيه: يوجد شيفت مفتوح حالياً لم يتم إغلاقه وتسليمه!';
        return e.returnValue;
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [shift]);

  useEffect(() => {
    // Focus resilience: guarantees that clicking any input or textarea immediately activates keyboard input
    const handleInputFocusResilience = (e) => {
      const target = e.target;
      if (!target) return;
      const tag = (target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea') {
        if (document.activeElement !== target) {
          target.focus();
        }
      }
    };
    window.addEventListener('pointerdown', handleInputFocusResilience, true);
    return () => window.removeEventListener('pointerdown', handleInputFocusResilience, true);
  }, []);

  async function handleLogout() {
    if (shift && shift.id) {
      showToast('⚠️ لا يمكن تسجيل الخروج أثناء وجود شيفت مفتوح! يجب تسليم الكاش وإغلاق الشيفت أولاً.');
      return;
    }
    try {
      if (api.logoutUser) await api.logoutUser();
    } catch (_) { }
    try {
      if (api.listUsers) {
        const uList = await api.listUsers();
        if (Array.isArray(uList) && uList.length > 0) setUsersList(uList);
      }
      if (api.getSettings) {
        const setts = await api.getSettings();
        if (setts && !setts.error) setSettings(setts);
      }
    } catch (_) { }
    setSavedCashierUser(null);
    setCurrentUser(null);
    setActiveTab('pos');
    setCart([]);
    setSelectedTable(null);
    setLoginForm({ username: '', password: '' });
    showToast('🔒 تم تسجيل الخروج');
  }

  // Admin Quick-Access: switch to admin view without closing shift
  async function handleAdminOverlayLogin(e) {
    if (e) e.preventDefault();
    setAdminOverlayError('');
    if (!adminOverlayPassword || !adminOverlayPassword.trim()) {
      setAdminOverlayError('يرجى إدخال كلمة مرور الأدمن');
      return;
    }
    try {
      const res = await api.adminOverlayLogin(adminOverlayPassword);
      if (!res || !res.success) {
        setAdminOverlayError(res?.error || 'كلمة مرور الأدمن غير صحيحة!');
        return;
      }
      // Save current cashier user to restore later
      setSavedCashierUser({ ...currentUser });
      // Switch to admin view with returned admin user
      const adminUser = res.user || {
        ...currentUser,
        role: 'admin',
        name: 'المدير العام'
      };
      setCurrentUser({
        ...adminUser,
        role: 'admin',
        _originalRole: currentUser?.role,
        _originalName: currentUser?.name,
        _isOverlay: true
      });
      setAdminOverlayModal(false);
      setAdminOverlayPassword('');
      showToast('👑 تم الدخول لوضع المدير — اضغط "رجوع للكاشير" للعودة');
      await refreshData();
    } catch (err) {
      console.error(err);
      setAdminOverlayError('حدث خطأ أثناء التحقق من كلمة المرور');
    }
  }

  async function handleReturnToCashier() {
    if (savedCashierUser) {
      try {
        if (api.adminOverlayReturn) await api.adminOverlayReturn();
      } catch (err) {
        console.error(err);
      }
      setCurrentUser(savedCashierUser);
      setSavedCashierUser(null);
      setActiveTab('pos');
      showToast('🔄 تم العودة لوضع الكاشير');
      await refreshData();
    }
  }

  async function handleForcePasswordChange(e) {
    if (e) e.preventDefault();
    setPasswordChangeError('');
    if (!newPasswordInput || newPasswordInput.length < 6) {
      setPasswordChangeError('كلمة المرور يجب أن تكون 6 أحرف/أرقام على الأقل');
      return;
    }
    if (newPasswordInput !== confirmPasswordInput) {
      setPasswordChangeError('كلمة المرور وتأكيدها غير متطابقين');
      return;
    }
    try {
      const res = await api.changePassword({ userId: currentUser.id, newPassword: newPasswordInput });
      if (res && res.success) {
        showToast('✅ تم تغيير كلمة المرور بنجاح!');
        setForcePasswordModal(false);
        setNewPasswordInput('');
        setConfirmPasswordInput('');
        const updated = { ...currentUser, must_change_password: 0 };
        setCurrentUser(updated);
      } else {
        setPasswordChangeError(res?.error || 'حدث خطأ أثناء تغيير كلمة المرور');
      }
    } catch (err) {
      setPasswordChangeError('فشل الاتصال بالخادم لتغيير كلمة المرور');
    }
  }

  async function handleActivateLicense(e) {
    if (e) e.preventDefault();
    setLicenseError('');
    if (!licenseInput.trim()) {
      setLicenseError('يرجى إدخال كود التفعيل');
      return;
    }
    try {
      const res = await api.activateLicense(licenseInput.trim());
      if (res && res.success) {
        const msg = res.expiresAt
          ? `🎉 تم تفعيل البرنامج بنجاح! صالح حتى ${res.expiresAt} (${res.daysLeft} يوم متبقي)`
          : '🎉 تم تفعيل البرنامج بنجاح (ترخيص دائم)';
        showToast(msg);
        setLicenseData({
          ...licenseData,
          isActivated: true,
          isExpired: false,
          licenseKey: licenseInput.trim(),
          expiresAt: res.expiresAt || null,
          daysLeft: res.daysLeft || null
        });
        setLicenseInput('');
      } else {
        setLicenseError(res?.error || 'كود التفعيل غير صحيح أو لا يطابق هذا الجهاز');
      }
    } catch (err) {
      setLicenseError('حدث خطأ أثناء محاولة التفعيل');
    }
  }

  // Backup and Restore Handlers
  async function handleDialogBackup() {
    try {
      const res = await api.dialogSaveBackup();
      if (res && res.canceled) return;
      if (res && res.success) {
        showToast(`💾 تم حفظ النسخة الاحتياطية بنجاح: ${res.filename || ''}`);
      } else {
        showToast('❌ حدث خطأ أثناء إنشاء النسخة الاحتياطية');
      }
    } catch (err) {
      console.error(err);
      showToast('❌ تعذر حفظ النسخة الاحتياطية');
    }
  }

  async function handleDialogRestore() {
    if (!window.confirm('⚠️ تحذير: استرجاع نسخة احتياطية سيستبدل كل البيانات الحالية ببيانات الملف المختار!\n\n(سيتم عمل نسخة أمان تلقائية قبل الاستبدال). هل تريد المتابعة؟')) {
      return;
    }
    try {
      const res = await api.dialogRestoreBackup();
      if (res && res.canceled) return;
      if (res && res.success) {
        alert('✅ تم استرجاع قاعدة البيانات بنجاح!\n\nسيتم تحديث البيانات الآن.');
        refreshData();
        loadOrders();
        loadUsersAndAttendance();
      } else {
        showToast(`❌ ${res?.error || 'فشل استرجاع النسخة الاحتياطية'}`);
      }
    } catch (err) {
      console.error(err);
      showToast('❌ ملف النسخة الاحتياطية غير صالح أو تالف');
    }
  }

  // Data Export Handlers
  async function handleExportOrders() {
    try {
      const res = await api.exportOrdersCsv(orderDateMode === 'day' ? { shiftId: shift?.id } : {});
      if (res && !res.canceled && res.success) {
        showToast('📊 تم تصدير سجل الفواتير بنجاح إلى ملف Excel!');
      }
    } catch (err) {
      console.error(err);
      showToast('❌ حدث خطأ أثناء تصدير الفواتير');
    }
  }

  async function handleExportPayroll() {
    try {
      const res = await api.exportPayrollCsv(payrollMonth);
      if (res && !res.canceled && res.success) {
        showToast('💰 تم تصدير كشف المرتبات بنجاح إلى ملف Excel!');
      }
    } catch (err) {
      console.error(err);
      showToast('❌ حدث خطأ أثناء تصدير كشف المرتبات');
    }
  }

  async function handleExportDailySales() {
    try {
      const res = await api.exportDailySalesCsv(attendanceDateMode === 'day' ? attendanceDateFilter : null);
      if (res && !res.canceled && res.success) {
        showToast('📈 تم تصدير تقرير المبيعات بنجاح إلى ملف Excel!');
      }
    } catch (err) {
      console.error(err);
      showToast('❌ حدث خطأ أثناء تصدير تقرير المبيعات');
    }
  }

  // User CRUD Handlers
  async function handleSaveUser(e) {
    e.preventDefault();
    if (!userForm.username || !userForm.name) {
      showToast('⚠️ يرجى إدخال اسم الموظف واسم المستخدم');
      return;
    }
    if (!userForm.id && (!userForm.password || userForm.password.trim().length < 6)) {
      showToast('⚠️ كلمة المرور مطلوبة لإنشاء موظف جديد ويجب أن تكون 6 أحرف على الأقل');
      return;
    }
    if (userForm.id && userForm.password && userForm.password.trim().length < 6) {
      showToast('⚠️ كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل');
      return;
    }
    try {
      const saved = await api.saveUser({
        ...userForm,
        salary: Number(userForm.salary) || 3500
      });
      setUserModal(false);
      showToast('✅ تم حفظ بيانات الموظف بنجاح');
      await loadUsersAndAttendance();
      await refreshData();
      if (currentUser && saved && (currentUser.id === saved.id || currentUser.username === saved.username)) {
        setCurrentUser((prev) => ({
          ...prev,
          name: saved.name,
          username: saved.username,
          role: saved.role,
          phone: saved.phone,
          salary: saved.salary,
          shift_name: saved.shift_name,
          shift_start: saved.shift_start,
          shift_end: saved.shift_end
        }));
      }
    } catch (err) {
      console.error(err);
      showToast(`❌ ${err.message || 'حدث خطأ أثناء حفظ الموظف'}`);
    }
  }

  async function handleDeleteUser(id) {
    if (window.confirm('هل أنت متأكد من حذف هذا الموظف؟')) {
      const res = await api.deleteUser(id);
      if (res && res.error) {
        showToast(`⚠️ ${res.error}`);
      } else {
        showToast('🗑️ تم حذف الموظف');
        await loadUsersAndAttendance();
        await refreshData();
        if (String(reportUserId) === String(id)) {
          setReportUserId('all');
        }
      }
    }
  }

  // Shift Management
  async function handleOpenShift() {
    return flightOpenShift(async () => {
      try {
        const amount = parseFloat(openingCashInput || '0');
        const isMultiShift = settings.enable_multi_shifts === 'true';
        const effectiveShiftType = isMultiShift
          ? (shiftTypeInput || 'الشيفت الصباحي')
          : 'اليومية';
        const s = await api.openShift(amount, openingNotesInput, currentUser, effectiveShiftType);
        if (s && !s.error) {
          setShift(s);
          setOpeningCashInput('');
          setOpeningNotesInput('');
          try { if (api.notifyShiftState) api.notifyShiftState(true); } catch (_) { }
          showToast(isMultiShift
            ? `✅ تم فتح ${effectiveShiftType} للموظف ${currentUser?.name || ''}`
            : `✅ تم فتح الدرج وبدء اليومية (24 ساعة) بنجاح للموظف ${currentUser?.name || ''}`);
          await refreshData();
        } else if (s && s.error) {
          showToast(`⚠️ ${s.error}`);
          // If already has an open shift, load it directly
          const cur = await api.currentShift();
          if (cur && !cur.error) setShift(cur);
        }
      } catch (err) {
        console.error(err);
        showToast('❌ حدث خطأ أثناء فتح الشيفت');
      }
    });
  }

  async function handleConfirmCloseShift(overridePassword = null) {
    return flightCloseShift(async () => {
      if (!shift) return;
      try {
        if (actualCashInput === '') {
          showToast('⚠️ يرجى إدخال المبلغ الفعلي الموجود في الدرج (أو 0)');
          return;
        }
        let actual = 0;
        const val = parseFloat(actualCashInput);
        if (isNaN(val)) {
          showToast('⚠️ يرجى إدخال مبلغ نقدي صحيح');
          return;
        }
        if (val < 0) {
          showToast('⚠️ لا يمكن إدخال مبلغ فعلي بالسالب');
          return;
        }
        actual = val;

        const res = await api.closeShift(shift.id, actual, closeNotesInput, {}, overridePassword);
        if (res && res.error) {
          if (res.requiresAdminOverride || res.isBlockedByOpenOrders || (res.openTablesCount > 0 || res.pendingOrdersCount > 0)) {
            setShiftBlockerModal({
              openTablesCount: res.openTablesCount || 0,
              pendingOrdersCount: res.pendingOrdersCount || 0,
              requiresAdminOverride: res.requiresAdminOverride
            });
            return;
          }
          showToast(`❌ ${res.error}`);
          return;
        }

        setCloseSummary(res);
        setCloseShiftModal(false);
        setShiftBlockerModal(null);
        setShiftOverridePassword('');
        setShift(null);
        try { if (api.notifyShiftState) api.notifyShiftState(false); } catch (_) { }
        try { if (api.logoutUser) await api.logoutUser(); } catch (_) { }
        setCurrentUser(null);
        setActiveTab('pos');
        setSelectedTable(null);
        refreshData();
        showToast('🔒 تم تقفيل الشيفت بنجاح والعودة لشاشة تسجيل الدخول');
      } catch (err) {
        console.error(err);
        showToast(`❌ خطأ أثناء إغلاق الشيفت: ${err.message || 'حدث خطأ غير متوقع'}`);
      }
    });
  }

  // Expense
  async function handleAddExpense(e) {
    if (e) e.preventDefault();
    return flightExpense(async () => {
      if (!expenseForm.amount || Number(expenseForm.amount) <= 0) {
        showToast('⚠️ يرجى إدخال مبلغ المصروف بشكل صحيح');
        return;
      }
      if (!shift || !shift.id) {
        showToast('⚠️ لا يمكن تسجيل مصروف: يجب فتح الشيفت أولاً!');
        return;
      }
      try {
        let res = await api.addExpense(expenseForm);
        if (res && res.warning && res.success === false) {
          const confirmExceed = window.confirm(
            `⚠️ تنبيه رصيد الدرج:
${res.error}

هل تريد تأكيد تسجيل وصرف المصروف على أي حال؟`
          );
          if (confirmExceed) {
            res = await api.addExpense({ ...expenseForm, force: true });
          } else {
            return;
          }
        }
        if (res && res.success !== false) {
          setExpenseModal(false);
          setExpenseForm({ amount: '', category: 'مشتريات خامات (بن/حليب/سكر/مستلزمات)', notes: '' });
          showToast('💸 تم تسجيل المصروف بنجاح وخصمه من رصيد الخزينة.');
          await refreshData();
          await loadExpensesList();
        } else {
          showToast(`❌ ${res?.error || 'تعذر تسجيل المصروف'}`);
        }
      } catch (err) {
        console.error(err);
        showToast('❌ حدث خطأ أثناء تسجيل المصروف');
      }
    });
  }

  // Order Checkout
  async function handleCheckout() {
    // Guard: prevent double-click / concurrent checkout
    if (isCheckingOut) {
      showToast('⏳ جاري معالجة الطلب... يرجى الانتظار');
      return;
    }

    if (!shift || !shift.id) {
      showToast('⚠️ لا يمكن إتمام البيع: يجب فتح الشيفت أولاً!');
      return;
    }

    if (cart.length === 0) {
      showToast('⚠️ الرجاء اختيار منتج واحد على الأقل.');
      return;
    }

    const disc = Number(discountAmount) || 0;
    if (disc < 0) {
      showToast('⚠️ قيمة الخصم لا يمكن أن تكون سالبة');
      return;
    }
    if (disc > cartSubtotal) {
      showToast('⚠️ الخصم لا يمكن أن يتجاوز إجمالي الطلب');
      return;
    }

    if (orderType === 'dine_in' && !selectedTable) {
      showToast('⚠️ يرجى اختيار رقم الطاولة للطلب الداخلي (صالة).');
      return;
    }

    if (orderType === 'notebook' && !customerName.trim()) {
      showToast('⚠️ يرجى كتابة اسم الزبون لتسجيل الفاتورة على النوتة.');
      return;
    }

    const isNotebook = orderType === 'notebook';
    if (paymentMethod === 'split' && !isNotebook) {
      const sCash = Number(splitCash) || 0;
      const sWallet = Number(splitWallet) || 0;
      const sum = Math.round((sCash + sWallet) * 100) / 100;
      if (Math.abs(sum - cartTotal) > 0.01) {
        showToast(`⚠️ مجموع المبالغ المقسمة (${sum} ${settings.currency || 'ج.م'}) لا يطابق إجمالي الفاتورة (${cartTotal} ${settings.currency || 'ج.م'}). يرجى ضبط الأرقام.`);
        return;
      }
    }
    const payload = {
      items: cart,
      paymentMethod: isNotebook ? 'notebook' : (paymentMethod === 'notebook' ? 'cash' : paymentMethod),
      orderType,
      tableId: orderType === 'dine_in' ? (selectedTable?.id || null) : null,
      tableName: orderType === 'dine_in' ? (selectedTable?.name || '') : '',
      tableNumber: orderType === 'dine_in' ? (selectedTable?.number || '') : '',
      hall: orderType === 'dine_in' ? (selectedTable?.hall || '') : '',
      customerName: customerName.trim() || (isNotebook ? 'عميل نوتة' : ''),
      customerPhone: customerPhone.trim(),
      customerAddress: customerAddress.trim(),
      discount: disc,
      tax: 0,
      cashAmount: isNotebook ? (Number(paidAmount) || 0) : (paymentMethod === 'split' ? (Number(splitCash) || 0) : (paymentMethod === 'cash' ? cartTotal : 0)),
      walletAmount: isNotebook ? 0 : (paymentMethod === 'split' ? (Number(splitWallet) || 0) : (paymentMethod === 'wallet' ? cartTotal : 0)),
      cardAmount: 0,
      // في حالة الدفع المقسم (split): amountPaid = مجموع الكاش + المحفظة (= إجمالي الفاتورة دائماً)
      amountPaid: isNotebook
        ? (paidAmount !== '' ? Number(paidAmount) : 0)
        : (paymentMethod === 'split'
          ? Math.round(((Number(splitCash) || 0) + (Number(splitWallet) || 0)) * 100) / 100
          : (paidAmount !== '' ? Number(paidAmount) : cartTotal)),
      notes: orderNotes,
      user: currentUser,
      shiftId: shift?.id || null,
      ...(orderType === 'dine_in' && selectedTable?.id ? {
        expectedCartRev: (tableCartsMap[selectedTable.id] || tableCartsMap[String(selectedTable.id)])?._rev
      } : {})
    };

    const checkedOutTable = orderType === 'dine_in' ? selectedTable : null;
    const checkedOutTableId = orderType === 'dine_in' ? (selectedTable?.id || payload.tableId) : null;
    const wasCheckAlreadyPrinted = Boolean(
      checkedOutTableId && (
        tableCartsMap[checkedOutTableId]?.printedCheck ||
        tableCartsMap[String(checkedOutTableId)]?.printedCheck ||
        tableCartsMap[Number(checkedOutTableId)]?.printedCheck
      )
    );

    // التحقق الإلزامي: لا يمكن التحصيل بدون طباعة شيك الحساب للعميل أولاً (فقط إذا كانت الخاصية مفعلة)
    const isPrebillCheckRequired = Boolean(
      vendorDevFeatures.require_check_print_before_checkout &&
      settings.require_check_print_before_checkout !== 'false' &&
      vendorDevFeatures.enable_guest_check !== false &&
      settings.enable_guest_check !== 'false'
    );
    if (isPrebillCheckRequired && (selectedTable || orderType === 'dine_in')) {
      if (!wasCheckAlreadyPrinted) {
        showToast('⚠️ غير مسموح بالتحصيل! يجب الضغط على (طباعة شيك الحساب للعميل) أولاً وتسليمه للعميل قبل إتمام الطلب.');
        return;
      }
    }

    if (checkoutInFlightRef.current) return;
    checkoutInFlightRef.current = true;
    setIsCheckingOut(true);
    let orderCreatedSuccessfully = false;

    let checkoutTimeout = setTimeout(() => {
      if (checkoutInFlightRef.current) {
        checkoutInFlightRef.current = false;
        setIsCheckingOut(false);
        showToast('العملية تأخرت، تأكد من حالتها قبل ما تعيد');
      }
    }, 30000);

    try {
      if (!pendingCheckoutOrderIdRef.current) {
        pendingCheckoutOrderIdRef.current = `order_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      }
      const clientOrderId = pendingCheckoutOrderIdRef.current;
      payload.clientOrderId = clientOrderId;
      if (selectedTable && orderType === 'dine_in' && cart.length > 0) {
        const preSaved = await api.saveTableCart(Number(selectedTable.id), {
          ...(tableCartsMap[selectedTable.id] || {}),
          cart: [...cart],
          customerName,
          discountAmount,
          orderNotes
        });
        if (preSaved && preSaved.conflict) {
          const sc = preSaved.current;
          if (sc) {
            setCart(sc.cart || []);
            setTableCartsMap((prev) => ({ ...prev, [selectedTable.id]: sc, [String(selectedTable.id)]: sc }));
            prevTableCartsRef.current = { ...prevTableCartsRef.current, [selectedTable.id]: sc, [String(selectedTable.id)]: sc };
          }
          showToast('⚠️ وصل طلب جديد للطاولة قبل الدفع. اتحدّثت الفاتورة، راجعها وأكمل');
          setIsCheckingOut(false);
          return;
        }
        if (preSaved && preSaved.success === true && preSaved.rev !== undefined) {
          payload.expectedCartRev = preSaved.rev;
        }
      }

      pollBusyRef.current = true;
      mutationSeqRef.current += 1;

      const order = await api.createOrder(payload);
      if (order && order.conflict) {
        const fresh = await api.getTableCarts();
        const dbCart = fresh && (fresh[selectedTable.id] || fresh[String(selectedTable.id)]);
        if (dbCart) {
          setCart(dbCart.cart || []);
          setTableCartsMap((prev) => ({ ...prev, [selectedTable.id]: dbCart, [String(selectedTable.id)]: dbCart }));
          prevTableCartsRef.current = { ...prevTableCartsRef.current, [selectedTable.id]: dbCart, [String(selectedTable.id)]: dbCart };
        }
        showToast('⚠️ وصل طلب جديد للطاولة قبل الدفع. اتحدّثت الفاتورة، راجعها وأكمل');
        setIsCheckingOut(false);
        return;
      }
      if (!order || order.success === false || order.error) {
        throw new Error(order?.error || 'حدث خطأ أثناء حفظ الطلب');
      }
      orderCreatedSuccessfully = true;
      pendingCheckoutOrderIdRef.current = null;
      if (order.duplicate) {
        showToast('ℹ️ تم إتمام الطلب مسبقاً (تم تفادي تكرار الفاتورة)');
      }

      mutationSeqRef.current += 1;
      setBarTicketOrder(null);
      setShishaTicketOrder(null);

      // طباعة طلبات الشيشة تلقائياً لطابعة الشيشة فور التحصيل إذا لم تكن قد طُبعت مسبقاً
      const separateShisha = hasDedicatedShishaStation();
      const unsentShisha = separateShisha ? (cart || [])
        .filter(it => isShishaItem(it, categories) && (Number(it.sent_qty) || 0) < it.qty)
        .map(it => ({ ...it, printQty: it.qty - (Number(it.sent_qty) || 0) })) : [];

      if (unsentShisha.length > 0) {
        const shishaTicket = {
          id: order.invoiceNo || order.invoice_no || order.id || Date.now().toString().slice(-4),
          tableName: checkedOutTable?.name || payload.tableName || (payload.orderType === 'dine_in' ? 'صالة' : 'تيك أواي'),
          tableNumber: checkedOutTable?.number || payload.tableNumber || '',
          hall: checkedOutTable?.hall || payload.hall || '',
          orderType: payload.orderType,
          customerName: payload.customerName || '',
          cashierName: currentUser?.name || 'كاشير',
          time: formatShiftTime(new Date()),
          items: unsentShisha,
          orderNotes: payload.notes || '',
          ticketType: 'shisha'
        };
        setShishaTicketOrder(shishaTicket);
        setTimeout(() => { printShishaTicket(shishaTicket); }, 250);
      }

      // ترحيل الحساب مباشرة وإغلاق الطلب دون فتح مودال الفاتورة أو تكرار طباعة الشيك
      if (settings.auto_print_receipt_on_checkout === '1') {
        setReceiptOrder({
          ...order,
          customerName: order.customerName || order.customer_name || payload.customerName || '',
          customerPhone: order.customerPhone || order.customer_phone || payload.customerPhone || '',
          customerAddress: order.customerAddress || order.customer_address || payload.customerAddress || '',
          customer_name: order.customer_name || order.customerName || payload.customerName || '',
          customer_phone: order.customer_phone || order.customerPhone || payload.customerPhone || '',
          customer_address: order.customer_address || order.customerAddress || payload.customerAddress || '',
          tableName: order.tableName || order.table_name || checkedOutTable?.name || '',
          tableNumber: order.tableNumber || order.table_number || checkedOutTable?.number || '',
          hall: order.hall || order.table_hall || checkedOutTable?.hall || '',
          table_name: order.table_name || checkedOutTable?.name || '',
          table_number: order.table_number || checkedOutTable?.number || '',
          table_hall: order.table_hall || checkedOutTable?.hall || ''
        });
      } else {
        setReceiptOrder(null);
      }

      if (checkedOutTableId) {
        // 1. Cancel any pending debounced save immediately
        if (saveTableCartTimeoutRef.current) {
          clearTimeout(saveTableCartTimeoutRef.current);
          saveTableCartTimeoutRef.current = null;
        }
        // 2. Clear pending changes ref so stale data never re-saves
        pendingChangedTablesRef.current.delete(checkedOutTableId);
        pendingChangedTablesRef.current.delete(String(checkedOutTableId));
        pendingChangedTablesRef.current.delete(Number(checkedOutTableId));
        // حماية التحصيل: حظر الطاولة المحصلة من أي auto-save أو poll
        transferBlockedTablesRef.current.add(checkedOutTableId);
        transferBlockedTablesRef.current.add(String(checkedOutTableId));
        transferBlockedTablesRef.current.add(Number(checkedOutTableId));
        setTimeout(() => {
          transferBlockedTablesRef.current.delete(checkedOutTableId);
          transferBlockedTablesRef.current.delete(String(checkedOutTableId));
          transferBlockedTablesRef.current.delete(Number(checkedOutTableId));
        }, 5000);
        // 3. Remove from React state
        setTableCartsMap((prev) => {
          const next = { ...prev };
          delete next[checkedOutTableId];
          delete next[String(checkedOutTableId)];
          delete next[Number(checkedOutTableId)];
          return next;
        });
        if (prevTableCartsRef.current) {
          delete prevTableCartsRef.current[checkedOutTableId];
          delete prevTableCartsRef.current[String(checkedOutTableId)];
          delete prevTableCartsRef.current[Number(checkedOutTableId)];
        }
        // 4. Explicitly clear from localStorage immediately (no debounce)
        try {
          const stored = localStorage.getItem('cafepos_table_carts');
          if (stored) {
            const parsed = JSON.parse(stored);
            delete parsed[checkedOutTableId];
            delete parsed[String(checkedOutTableId)];
            delete parsed[Number(checkedOutTableId)];
            localStorage.setItem('cafepos_table_carts', JSON.stringify(parsed));
          }
        } catch (_) { }
        // 5. createOrder يمسح table_cart في الداتابيز داخلياً — لا داعي لاستدعاء saveTableCart(null) هنا
        // (استدعاؤها يفتح نافذة زمنية صغيرة يُمسح فيها طلب الويتر الوارد بعد الطباعة على البار)
      }
      if (orderType === 'takeaway') {
        isSwitchingTabRef.current = true;
        if (takeawayTabs.length > 1) {
          const remaining = takeawayTabs.filter((t) => t.id !== activeTakeawayId);
          const nextActive = remaining[0];
          setTakeawayTabs(remaining);
          setActiveTakeawayId(nextActive.id);
          setCart(nextActive.cart || []);
          setCustomerName(nextActive.customerName || '');
          setCustomerPhone(nextActive.customerPhone || '');
          setCustomerAddress(nextActive.customerAddress || '');
          setDiscountAmount(nextActive.discountAmount || 0);
          setOrderNotes(nextActive.orderNotes || '');
          try {
            localStorage.setItem('cafepos_takeaway_tabs', JSON.stringify(remaining));
            localStorage.setItem('cafepos_active_takeaway_id', nextActive.id);
          } catch (_) { }
          setTimeout(() => {
            isSwitchingTabRef.current = false;
          }, 100);
        } else {
          const resetTab = {
            id: 'tab_takeaway_1',
            name: 'طلب 1',
            cart: [],
            customerName: '',
            customerPhone: '',
            customerAddress: '',
            discountAmount: 0,
            orderNotes: '',
            isHeld: false
          };
          setTakeawayTabs([resetTab]);
          setActiveTakeawayId('tab_takeaway_1');
          setCart([]);
          setCustomerName('');
          setCustomerPhone('');
          setCustomerAddress('');
          setDiscountAmount(0);
          setOrderNotes('');
          try {
            localStorage.setItem('cafepos_takeaway_tabs', JSON.stringify([resetTab]));
            localStorage.setItem('cafepos_active_takeaway_id', 'tab_takeaway_1');
          } catch (_) { }
          setTimeout(() => {
            isSwitchingTabRef.current = false;
          }, 100);
        }
      } else {
        clearCart(true);
        setSelectedTable(null);
        setCart([]);
        setCustomerName('');
        setCustomerPhone('');
        setCustomerAddress('');
      }
      if (isNotebook) {
        showToast(`📝 تم تسجيل الفاتورة على نوتة ${payload.customerName} بنجاح!`);
        loadDebts();
        // Auto-open notebook modal so user can see the registered entry
        setTimeout(() => {
          setNotebookModal(true);
        }, 400);
      } else if (wasCheckAlreadyPrinted) {
        showToast(`✅ تم تحصيل الفاتورة #${order.invoiceNo || order.orderId} بنجاح وترحيل الحساب وإغلاق الطاولة`);
      } else {
        showToast(`✅ تم إتمام الفاتورة #${order.invoiceNo || order.orderId} بنجاح وترحيل الحساب`);
      }
      await refreshData(checkedOutTableId);
      // تحديث سجل الفواتير فوراً بعد الدفع لعرض الفاتورة الجديدة في السجل
      loadOrders();
    } catch (err) {
      console.error(err);
      if (orderCreatedSuccessfully) {
        showToast(`⚠️ تم تسجيل الفاتورة بنجاح ولكن حدث تنبيه: ${err.message || ''}`);
      } else {
        showToast(`❌ ${err.message || 'حدث خطأ أثناء حفظ الطلب.'}`);
      }
    } finally {
      clearTimeout(checkoutTimeout);
      pollBusyRef.current = false;
      checkoutInFlightRef.current = false;
      setIsCheckingOut(false);
    }
  }

  // Notebook Debt Actions
  async function handleConfirmPayDebt(e) {
    e.preventDefault();
    if (!payDebtData || !payAmountInput) return;
    const amt = Number(payAmountInput);
    if (amt <= 0) {
      showToast('⚠️ يرجى إدخال مبلغ سداد صحيح أكبر من الصفر');
      return;
    }
    if (amt > payDebtData.remaining_amount) {
      showToast('⚠️ المبلغ المدفوع أكبر من إجمالي المتبقي على العميل!');
      return;
    }
    try {
      const res = await api.payDebt({
        debtId: payDebtData.id,
        amount: amt,
        notes: payNotesInput,
        shiftId: shift?.id,
        cashierName: currentUser?.name
      });
      if (res.success) {
        showToast(`💵 تم سداد مبلغ ${amt} ${settings.currency || 'ج.م'} بنجاح وتسجيله في يومية وكاش اليوم!`);
        setPayDebtData(null);
        setPayAmountInput('');
        setPayNotesInput('');
        loadDebts();
        refreshData();
      } else {
        showToast(`❌ ${res.error || 'حدث خطأ أثناء السداد'}`);
      }
    } catch (err) {
      console.error(err);
      showToast('❌ حدث خطأ أثناء تسجيل السداد');
    }
  }

  async function handleConfirmPayCustomerDebts(e) {
    e.preventDefault();
    if (!payCustomerModalData || !payCustomerAmountInput) return;
    const amt = Number(payCustomerAmountInput);
    if (amt <= 0) {
      showToast('⚠️ يرجى إدخال مبلغ سداد صحيح أكبر من الصفر');
      return;
    }
    const maxRemaining = Number(payCustomerModalData.total_remaining ?? payCustomerModalData.remaining_amount) || 0;
    if (amt > maxRemaining + 0.01) {
      showToast('⚠️ المبلغ المدفوع أكبر من إجمالي المتبقي على العميل!');
      return;
    }
    try {
      const res = await api.payCustomerDebtsFIFO({
        customerId: payCustomerModalData.customer_id,
        customerName: payCustomerModalData.customer_name,
        customerPhone: payCustomerModalData.customer_phone || '',
        amount: amt,
        notes: payCustomerNotesInput,
        shiftId: shift?.id,
        cashierName: currentUser?.name
      });
      if (res && res.success) {
        showToast(`💵 تم سداد مبلغ ${amt} ${settings.currency || 'ج.م'} لحساب العميل ${payCustomerModalData.customer_name} بنجاح وتسجيله في كاش اليوم!`);
        setPayCustomerModalData(null);
        setPayCustomerAmountInput('');
        setPayCustomerNotesInput('');
        setViewCustomerDetails(null);
        await loadDebts();
        await refreshData();
      } else {
        showToast(`❌ ${res?.error || 'حدث خطأ أثناء السداد'}`);
      }
    } catch (err) {
      console.error(err);
      showToast('❌ حدث خطأ أثناء تسجيل السداد');
    }
  }

  async function handleConfirmDeleteDebt(e) {
    e.preventDefault();
    if (!deleteDebtData || !adminPasswordInput) {
      showToast('⚠️ يرجى إدخال كلمة مرور الأدمن');
      return;
    }
    try {
      const res = await api.deleteDebt({
        debtId: deleteDebtData.id,
        adminPassword: adminPasswordInput
      });
      if (res.success) {
        showToast('🗑️ تم مسح سجل النوتة نهائياً بعد التحقق من صلاحية الأدمن');
        setDeleteDebtData(null);
        setAdminPasswordInput('');
        loadDebts();
        refreshData();
      } else {
        showToast(`❌ ${res.error || 'كلمة المرور غير صحيحة! لا يمكن الحذف'}`);
      }
    } catch (err) {
      console.error(err);
      showToast('❌ حدث خطأ أثناء مسح النوتة');
    }
  }

  // Employee Adjustments Actions (Penalties, Bonuses, Absence)
  async function handleSaveAdjustment(e) {
    e.preventDefault();
    if (!adjustmentForm.userId) {
      showToast('⚠️ يرجى اختيار الموظف');
      return;
    }
    if (!adjustmentForm.reason.trim()) {
      showToast('⚠️ يرجى كتابة سبب الخصم أو المكافأة أو الغياب');
      return;
    }
    try {
      await api.addEmployeeAdjustment({
        ...adjustmentForm,
        createdBy: currentUser?.name || 'المدير'
      });
      setAdjustmentModal(false);
      setAdjustmentForm({
        userId: '',
        type: 'penalty',
        amount: '',
        daysCount: '1',
        date: new Date().toISOString().slice(0, 10),
        reason: ''
      });
      showToast('✅ تم تسجيل العملية بنجاح في سجل الموظف!');
      loadAdjustments();
    } catch (err) {
      console.error(err);
      showToast('❌ حدث خطأ أثناء تسجيل العملية');
    }
  }

  async function handleDeleteAdjustment(id) {
    if (window.confirm('هل أنت متأكد من حذف هذا السجل؟')) {
      await api.deleteEmployeeAdjustment(id);
      showToast('🗑️ تم حذف السجل بنجاح.');
      loadAdjustments();
    }
  }

  // Product CRUD
  async function handleSaveProduct(e) {
    e.preventDefault();
    if (!productForm.name || !productForm.price) return;
    try {
      const res = await api.saveProduct({
        ...productForm,
        price: Number(productForm.price),
        cost: Number(productForm.cost) || 0,
        stock_qty: Number(productForm.stock_qty) || 0,
        low_stock_threshold: Number(productForm.low_stock_threshold) || 5,
        category_id: Number(productForm.category_id) || (categories[0]?.id || 1)
      });
      if (res && res.success === false) {
        showToast(`❌ ${res.error || 'تعذر حفظ الصنف'}`);
        return;
      }
      setProductModal(false);
      showToast('✅ تم حفظ الصنف بنجاح!');
      refreshData();
    } catch (err) {
      console.error(err);
      showToast(`❌ ${err.message || 'حدث خطأ أثناء حفظ الصنف'}`);
    }
  }

  async function handleDeleteProduct(id) {
    if (window.confirm('هل أنت متأكد من رغبتك في حذف هذا الصنف؟')) {
      try {
        const res = await api.deleteProduct(id);
        if (res && res.success === false) {
          showToast(`❌ ${res.error || 'تعذر حذف الصنف'}`);
          return;
        }
        showToast('🗑️ تم حذف الصنف.');
        refreshData();
      } catch (err) {
        console.error(err);
        showToast(`❌ ${err.message || 'حدث خطأ أثناء حذف الصنف'}`);
      }
    }
  }

  // Table Selection for POS
  function handleSelectTable(tbl) {
    switchTable(tbl);
    setActiveTab('pos');
  }

  // Reset / Configure Table counts for both halls
  async function handleResetTables(e) {
    if (e) e.preventDefault();
    const inCount = Math.max(0, parseInt(tableCountsForm.indoorCount) || 0);
    const outCount = Math.max(0, parseInt(tableCountsForm.outdoorCount) || 0);
    if (inCount === 0 && outCount === 0) {
      showToast('⚠️ يرجى إدخال طاولة واحدة على الأقل في إحدى الصالتين');
      return;
    }
    try {
      const res = await api.resetTables({ indoorCount: inCount, outdoorCount: outCount });
      if (!Array.isArray(res)) {
        showToast(`⚠️ ${res?.error || 'تعذر إعادة ضبط الطاولات لوجود طاولات مشغولة'}`);
        return;
      }
      setTables(res);
      setTablesConfigModal(false);
      showToast(`✅ تم تحديث الصالات: ${inCount} طاولة داخلية و ${outCount} طاولة خارجية`);
      refreshData();
    } catch (err) {
      console.error(err);
      showToast('❌ حدث خطأ أثناء تحديث الطاولات');
    }
  }

  // Save / Update Section
  async function handleSaveSection(e) {
    if (e) e.preventDefault();
    if (!sectionForm.name || !sectionForm.name.trim()) {
      showToast('⚠️ يرجى إدخال اسم المكان / الصالة');
      return;
    }
    try {
      const oldSecName = sectionForm.id ? sections.find(s => s.id === sectionForm.id)?.name : null;
      const newSecName = sectionForm.name.trim();
      await api.saveSection({
        id: sectionForm.id || undefined,
        name: newSecName,
        sort_order: sectionForm.sort_order ? Number(sectionForm.sort_order) : 0
      });
      // تحديث الطاولات فورياً في الذاكرة لتطابق اسم الصالة الجديد وتفادي فقدانها
      if (oldSecName && oldSecName !== newSecName) {
        setTables(prev => prev.map(t => isSameHall(t.hall, oldSecName) ? { ...t, hall: newSecName } : t));
        if (isSameHall(activeHallFilter, oldSecName)) {
          setActiveHallFilter(newSecName);
        }
      }
      setSectionModal(false);
      setSectionForm({ id: null, name: '', sort_order: '' });
      showToast('✅ تم حفظ بيانات الصالة وتحديث طاولاتها بنجاح');
      refreshData();
    } catch (err) {
      console.error(err);
      showToast('❌ حدث خطأ أثناء حفظ الصالة');
    }
  }

  // Toggle Show "All" Tab in Tables Screen
  const handleToggleShowAllTablesTab = async (explicitVal = null) => {
    const nextVal = explicitVal !== null ? Boolean(explicitVal) : !showAllTablesTab;
    setShowAllTablesTab(nextVal);
    try {
      localStorage.setItem('cafepos_show_all_tables_tab', nextVal ? 'true' : 'false');
      if (api.saveSettings) {
        await api.saveSettings({ ...settings, show_all_tables_tab: nextVal ? 'true' : 'false' });
      }
    } catch (_) { }
    if (!nextVal && activeHallFilter === 'all' && sections.length > 0) {
      setActiveHallFilter(sections[0].name);
    }
    showToast(nextVal ? '✅ تم تفعيل تبويب "الكل"' : '✅ تم إخفاء تبويب "الكل"');
  };

  // Delete Section
  async function handleDeleteSection(secId, secName) {
    if (!window.confirm(`هل أنت متأكد من حذف المكان "${secName}"؟ سيتم حذف طاولات هذا المكان وتفريغها.`)) {
      return;
    }
    try {
      const res = await api.deleteSection(secId);
      if (res && res.error) {
        showToast(`❌ ${res.error}`);
        return;
      }
      showToast(`✅ تم حذف المكان "${secName}" بنجاح`);
      await refreshData();
    } catch (err) {
      console.error(err);
      showToast('❌ حدث خطأ أثناء حذف المكان');
    }
  }

  // Set / Reset Table count and custom numbering for a specific Section
  async function handleResetSectionTables(sectionId, sectionName, tableCount = null, startNumber = 1, endNumber = null) {
    try {
      const res = await api.resetSectionTables({
        sectionId,
        sectionName,
        tableCount,
        startNumber,
        endNumber
      });
      if (res && res.error) {
        showToast(`❌ ${res.error}`);
        return;
      }
      if (Array.isArray(res)) {
        setTables(res);
      }
      const start = startNumber || 1;
      const end = endNumber || (start + (tableCount || 1) - 1);
      showToast(`✅ تم ترقيم وتحديث طاولات "${sectionName}" من ${start} إلى ${end} بنجاح!`);
      await refreshData();
    } catch (err) {
      console.error(err);
      showToast(`❌ ${err?.message || 'حدث خطأ أثناء ضبط وترقيم الطاولات'}`);
    }
  }


  // Cancel Order
  function handleCancelOrder(id) {
    const order = ordersList.find((o) => o.id === id);
    if (!order) return;
    setOrderToCancel(order);
    setCancelReasonInput('إلغاء بناءً على رغبة العميل');
    setCancelAdminPassword('');
    setCancelModal(true);
  }

  async function handleConfirmCancelOrder() {
    return flightCancelOrder(async () => {
      if (!orderToCancel) return;
      try {
        if (orderToCancel.payment_method && currentUser?.role !== 'admin' && !cancelAdminPassword) {
          showToast('⚠️ يرجى إدخال كلمة مرور المدير لإلغاء هذه الفاتورة المدفوعة');
          return;
        }
        const res = await api.cancelOrder(orderToCancel.id, cancelReasonInput || 'إلغاء بناءً على رغبة العميل', currentUser, null, cancelAdminPassword);
        if (res && res.error) {
          showToast(`❌ ${res.error}`);
          return;
        }
        setCancelModal(false);
        setOrderToCancel(null);
        setCancelAdminPassword('');
        showToast('⚠️ تم إلغاء الطلب واسترجاع الكميات للمخزون بنجاح.');
        loadOrders();
        refreshData();
      } catch (err) {
        console.error(err);
        showToast(`❌ ${err.message || 'حدث خطأ أثناء إلغاء الطلب'}`);
      }
    });
  }

  // Settings Save
  async function handleSaveSettings(e) {
    e.preventDefault();
    const activeTheme = settings.app_theme || (typeof localStorage !== 'undefined' && localStorage.getItem('cafepos_app_theme')) || 'dark';
    try { localStorage.setItem('cafepos_app_theme', activeTheme); } catch (_) { }
    if (typeof document !== 'undefined') {
      document.body.classList.toggle('theme-latte', activeTheme === 'latte');
    }
    const updatedSettings = {
      ...settings,
      app_theme: activeTheme,
      shift_schedules: JSON.stringify(shiftSchedules),
      show_all_tables_tab: showAllTablesTab ? 'true' : 'false',
      enable_waiter_system: (vendorDevFeatures.enable_waiter_system) ? 'true' : 'false',
      enable_customer_qr: (vendorDevFeatures.enable_customer_qr) ? 'true' : 'false',
      enable_waiter_qr: (vendorDevFeatures.enable_waiter_system || vendorDevFeatures.enable_customer_qr || vendorDevFeatures.enable_waiter_qr) ? 'true' : 'false'
    };
    await api.saveSettings(updatedSettings);
    showToast('⚙️ تم حفظ الإعدادات بنجاح!');
    refreshData();
  }

  // Developer Features Handlers
  async function handleUnlockVendorDev(e) {
    if (e) e.preventDefault();
    setVendorDevError('');
    if (!vendorDevPassword.trim()) {
      setVendorDevError('يرجى إدخال رمز المطور (Vendor PIN)');
      return;
    }
    try {
      const res = await api.verifyVendorPassword(vendorDevPassword.trim());
      if (res && res.success) {
        setVendorDevUnlocked(true);
        setVendorDevError('');
        showToast('🔓 تم فتح وتفعيل إعدادات المطور بنجاح');
      } else {
        setVendorDevError('❌ رمز المطور غير صحيح!');
      }
    } catch (_) {
      setVendorDevError('❌ خطأ أثناء التحقق من رمز المطور');
    }
  }

  async function handleSaveVendorDevFeatures() {
    setVendorDevSaving(true);
    setVendorDevError('');
    try {
      const res = await api.saveVendorFeatures({
        vendorPassword: vendorDevPassword.trim(),
        features: vendorDevFeatures
      });
      if (res && res.success) {
        showToast('✅ تم حفظ وتطبيق خواص المطور بنجاح');
        await refreshData();
      } else {
        setVendorDevError(res?.error || 'فشل حفظ الخواص');
      }
    } catch (err) {
      setVendorDevError('حدث خطأ أثناء حفظ الإعدادات');
    } finally {
      setVendorDevSaving(false);
    }
  }

  // Isolated Offscreen Printing Helper (eliminates blank pages and routes directly to device)
  function printElementHtml(elementId, { deviceName = '', isA4 = false, paperWidth = '', forceSilent = false, fallbackFn } = {}) {
    const el = document.getElementById(elementId);
    if (!el) {
      if (fallbackFn && !forceSilent) fallbackFn();
      return;
    }
    const clone = el.cloneNode(true);
    if (clone.style) {
      clone.style.removeProperty('top');
      clone.style.removeProperty('left');
      clone.style.removeProperty('z-index');
      clone.style.position = 'static';
      clone.style.display = 'block';
      clone.style.pointerEvents = 'auto';
    }
    const html = clone.outerHTML;
    const shouldPrintSilently = forceSilent || settings.silent_print === '1';

    if (shouldPrintSilently && api.printTicketHtml) {
      api.printTicketHtml({ html, deviceName, isA4, paperWidth: paperWidth || settings.receipt_paper_width || '80', silent: true }).then((res) => {
        if (!res || !res.success) {
          console.warn(`Print to "${deviceName}" failed:`, res?.error);
          if (forceSilent) {
            showToast(`⚠️ تنبيه: تعذر الطباعة على طابعة "${deviceName || 'الافتراضية'}". تأكد من اتصالها وتسميتها بالويندوز.`);
          } else if (fallbackFn) {
            fallbackFn();
          }
        }
      }).catch((err) => {
        console.error(`Print error:`, err);
        if (forceSilent) {
          showToast(`⚠️ خطأ في الاتصال بالطابعة "${deviceName || 'الافتراضية'}".`);
        } else if (fallbackFn) {
          fallbackFn();
        }
      });
    } else {
      if (forceSilent) {
        // عند طلب الطباعة الصامتة ولكن API غير متاح - لا نفتح قائمة الطباعة أبداً
        showToast('⚠️ الطباعة الصامتة غير متاحة حالياً. تأكد من تشغيل البرنامج بنسخة سطح المكتب (Electron).');
      } else if (fallbackFn) {
        fallbackFn();
      } else {
        window.print();
      }
    }
  }

  // Print Receipt (Cashier Printer)
  function printReceipt() {
    setBarTicketOrder(null);
    printElementHtml('printable-receipt', {
      deviceName: settings.printer_name || 'كاشير',
      isA4: false,
      paperWidth: settings.receipt_paper_width || '80',
      fallbackFn: () => {
        window.print();
      }
    });
  }

  async function handleViewReceipt(orderId) {
    try {
      const full = await api.getOrder(orderId);
      if (!full) { showToast('⚠️ تعذر تحميل الفاتورة'); return; }
      setReceiptOrder(full);
    } catch (e) {
      console.error('handleViewReceipt error:', e);
      showToast('❌ تعذر عرض الفاتورة');
    }
  }

  // تجربة واختبار طباعة صفحة تجريبية لأي قسم (الكاشير / البار / الشيشة)
  async function testPrintStation(stationName, printerDeviceName) {
    if (!api.printTicketHtml) {
      showToast('⚠️ ميزة اختبار الطابعة متاحة فقط في تطبيق سطح المكتب');
      return;
    }
    const testHtml = `
      <div style="font-family: Cairo, Tahoma, Arial, sans-serif; text-align: center; padding: 16px; font-size: 13px; direction: rtl; width: 280px; margin: auto; border: 1px solid #111;">
        <h2 style="margin: 0 0 8px 0; border-bottom: 2px dashed #000; padding-bottom: 6px; font-size: 16px; font-weight: bold;">✅ تجربة طباعة ناجحة</h2>
        <div style="margin: 8px 0; font-size: 14px; font-weight: bold; color: #1e3a8a;">قسم: ${stationName}</div>
        <div style="margin: 6px 0; font-size: 12px; color: #333;">اسم الطابعة المحددة:</div>
        <div style="font-weight: bold; font-size: 13px; background: #eee; padding: 4px 8px; border-radius: 4px; display: inline-block; margin-bottom: 8px;">
          ${printerDeviceName || 'طابعة النظام الافتراضية'}
        </div>
        <div style="border-top: 1px dashed #000; margin-top: 10px; padding-top: 6px; font-size: 11px; color: #555;">
          نظام تقفيلة لإدارة الكافيهات والمحلات
          <br />
          ${formatCairoDateTime(new Date())}
        </div>
      </div>
    `;
    try {
      showToast(`⏳ جاري إرسال صفحة تجريبية إلى "${printerDeviceName || 'الافتراضية'}"...`);
      const res = await api.printTicketHtml({
        html: testHtml,
        deviceName: printerDeviceName,
        isA4: false,
        silent: true
      });
      if (res && res.success) {
        showToast(`✅ تمت تجربة الطباعة على "${printerDeviceName || 'الافتراضية'}" بنجاح!`);
      } else {
        showToast(`⚠️ تنبيه: لم تتم الطباعة (${res?.error || 'تأكد من تشغيل الطابعة وتوصيلها وتطابق اسمها'})`);
      }
    } catch (err) {
      showToast(`❌ خطأ أثناء اختبار الطابعة: ${err.message || err}`);
    }
  }

  // إعادة فحص وتحديث قائمة طابعات الويندوز
  async function refreshPrinters() {
    if (api.listPrinters) {
      try {
        const list = await api.listPrinters();
        if (Array.isArray(list)) {
          setAvailablePrinters(list);
          showToast(`✅ تم اكتشاف ${list.length} طابعة في نظام الويندوز`);
          return list;
        }
      } catch (e) {
        console.error('Error refreshing printers:', e);
      }
    }
    showToast('⚠️ تعذر العثور على طابعات جديدة');
    return [];
  }

  // حفظ إعدادات معالج الطابعات لأول مرة
  async function handleSavePrinterWizard(e) {
    if (e && e.preventDefault) e.preventDefault();
    try {
      const updatedSettings = {
        ...settings,
        printer_name: wizardPrinters.printer_name,
        bar_printer_name: wizardPrinters.bar_printer_name,
        shisha_printer_name: wizardPrinters.shisha_printer_name,
        silent_print: wizardPrinters.silent_print,
        printer_setup_done: 'true'
      };
      await api.saveSettings(updatedSettings);
      setSettings(updatedSettings);
      setShowPrinterWizard(false);
      showToast('🎉 تم حفظ وتعيين طابعات النظام بنجاح!');
      refreshData();
    } catch (err) {
      console.error('Failed to save printer wizard settings:', err);
      showToast('❌ حدث خطأ أثناء حفظ إعدادات الطابعات');
    }
  }

  // Helper to identify Shisha / Hookah items
  function isShishaItem(item, categoriesList = categoriesRef.current || categories, productsList = productsRef.current || products) {
    if (!item) return false;
    const name = String(item.product_name || item.name || '').trim().toLowerCase();
    let catName = String(item.category_name || item.category || '').trim().toLowerCase();
    let resolvedCatId = item.category_id;
    if (!resolvedCatId && Array.isArray(productsList)) {
      const pid = item.product_id || item.id;
      const matchedProd = pid ? productsList.find((p) => String(p.id) === String(pid)) : null;
      if (matchedProd) {
        resolvedCatId = matchedProd.category_id;
        if (!catName && matchedProd.category_name) catName = String(matchedProd.category_name).trim().toLowerCase();
      }
    }
    let matchedCat = null;
    if (resolvedCatId && Array.isArray(categoriesList)) {
      matchedCat = categoriesList.find((c) => String(c.id) === String(resolvedCatId));
    }
    const fullCatName = (matchedCat?.name || catName).toLowerCase();
    const catIcon = matchedCat?.icon || '';

    if (
      fullCatName.includes('شيش') ||
      fullCatName.includes('نرجيل') ||
      fullCatName.includes('اركيل') ||
      fullCatName.includes('أركيل') ||
      fullCatName.includes('ارجيل') ||
      fullCatName.includes('أرجيل') ||
      fullCatName.includes('معسل') ||
      fullCatName.includes('حجر') ||
      fullCatName.includes('احجار') ||
      fullCatName.includes('أحجار') ||
      fullCatName.includes('shisha') ||
      fullCatName.includes('hookah') ||
      catIcon === '💨'
    ) return true;
    if (
      name.includes('شيش') ||
      name.includes('معسل') ||
      name.includes('سلوم') ||
      /(?:^|\s)قص(?:\s|$)/.test(name) ||
      name.includes('نرجيل') ||
      name.includes('اركيل') ||
      name.includes('أركيل') ||
      name.includes('ارجيل') ||
      name.includes('أرجيل') ||
      name.includes('تفاحتين') ||
      name.includes('حجر') ||
      name.includes('احجار') ||
      name.includes('أحجار') ||
      name.includes('فحم') ||
      name.includes('لي طبي') ||
      name.includes('راس') ||
      name.includes('رأس') ||
      name.includes('shisha') ||
      name.includes('hookah')
    ) return true;
    return false;
  }

  // فحص ما إذا كانت هناك طابعة شيشة مستقلة ومخصصة فعلياً حتى لا تسقط أصناف الشيشة في العدم
  function hasDedicatedShishaStation() {
    const curSettings = settingsRef.current || settings;
    const curPrinters = availablePrintersRef.current || availablePrinters;
    const shishaName = String(curSettings.shisha_printer_name || '').trim();
    const barName = String(curSettings.bar_printer_name || '').trim();
    if (!shishaName) return false;
    if (barName && shishaName.toLowerCase() === barName.toLowerCase()) return false;
    if (shishaName === 'شيشة' && Array.isArray(curPrinters) && curPrinters.length > 0) {
      return curPrinters.some((p) => {
        const pn = (p.name || '').toLowerCase();
        return pn.includes('شيش') || pn.includes('shisha') || pn.includes('hookah');
      });
    }
    return Boolean(shishaName);
  }

  // Generate Offscreen HTML for Bar preparation ticket
  function generateBarTicketHtml(t) {
    if (!t) return '';
    const tblDisplay = formatTableDisplay(t, tablesRef.current || tables);
              const badgeTitle = t.orderType === 'dine_in'
                ? (tblDisplay.startsWith('طاولة:') ? `🪑 ${tblDisplay}` : `📍 ${tblDisplay}`)
                : (t.orderType === 'takeaway' ? '🛍️ تيك أواي' : (t.orderType === 'delivery' ? '🛵 طلب دليفري' : 'طلب خارجي'));
              const hallTitle = t.orderType === 'dine_in'
                ? (tblDisplay === t.hall ? 'مكان مستقل' : `📍 الصالة: ${t.hall || 'الصالة الرئيسية'}`)
                : 'طلب تسليم خارجي';

              const rows = (t.items || []).map((it) => `
      <tr style="border-bottom: 1.5px dashed #000;">
        <td style="padding: 8px 2px; font-size: 17px; font-weight: 900; color: #000;">
          ${escapeHtml(it.product_name || it.name)}
          ${it.notes ? `<div style="font-size: 13.5px; color: #000; font-weight: 900; margin-top: 4px; border: 1.5px solid #000; padding: 2px 6px; border-radius: 3px; background: #fff;">⚠️ ملاحظة: ${escapeHtml(it.notes)}</div>` : ''}
        </td>
        <td style="padding: 8px 2px; font-size: 24px; font-weight: 900; text-align: center; color: #000;">
          × ${it.printQty || it.qty}
        </td>
      </tr>
    `).join('');

              return `
      <div id="printable-bar-ticket" dir="rtl" style="border: 2px solid #000; padding: 2mm; background: #fff; color: #000; font-family: Cairo, Tahoma, sans-serif;">
        <div style="text-align: center; border-bottom: 2px solid #000; padding-bottom: 8px;">
          <h2 style="font-size: 24px; font-weight: 900; margin: 0 0 6px 0; color: #000;">☕ بون تحضير - البار</h2>
          <div style="border: 2.5px solid #000; border-radius: 6px; padding: 6px 8px; margin: 6px 0; background: #fff; color: #000;">
            <div style="font-size: 23px; font-weight: 900; color: #000; line-height: 1.2;">${badgeTitle}</div>
            <div style="font-size: 14px; font-weight: 800; color: #000; margin-top: 4px;">${hallTitle}</div>
          </div>
          ${t.customerName ? `<div style="font-size: 15px; font-weight: bold; color: #000; margin-top: 4px;">العميل: <strong>${escapeHtml(t.customerName)}</strong></div>` : ''}
          <div style="font-size: 13px; font-weight: 700; margin-top: 4px; color: #000; display: flex; justify-content: space-between; border-top: 1px dashed #000; padding-top: 4px;">
            <span>بون #${escapeHtml(t.id)}</span>
            <span>⏰ ${t.time}</span>
            <span>كاشير: ${escapeHtml(t.cashierName)}</span>
          </div>
        </div>
        <div style="margin: 10px 0;">
          <table style="width: 100%; border-collapse: collapse;">
            <thead>
              <tr style="border-bottom: 2px solid #000; text-align: right;">
                <th style="padding: 6px 2px; font-size: 16px; font-weight: 900; color: #000;">الصنف المطلوب</th>
                <th style="padding: 6px 2px; font-size: 18px; font-weight: 900; text-align: center; width: 75px; color: #000;">العدد</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        ${t.orderNotes ? `<div style="border: 1.5px solid #000; padding: 6px 8px; border-radius: 4px; font-size: 14px; font-weight: 800; color: #000; margin: 8px 0; background: #fff;"><strong>ملاحظات عامة:</strong> ${escapeHtml(t.orderNotes)}</div>` : ''}
        <div style="text-align: center; border-top: 2px solid #000; padding-top: 6px; margin-top: 8px; font-size: 13px; font-weight: 900; color: #000;">
          ** برجاء سرعة التحضير والتسليم ☕ **
        </div>
      </div>
    `;
            }

  // Generate Offscreen HTML for Shisha preparation ticket
  function generateShishaTicketHtml(t) {
    if (!t) return '';
    const tblDisplay = formatTableDisplay(t, tablesRef.current || tables);
              const badgeTitle = t.orderType === 'dine_in'
                ? (tblDisplay.startsWith('طاولة:') ? `🪑 ${tblDisplay}` : `📍 ${tblDisplay}`)
                : (t.orderType === 'takeaway' ? '🛍️ تيك أواي' : (t.orderType === 'delivery' ? '🛵 طلب دليفري' : 'طلب خارجي'));
              const hallTitle = t.orderType === 'dine_in'
                ? (tblDisplay === t.hall ? 'مكان مستقل' : `📍 الصالة: ${t.hall || 'الصالة الرئيسية'}`)
                : 'طلب تسليم خارجي';

              const rows = (t.items || []).map((it) => `
      <tr style="border-bottom: 1.5px dashed #000;">
        <td style="padding: 8px 2px; font-size: 17px; font-weight: 900; color: #000;">
          ${escapeHtml(it.product_name || it.name)}
          ${it.notes ? `<div style="font-size: 13.5px; color: #000; font-weight: 900; margin-top: 4px; border: 1.5px solid #000; padding: 2px 6px; border-radius: 3px; background: #fff;">⚠️ ملاحظة: ${escapeHtml(it.notes)}</div>` : ''}
        </td>
        <td style="padding: 8px 2px; font-size: 24px; font-weight: 900; text-align: center; color: #000;">
          × ${it.printQty || it.qty}
        </td>
      </tr>
    `).join('');

              return `
      <div id="printable-shisha-ticket" dir="rtl" style="border: 2px solid #000; padding: 2mm; background: #fff; color: #000; font-family: Cairo, Tahoma, sans-serif;">
        <div style="text-align: center; border-bottom: 2px solid #000; padding-bottom: 8px;">
          <h2 style="font-size: 24px; font-weight: 900; margin: 0 0 6px 0; color: #000;">💨 بون تحضير - قسم الشيشة</h2>
          <div style="border: 2.5px solid #000; border-radius: 6px; padding: 6px 8px; margin: 6px 0; background: #fff; color: #000;">
            <div style="font-size: 23px; font-weight: 900; color: #000; line-height: 1.2;">${badgeTitle}</div>
            <div style="font-size: 14px; font-weight: 800; color: #000; margin-top: 4px;">${hallTitle}</div>
          </div>
          ${t.customerName ? `<div style="font-size: 15px; font-weight: bold; color: #000; margin-top: 4px;">العميل: <strong>${escapeHtml(t.customerName)}</strong></div>` : ''}
          <div style="font-size: 13px; font-weight: 700; margin-top: 4px; color: #000; display: flex; justify-content: space-between; border-top: 1px dashed #000; padding-top: 4px;">
            <span>بون شيشة #${escapeHtml(t.id)}</span>
            <span>⏰ ${t.time}</span>
            <span>كاشير: ${escapeHtml(t.cashierName)}</span>
          </div>
        </div>
        <div style="margin: 10px 0;">
          <table style="width: 100%; border-collapse: collapse;">
            <thead>
              <tr style="border-bottom: 2px solid #000; text-align: right;">
                <th style="padding: 6px 2px; font-size: 16px; font-weight: 900; color: #000;">الصنف المطلوب</th>
                <th style="padding: 6px 2px; font-size: 18px; font-weight: 900; text-align: center; width: 75px; color: #000;">العدد</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        ${t.orderNotes ? `<div style="border: 1.5px solid #000; padding: 6px 8px; border-radius: 4px; font-size: 14px; font-weight: 800; color: #000; margin: 8px 0; background: #fff;"><strong>ملاحظات عامة:</strong> ${escapeHtml(t.orderNotes)}</div>` : ''}
        <div style="text-align: center; border-top: 2px solid #000; padding-top: 6px; margin-top: 8px; font-size: 13px; font-weight: 900; color: #000;">
          ** برجاء سرعة التحضير والتسليم 💨 **
        </div>
      </div>
    `;
            }

  // Print Bar/Kitchen Ticket (Bar Printer - Always Silent)
  function printBarTicket(ticketData) {
    const curSettings = settingsRef.current || settings;
    const barPrinterName = curSettings.bar_printer_name || 'بار';
    const html = ticketData ? generateBarTicketHtml(ticketData) : (document.getElementById('printable-bar-ticket')?.outerHTML || '');
    if (!html) return;
    if (api.printTicketHtml) {
      api.printTicketHtml({
        html,
        deviceName: barPrinterName,
        isA4: false,
        paperWidth: curSettings.receipt_paper_width || '80',
        silent: true
      }).catch((err) => {
        console.error('Bar print error:', err);
      });
    }
  }

  // Print Shisha Ticket (Dedicated Shisha Printer - Always Silent)
  function printShishaTicket(ticketData) {
    const curSettings = settingsRef.current || settings;
    const shishaPrinterName = curSettings.shisha_printer_name || 'شيشة';
    const html = ticketData ? generateShishaTicketHtml(ticketData) : (document.getElementById('printable-shisha-ticket')?.outerHTML || '');
    if (!html) return;
    if (api.printTicketHtml) {
      api.printTicketHtml({
        html,
        deviceName: shishaPrinterName,
        isA4: false,
        paperWidth: curSettings.receipt_paper_width || '80',
        silent: true
      }).catch((err) => {
        console.error('Shisha print error:', err);
      });
    }
  }

                function printBarTicketFromReceipt(order) {
                  if (!order) return;
                  const items = (order.items || []).map((it) => ({
                    id: it.product_id || it.id,
                    product_id: it.product_id || it.id,
                    category_id: it.category_id || null,
                    category_name: it.category_name || '',
                    name: it.product_name || it.name,
                    product_name: it.product_name || it.name,
                    qty: it.qty,
                    printQty: it.qty,
                    notes: it.notes || ''
                  }));
                  const t = {
                    id: order.invoiceNo || order.invoice_no || order.id || Date.now().toString().slice(-4),
                    tableName: order.tableName || order.table_name || (order.tableNumber || order.table_number ? `طاولة رقم ${order.tableNumber || order.table_number}` : (order.orderType === 'dine_in' ? 'صالة' : 'تيك أواي')),
                    tableNumber: order.tableNumber || order.table_number || '',
                    hall: order.hall || order.table_hall || (order.orderType === 'dine_in' ? 'صالة داخلية' : 'تيك أواي'),
                    orderType: order.orderType || 'dine_in',
                    customerName: order.customerName || order.customer_name || '',
                    cashierName: order.cashierName || order.cashier_name || currentUser?.name || 'كاشير',
                    time: formatShiftTime(order.createdAt || order.created_at || Date.now()),
                    items,
                    orderNotes: order.notes || ''
                  };

                  const separateShisha = hasDedicatedShishaStation();
                  const shishaItems = separateShisha ? items.filter((it) => isShishaItem(it, categories)) : [];
                  const barItems = separateShisha ? items.filter((it) => !isShishaItem(it, categories)) : items;

                  setReceiptOrder(null);
                  if (barItems.length > 0 && shishaItems.length > 0) {
                    const barTicket = { ...t, id: Date.now().toString().slice(-4), items: barItems, ticketType: 'bar' };
                    const shishaTicket = { ...t, id: (Date.now() + 1).toString().slice(-4), items: shishaItems, ticketType: 'shisha' };
                    setBarTicketOrder(barTicket);
                    setShishaTicketOrder(shishaTicket);
                    setTimeout(() => { printBarTicket(barTicket); }, 150);
                    setTimeout(() => { printShishaTicket(shishaTicket); }, 650);
                    showToast(`☕💨 تم إرسال (${barItems.length}) صنف للبار و (${shishaItems.length}) صنف للشيشة!`);
                  } else if (shishaItems.length > 0) {
                    const shishaTicket = { ...t, id: Date.now().toString().slice(-4), items: shishaItems, ticketType: 'shisha' };
                    setShishaTicketOrder(shishaTicket);
                    setBarTicketOrder(null);
                    setTimeout(() => { printShishaTicket(shishaTicket); }, 150);
                    showToast(`💨 تم إرسال (${shishaItems.length}) صنف لطابعة الشيشة!`);
                  } else if (barItems.length > 0) {
                    const barTicket = { ...t, id: Date.now().toString().slice(-4), items: barItems, ticketType: 'bar' };
                    setBarTicketOrder(barTicket);
                    setShishaTicketOrder(null);
                    setTimeout(() => { printBarTicket(barTicket); }, 150);
                    showToast(`☕ تم إرسال (${barItems.length}) صنف لطابعة البار!`);
                  }
                }

                function printShishaTicketFromReceipt(order) {
                  if (!order) return;
                  const items = (order.items || [])
                    .filter((it) => isShishaItem(it, categories))
                    .map((it) => ({
                      name: it.product_name || it.name,
                      product_name: it.product_name || it.name,
                      qty: it.qty,
                      printQty: it.qty,
                      notes: it.notes || ''
                    }));
                  if (items.length === 0) {
                    showToast('ℹ️ لا توجد أصناف شيشة في هذا الطلب');
                    return;
                  }
                  const t = {
                    id: order.invoiceNo || order.invoice_no || order.id || Date.now().toString().slice(-4),
                    tableName: order.tableName || order.table_name || (order.tableNumber || order.table_number ? `طاولة رقم ${order.tableNumber || order.table_number}` : (order.orderType === 'dine_in' ? 'صالة' : 'تيك أواي')),
                    tableNumber: order.tableNumber || order.table_number || '',
                    hall: order.hall || order.table_hall || (order.orderType === 'dine_in' ? 'صالة داخلية' : 'تيك أواي'),
                    orderType: order.orderType || 'dine_in',
                    customerName: order.customerName || order.customer_name || '',
                    cashierName: order.cashierName || order.cashier_name || currentUser?.name || 'كاشير',
                    time: formatShiftTime(order.createdAt || order.created_at || Date.now()),
                    items,
                    orderNotes: order.notes || '',
                    ticketType: 'shisha'
                  };
                  setShishaTicketOrder(t);
                  setTimeout(() => {
                    printShishaTicket(t);
                  }, 150);
                }

                // Print Bar Void / Cancellation Ticket (Bar Printer)
                function printBarVoidTicket(ticketData) {
                  setReceiptOrder(null);
                  setBarTicketOrder(null);
                  const barPrinterName = settings.bar_printer_name || 'بار';
                  printElementHtml('printable-bar-void', {
                    deviceName: barPrinterName,
                    isA4: false,
                    fallbackFn: () => window.print()
                  });
                }

                // Print Report (Thermal or A4)
                function printReport() {
                  printElementHtml('printable-report', {
                    deviceName: settings.printer_name || 'كاشير',
                    isA4: printReportFormat === 'a4',
                    fallbackFn: () => window.print()
                  });
                }

                // Print Expenses (Voucher or Shift Statement)
                function handlePrintExpenses() {
                  printElementHtml('printable-expenses', {
                    deviceName: settings.printer_name || 'الكاشير',
                    isA4: false,
                    fallbackFn: () => window.print()
                  });
                }

                // Category Reordering Handler (Move Up / Down)
                async function handleMoveCategory(index, direction) {
                  const newCategories = [...categories];
                  const targetIndex = index + direction;
                  if (targetIndex < 0 || targetIndex >= newCategories.length) return;

                  const temp = newCategories[index];
                  newCategories[index] = newCategories[targetIndex];
                  newCategories[targetIndex] = temp;

                  setCategories(newCategories);

                  try {
                    const orderedIds = newCategories.map(c => c.id);
                    await api.reorderCategories(orderedIds);
                    showToast('✅ تم تحديث ترتيب الأقسام بنجاح!');
                  } catch (err) {
                    console.error(err);
                    showToast('❌ تعذر حفظ ترتيب الأقسام');
                    refreshData();
                  }
                }

                // Category Save / Add
                async function handleSaveCategory(e) {
                  if (e) e.preventDefault();
                  if (!categoryForm.name || !categoryForm.name.trim()) {
                    showToast('⚠️ يرجى إدخال اسم القسم');
                    return;
                  }
                  try {
                    await api.saveCategory({
                      id: categoryForm.id || undefined,
                      name: categoryForm.name.trim(),
                      icon: categoryForm.icon || '☕',
                      sort_order: categories.length + 1
                    });
                    setCategoryModal(false);
                    setCategoryForm({ id: null, name: '', icon: '☕' });
                    showToast('✅ تم حفظ القسم بنجاح');
                    refreshData();
                  } catch (err) {
                    console.error(err);
                    showToast('❌ حدث خطأ أثناء حفظ القسم');
                  }
                }

                // Category Delete
                async function handleDeleteCategory(id) {
                  const prodsInCat = products.filter(p => p.category_id === id);
                  if (prodsInCat.length > 0) {
                    alert(`⚠️ لا يمكن حذف هذا القسم لأنه يحتوي على (${prodsInCat.length}) صنف مسجل في المنيو. يرجى نقل أو حذف أصنافه أولاً.`);
                    return;
                  }
                  if (!window.confirm('هل أنت متأكد من حذف هذا القسم؟')) return;
                  try {
                    const res = await api.deleteCategory(id);
                    if (res && res.error) {
                      showToast(`❌ ${res.error}`);
                    } else {
                      showToast('🗑️ تم حذف القسم بنجاح');
                      refreshData();
                    }
                  } catch (err) {
                    console.error(err);
                    showToast('❌ حدث خطأ أثناء حذف القسم');
                  }
                }

                // System Reset Confirmation Handler
                async function handleConfirmSystemReset(e) {
                  if (e) e.preventDefault();
                  if (!systemResetPassword || !systemResetPassword.trim()) {
                    setSystemResetError('يرجى إدخال كلمة مرور الأدمن للموافقة');
                    return;
                  }
                  setSystemResetLoading(true);
                  setSystemResetError('');
                  try {
                    const keepMenu = systemResetType === 'transactions_only';
                    const res = await api.systemReset({ keepMenu, adminPassword: systemResetPassword });
                    if (!res || !res.success) {
                      setSystemResetError(res?.error || 'كلمة المرور غير صحيحة أو فشلت العملية');
                      setSystemResetLoading(false);
                      return;
                    }
                    setSystemResetModal(false);
                    setSystemResetPassword('');
                    setTableCartsMap({});
                    try { localStorage.removeItem('cafepos_table_carts'); } catch (_) { }
                    showToast(res.message || '✅ تم إعادة ضبط النظام بنجاح!');
                    await refreshData();
                    await loadOrders();
                    await loadAllShifts();
                    if (!keepMenu) {
                      setActiveTab('pos');
                    }
                  } catch (err) {
                    console.error(err);
                    setSystemResetError(err.message || 'حدث خطأ أثناء إعادة ضبط النظام');
                  } finally {
                    setSystemResetLoading(false);
                  }
                }

                // Handle Sending Unsent Items to Bar
                async function handleSendToBar() {
                  if (cart.length === 0) {
                    showToast('⚠️ السلة فارغة! أضف أصنافاً أولاً لإرسالها للبار.');
                    return;
                  }

                  // ثغرة الأمان: لو النوع dine_in لازم يكون فيه طاولة محددة
                  if (orderType === 'dine_in' && !selectedTable) {
                    showToast('⚠️ يرجى اختيار طاولة أولاً قبل الإرسال للبار!');
                    return;
                  }

                  // Find items that have new/unsent quantities
                  const itemsToSend = cart
                    .map((item) => {
                      const sent = Number(item.sent_qty) || 0;
                      const unsentQty = item.qty - sent;
                      return {
                        ...item,
                        printQty: unsentQty
                      };
                    })
                    .filter((item) => item.printQty > 0);

                  if (itemsToSend.length === 0) {
                    showToast('ℹ️ جميع الأصناف الحالية في السلة تم إرسالها للبار مسبقاً!');
                    return;
                  }

                  // Mark all items as sent
                  const updatedCart = cart.map((item) => ({
                    ...item,
                    sent_qty: item.qty
                  }));

                  setCart(updatedCart);
                  if (orderType === 'dine_in' && selectedTable) {
                    setTableCartsMap((tm) => ({
                      ...tm,
                      [selectedTable.id]: {
                        ...(tm[selectedTable.id] || {}),
                        cart: updatedCart,
                        customerName,
                        discountAmount,
                        orderNotes
                      }
                    }));
                    if (api.saveTableCart) {
                      api.saveTableCart(selectedTable.id, {
                        ...(tableCartsMap[selectedTable.id] || {}),
                        cart: updatedCart,
                        customerName,
                        discountAmount,
                        orderNotes
                      }).catch(console.error);
                    }
                  } else if (orderType === 'takeaway' && activeTakeawayId) {
                    setTakeawayTabs((prev) => {
                      const next = prev.map((t) => (t.id === activeTakeawayId ? {
                        ...t,
                        cart: updatedCart,
                        customerName,
                        customerPhone,
                        customerAddress,
                        discountAmount,
                        orderNotes
                      } : t));
                      try { localStorage.setItem('cafepos_takeaway_tabs', JSON.stringify(next)); } catch (_) { }
                      return next;
                    });
                  }

                  // Separate items into Bar items and Shisha items (only if dedicated shisha printer exists)
                  const separateShisha = hasDedicatedShishaStation();
                  const shishaItems = separateShisha ? itemsToSend.filter((it) => isShishaItem(it, categories)) : [];
                  const barItems = separateShisha ? itemsToSend.filter((it) => !isShishaItem(it, categories)) : itemsToSend;

                  const baseTicketInfo = {
                    tableName: (orderType === 'dine_in' && selectedTable) ? (selectedTable.name || (selectedTable.number ? `طاولة رقم ${selectedTable.number}` : 'صالة')) : (orderType === 'takeaway' ? 'تيك أواي' : (orderType === 'delivery' ? 'دليفري' : 'طلب خارجي')),
                    tableNumber: (orderType === 'dine_in' && selectedTable) ? (selectedTable.number || '') : '',
                    hall: (orderType === 'dine_in' && selectedTable) ? (selectedTable.hall === 'indoor' ? 'صالة داخلية' : (selectedTable.hall === 'outdoor' ? 'صالة خارجية' : (selectedTable.hall || 'صالة داخلية'))) : '',
                    orderType: orderType,
                    customerName: customerName || '',
                    cashierName: currentUser?.name || 'كاشير',
                    time: formatShiftTime(new Date()),
                    orderNotes: orderNotes || ''
                  };

                  setReceiptOrder(null);

                  // Case 1: Both Bar and Shisha items present
                  if (barItems.length > 0 && shishaItems.length > 0) {
                    const barTicket = { ...baseTicketInfo, id: Date.now().toString().slice(-4), items: barItems, ticketType: 'bar' };
                    const shishaTicket = { ...baseTicketInfo, id: (Date.now() + 1).toString().slice(-4), items: shishaItems, ticketType: 'shisha' };
                    printBarTicket(barTicket);
                    setTimeout(() => { printShishaTicket(shishaTicket); }, 300);
                    showToast(`☕💨 تم إرسال أصناف البار لطابعة (بار) وأصناف الشيشة لطابعة (شيشة) بنجاح!`);
                  }
                  // Case 2: Only Shisha items present
                  else if (shishaItems.length > 0) {
                    const shishaTicket = { ...baseTicketInfo, id: Date.now().toString().slice(-4), items: shishaItems, ticketType: 'shisha' };
                    printShishaTicket(shishaTicket);
                    showToast(`💨 تم إرسال (${shishaItems.length}) صنف شيشة لطابعة (شيشة) بنجاح!`);
                  }
                  // Case 3: Only Bar items present
                  else if (barItems.length > 0) {
                    const barTicket = { ...baseTicketInfo, id: Date.now().toString().slice(-4), items: barItems, ticketType: 'bar' };
                    printBarTicket(barTicket);
                    showToast(`☕ تم إرسال (${barItems.length}) صنف لطابعة (بار) بنجاح! تم قفل التعديل عليها.`);
                  }
                }

                // Handle Pre-Bill Guest Check Printing (طباعة شيك الحساب للعميل قبل إتمام الطلب)
                // الإصلاح: يطبع مباشرة بدون فتح مودال الفاتورة الكبير (لا يكسر الـ UI)
                // Handle Pre-Bill Guest Check Printing (طباعة شيك الحساب للعميل قبل إتمام الطلب)
                function handlePrintPreBillCheck(targetTbl = null, targetCart = null, forcePrint = false) {
                  const tbl = targetTbl || selectedTable;
                  const currentCartItems = targetCart || cart;
                  if (!currentCartItems || currentCartItems.length === 0) {
                    showToast('⚠️ السلة فارغة! لا توجد أصناف لطباعة الشيك');
                    return;
                  }

                  // شرط: يجب إرسال جميع الأصناف للبار قبل طباعة الشيك (إذا كانت خاصية طلبات البار مفعلة)
                  const isBarOrderEnabled = (vendorDevFeatures.enable_bar_order !== false && settings.enable_bar_order !== 'false');
                  if (isBarOrderEnabled) {
                    const unsentCount = currentCartItems.reduce(
                      (acc, it) => acc + Math.max(0, it.qty - (Number(it.sent_qty) || 0)),
                      0
                    );
                    if (unsentCount > 0 && !forcePrint) {
                      showToast(`⚠️ لا يمكن طباعة الشيك! يوجد ${unsentCount} صنف لم يُرسل للبار بعد. اضغط (إرسال للبار) أولاً ثم اطبع الشيك.`);
                      return;
                    }
                  }

                  // منع تكرار طباعة الشيك إلا بموافقة الأدمن
                  if (tbl && tableCartsMap[tbl.id]?.printedCheck && !forcePrint) {
                    handleRequestAdminAuth({
                      type: 'reprint_prebill_check',
                      table: tbl,
                      cart: currentCartItems
                    });
                    return;
                  }

                  const isDineIn = Boolean(tbl);
                  const tblName = isDineIn ? (tbl.name || tbl.number) : 'تيك أواي';
                  const printTime = Date.now();

                  // 1. تسجيل حالة الشيك وحفظها للطاولة إن وجدت
                  if (tbl) {
                    const existingData = tableCartsMap[tbl.id] || tableCartsMap[String(tbl.id)] || {};
                    const updatedTableData = {
                      ...existingData,
                      cart: [...currentCartItems],
                      customerName: targetCart ? (existingData.customerName || '') : customerName,
                      customerPhone: targetCart ? (existingData.customerPhone || '') : customerPhone,
                      discountAmount: targetCart ? (existingData.discountAmount || 0) : discountAmount,
                      orderNotes: targetCart ? (existingData.orderNotes || '') : orderNotes,
                      printedCheck: true,
                      printedCheckTime: printTime,
                      _force: true
                    };

                    setTableCartsMap((prev) => {
                      const nextMap = { ...prev, [tbl.id]: updatedTableData, [String(tbl.id)]: updatedTableData };
                      try { localStorage.setItem('cafepos_table_carts', JSON.stringify(nextMap)); } catch (_) { }
                      return nextMap;
                    });

                    if (api.saveTableCart) {
                      api.saveTableCart(tbl.id, updatedTableData).then((res) => {
                        if (res && res.conflict && res.current) {
                          const sc = { ...res.current, printedCheck: true, printedCheckTime: printTime };
                          mutationSeqRef.current += 1;
                          setTableCartsMap((p) => ({ ...p, [tbl.id]: sc, [String(tbl.id)]: sc }));
                          prevTableCartsRef.current = { ...prevTableCartsRef.current, [tbl.id]: sc, [String(tbl.id)]: sc };
                        } else if (res && res.success === false && !res.conflict) {
                          console.warn('[printedCheck] Save failed:', res.error);
                        }
                      }).catch(console.error);
                    }
                  }

                  const subTotalVal = fromCents(currentCartItems.reduce((sum, it) => sum + Math.round(toCents(it.price) * (Number(it.qty) || 0)), 0));
                  const discVal = tbl ? (tableCartsMap[tbl.id]?.discountAmount || 0) : discountAmount;
                  const totalVal = Math.max(0, subMoney(subTotalVal, discVal));

                  // 2. بناء بيانات الشيك للطباعة المباشرة
                  const checkReceipt = {
                    orderId: 'شيك-معلق',
                    invoiceNo: isDineIn ? `شيك-${tblName}` : '',
                    isPreBillCheck: true,
                    items: currentCartItems.map((it) => ({
                      product_name: it.name,
                      name: it.name,
                      qty: it.qty,
                      unit_price: it.price,
                      price: it.price,
                      notes: it.notes || ''
                    })),
                    subtotal: subTotalVal,
                    discount: discVal,
                    total: totalVal,
                    paymentMethod: 'pending_check',
                    changeDue: 0,
                    createdAt: new Date().toISOString(),
                    orderType: tbl ? 'dine_in' : 'takeaway',
                    tableName: tbl?.name || 'تيك أواي',
                    tableNumber: tbl?.number || '',
                    hall: tbl?.hall || '',
                    table_hall: tbl?.hall || '',
                    customerName: (tbl ? tableCartsMap[tbl.id]?.customerName : customerName) || '',
                    customerPhone: (tbl ? (tableCartsMap[tbl.id]?.customerPhone || '') : customerPhone) || '',
                    customerAddress: (tbl ? (tableCartsMap[tbl.id]?.customerAddress || '') : customerAddress) || '',
                    notes: (tbl ? tableCartsMap[tbl.id]?.orderNotes : orderNotes) || '',
                    cashierName: currentUser?.name || currentUser?.username || 'كاشير'
                  };

                  // 3. طباعة شيك الحساب للعميل على طابعة الكاشير
                  const cashierPrinter = settings.printer_name || 'كاشير';
                  setPreBillCheckData(checkReceipt);
                  showToast(`🔔 ${tblName} - جاري طباعة شيك الحساب للعميل...`);
                  setTimeout(() => {
                    printElementHtml('printable-prebill-check', {
                      deviceName: cashierPrinter,
                      isA4: false,
                      fallbackFn: () => {
                        setReceiptOrder(checkReceipt);
                      }
                    });
                    showToast(`✅ تم إرسال شيك حساب ${tblName} لطابعة الكاشير (${cashierPrinter}) 🔔`);
                  }, 200);
                }

                // Sync active theme mode ('dark' | 'latte') to body class & localStorage
                const activeAppTheme = settings?.app_theme || (typeof localStorage !== 'undefined' && localStorage.getItem('cafepos_app_theme')) || 'dark';
                if (typeof document !== 'undefined') {
                  document.body.classList.toggle('theme-latte', activeAppTheme === 'latte');
                }
                if (settings?.app_theme) {
                  try { localStorage.setItem('cafepos_app_theme', settings.app_theme); } catch (_) { }
                }

                // Loading view
                if (appLoading) {
                  return (
                    <div className="fullscreen-center">
                      <div className="loader-box">
                        <div className="spinner"></div>
                        <h2>جاري تشغيل نظام الكافيه...</h2>
                        <p>تحميل قاعدة البيانات والمخزون في وضع غير متصل (Offline)</p>
                      </div>
                    </div>
                  );
                }

                // ================= LOGIN / LOCK SCREEN =================
                if (!currentUser) {
                  return (
                    <LoginScreen
                      pendingLogin={pendingLogin}
                      closeSummary={closeSummary}
                      emergencyConfirmPass={emergencyConfirmPass}
                      emergencyError={emergencyError}
                      emergencyNewPass={emergencyNewPass}
                      emergencyPin={emergencyPin}
                      emergencyResetModal={emergencyResetModal}
                      emergencySuccess={emergencySuccess}
                      handleEmergencyReset={handleEmergencyReset}
                      handleLogin={handleLogin}
                      licenseData={licenseData}
                      loginError={loginError}
                      loginFailCount={loginFailCount}
                      loginForm={loginForm}
                      setCloseSummary={setCloseSummary}
                      setEmergencyConfirmPass={setEmergencyConfirmPass}
                      setEmergencyError={setEmergencyError}
                      setEmergencyNewPass={setEmergencyNewPass}
                      setEmergencyPin={setEmergencyPin}
                      setEmergencyResetModal={setEmergencyResetModal}
                      setEmergencySuccess={setEmergencySuccess}
                      setLoginForm={setLoginForm}
                      settings={settings}
                    />
                  );
                }

                // ================= SHIFT OPENING SCREEN =================
                if (!shift) {
                  return (
                    <ShiftOpenScreen
                      pendingOpenShift={pendingOpenShift}
                      closeSummary={closeSummary}
                      currentUser={currentUser}
                      handleLogout={handleLogout}
                      handleOpenShift={handleOpenShift}
                      openingCashInput={openingCashInput}
                      openingNotesInput={openingNotesInput}
                      setOpeningCashInput={setOpeningCashInput}
                      setOpeningNotesInput={setOpeningNotesInput}
                      setShiftTypeInput={setShiftTypeInput}
                      settings={settings}
                      shiftSchedules={shiftSchedules}
                      shiftTypeInput={shiftTypeInput}
                    />
                  );
                }

                return (
                  <div className="app-container">
                    {/* Top Header */}
                    <AppHeader
                      currentUser={currentUser}
                      handleLogout={handleLogout}
                      handleReturnToCashier={handleReturnToCashier}
                      loadExpensesList={loadExpensesList}
                      savedCashierUser={savedCashierUser}
                      setAdminOverlayError={setAdminOverlayError}
                      setAdminOverlayModal={setAdminOverlayModal}
                      setAdminOverlayPassword={setAdminOverlayPassword}
                      setCloseShiftModal={setCloseShiftModal}
                      setExpenseModal={setExpenseModal}
                      setExpensesModal={setExpensesModal}
                      settings={settings}
                      shift={shift}
                      vendorDevFeatures={vendorDevFeatures}
                    />

                    {/* Main Tabs Navigation - Role Based */}
                    <TabNavigation
                      activeTab={activeTab}
                      currentUser={currentUser}
                      debtsList={debtsList}
                      loadDebts={loadDebts}
                      setActiveTab={setActiveTab}
                      setNotebookModal={setNotebookModal}
                      vendorDevFeatures={vendorDevFeatures}
                    />

                    {/* Content Area */}
                    <div className="main-content">
                      {/* ================= POS SCREEN ================= */}
                      {activeTab === 'pos' && (
                        <PosTab
                          pendingSendToBar={pendingSendToBar}
                          activeCategory={activeCategory}
                          activeTakeawayId={activeTakeawayId}
                          addToCart={addToCart}
                          cart={cart}
                          cartSubtotal={cartSubtotal}
                          cartTotal={cartTotal}
                          categories={categories}
                          changeDue={changeDue}
                          clearCart={clearCart}
                          closeTakeawayTab={closeTakeawayTab}
                          createNewTakeawayTab={createNewTakeawayTab}
                          currentUser={currentUser}
                          customerAddress={customerAddress}
                          customerName={customerName}
                          customerPhone={customerPhone}
                          customerSuggestions={customerSuggestions}
                          debtsGroupedList={debtsGroupedList}
                          debtsList={debtsList}
                          discountAmount={discountAmount}
                          handleCheckout={handleCheckout}
                          handleCustomerAddressChange={handleCustomerAddressChange}
                          handleCustomerPhoneChange={handleCustomerPhoneChange}
                          handleOpenTransferItemModal={handleOpenTransferItemModal}
                          handlePrintPreBillCheck={handlePrintPreBillCheck}
                          handleRequestAdminAuth={handleRequestAdminAuth}
                          handleSendToBar={handleSendToBar}
                          isCheckingOut={isCheckingOut}
                          loadDebts={loadDebts}
                          mutationSeqRef={mutationSeqRef}
                          orderNotes={orderNotes}
                          orderType={orderType}
                          paidAmount={paidAmount}
                          paymentMethod={paymentMethod}
                          prevTableCartsRef={prevTableCartsRef}
                          removeFromCart={removeFromCart}
                          saveTableCartTimeoutRef={saveTableCartTimeoutRef}
                          searchQuery={searchQuery}
                          sections={sections}
                          selectCustomerSuggestion={selectCustomerSuggestion}
                          selectedTable={selectedTable}
                          setActiveCategory={setActiveCategory}
                          setCart={setCart}
                          setCategoryManagerModal={setCategoryManagerModal}
                          setCustomerAddress={setCustomerAddress}
                          setCustomerName={setCustomerName}
                          setCustomerPhone={setCustomerPhone}
                          setCustomerSuggestions={setCustomerSuggestions}
                          setDiscountAmount={setDiscountAmount}
                          setNoteModal={setNoteModal}
                          setNoteModalText={setNoteModalText}
                          setNotebookModal={setNotebookModal}
                          setOrderNotes={setOrderNotes}
                          setOrderType={setOrderType}
                          setPaidAmount={setPaidAmount}
                          setPaymentMethod={setPaymentMethod}
                          setSearchQuery={setSearchQuery}
                          setShowCustomerSuggestions={setShowCustomerSuggestions}
                          setSplitCash={setSplitCash}
                          setSplitWallet={setSplitWallet}
                          setTableCartsMap={setTableCartsMap}
                          setTakeawayTabs={setTakeawayTabs}
                          setTransferModal={setTransferModal}
                          setTransferTargetId={setTransferTargetId}
                          settings={settings}
                          showCustomerSuggestions={showCustomerSuggestions}
                          showToast={showToast}
                          splitCash={splitCash}
                          splitWallet={splitWallet}
                          switchTable={switchTable}
                          switchTakeawayTab={switchTakeawayTab}
                          tableCartsMap={tableCartsMap}
                          tables={tables}
                          takeawayTabs={takeawayTabs}
                          toggleHoldTakeawayTab={toggleHoldTakeawayTab}
                          updateQty={updateQty}
                          vendorDevFeatures={vendorDevFeatures}
                          visibleProducts={visibleProducts}
                        />
                      )}

                      {/* ================= TABLES SCREEN ================= */}
                      {activeTab === 'tables' && (
                        <TablesTab
                          activeHallFilter={activeHallFilter}
                          handlePrintPreBillCheck={handlePrintPreBillCheck}
                          handleSelectTable={handleSelectTable}
                          inFlightTablesRef={inFlightTablesRef}
                          qrInfo={qrInfo}
                          sections={sections}
                          setActiveHallFilter={setActiveHallFilter}
                          setTables={setTables}
                          setTransferModal={setTransferModal}
                          setTransferTargetId={setTransferTargetId}
                          settings={settings}
                          showAllTablesTab={showAllTablesTab}
                          showToast={showToast}
                          tableCartsMap={tableCartsMap}
                          tableSessionTimesRef={tableSessionTimesRef}
                          tables={tables}
                          vendorDevFeatures={vendorDevFeatures}
                        />
                      )}

                      {/* ================= ORDERS HISTORY ================= */}
                      {activeTab === 'orders' && (
                        <OrdersTab
                          currentUser={currentUser}
                          debtsList={debtsList}
                          handleCancelOrder={handleCancelOrder}
                          handleExportOrders={handleExportOrders}
                          handleRestoreOrder={handleRestoreOrder}
                          loadDebts={loadDebts}
                          loadOrders={loadOrders}
                          orderCashierFilter={orderCashierFilter}
                          orderDateFilter={orderDateFilter}
                          orderDateMode={orderDateMode}
                          orderSearchQuery={orderSearchQuery}
                          orderTypeFilter={orderTypeFilter}
                          ordersList={ordersList}
                          setNotebookModal={setNotebookModal}
                          setOrderCashierFilter={setOrderCashierFilter}
                          setOrderDateFilter={setOrderDateFilter}
                          setOrderDateMode={setOrderDateMode}
                          setOrderSearchQuery={setOrderSearchQuery}
                          setOrderTypeFilter={setOrderTypeFilter}
                          setPayAmountInput={setPayAmountInput}
                          setPayDebtData={setPayDebtData}
                          setPayNotesInput={setPayNotesInput}
                          setReceiptOrder={setReceiptOrder}
                          settings={settings}
                          shift={shift}
                          usersList={usersList}
                        />
                      )}

                      {/* ================= MENU & STOCK ================= */}
                      {activeTab === 'menu' && (
                        <MenuTab
                          categories={categories}
                          filteredMenuProducts={filteredMenuProducts}
                          handleDeleteProduct={handleDeleteProduct}
                          menuActiveCategoryFilter={menuActiveCategoryFilter}
                          menuLowStockOnly={menuLowStockOnly}
                          menuSearchQuery={menuSearchQuery}
                          products={products}
                          setCategoryManagerModal={setCategoryManagerModal}
                          setMenuActiveCategoryFilter={setMenuActiveCategoryFilter}
                          setMenuLowStockOnly={setMenuLowStockOnly}
                          setMenuSearchQuery={setMenuSearchQuery}
                          setProductForm={setProductForm}
                          setProductModal={setProductModal}
                          settings={settings}
                        />
                      )}

                      {/* ================= REPORTS & ANALYTICS ================= */}
                      {activeTab === 'reports' && (
                        <ReportsTab
                          allShiftsList={allShiftsList}
                          currentUser={currentUser}
                          dashboardData={dashboardData}
                          filteredShiftsList={filteredShiftsList}
                          handleDeleteExpense={handleDeleteExpense}
                          handleExportCsv={handleExportCsv}
                          handleGenerateReport={handleGenerateReport}
                          handleQuickDate={handleQuickDate}
                          handleViewReceipt={handleViewReceipt}
                          invProductFilter={invProductFilter}
                          inventoryFilterMode={inventoryFilterMode}
                          inventorySearch={inventorySearch}
                          loadAllShifts={loadAllShifts}
                          loadDashboard={loadDashboard}
                          loadUsersAndAttendance={loadUsersAndAttendance}
                          reportData={reportData}
                          reportDateFrom={reportDateFrom}
                          reportDatePreset={reportDatePreset}
                          reportDateTo={reportDateTo}
                          reportLoading={reportLoading}
                          reportShiftDateFilter={reportShiftDateFilter}
                          reportShiftDateMode={reportShiftDateMode}
                          reportShiftId={reportShiftId}
                          reportShiftTypeFilter={reportShiftTypeFilter}
                          reportShiftUserFilter={reportShiftUserFilter}
                          reportUserId={reportUserId}
                          reportsTab={reportsTab}
                          selectedDailyShiftIds={selectedDailyShiftIds}
                          setActiveReportForPrint={setActiveReportForPrint}
                          setActiveTab={setActiveTab}
                          setEditExpenseForm={setEditExpenseForm}
                          setEditingExpense={setEditingExpense}
                          setExpenseModal={setExpenseModal}
                          setInvProductFilter={setInvProductFilter}
                          setInventoryFilterMode={setInventoryFilterMode}
                          setInventorySearch={setInventorySearch}
                          setPrintReportFormat={setPrintReportFormat}
                          setReportData={setReportData}
                          setReportDateFrom={setReportDateFrom}
                          setReportDatePreset={setReportDatePreset}
                          setReportDateTo={setReportDateTo}
                          setReportShiftDateFilter={setReportShiftDateFilter}
                          setReportShiftDateMode={setReportShiftDateMode}
                          setReportShiftId={setReportShiftId}
                          setReportShiftTypeFilter={setReportShiftTypeFilter}
                          setReportShiftUserFilter={setReportShiftUserFilter}
                          setReportUserId={setReportUserId}
                          setReportsTab={setReportsTab}
                          setSelectedDailyShiftIds={setSelectedDailyShiftIds}
                          setShiftReportSection={setShiftReportSection}
                          settings={settings}
                          shift={shift}
                          shiftReportSection={shiftReportSection}
                          showToast={showToast}
                          usersList={usersList}
                        />
                      )}


                      {/* ================= SETTINGS ================= */}
                      {activeTab === 'settings' && (
                        <SettingsTab
                          availablePrinters={availablePrinters}
                          currentUser={currentUser}
                          handleDeleteSection={handleDeleteSection}
                          handleDialogBackup={handleDialogBackup}
                          handleDialogRestore={handleDialogRestore}
                          handleResetSectionTables={handleResetSectionTables}
                          handleSaveSettings={handleSaveSettings}
                          handleSaveVendorDevFeatures={handleSaveVendorDevFeatures}
                          handleToggleShowAllTablesTab={handleToggleShowAllTablesTab}
                          handleUnlockVendorDev={handleUnlockVendorDev}
                          licenseData={licenseData}
                          qrInfo={qrInfo}
                          refreshData={refreshData}
                          sectionRanges={sectionRanges}
                          sectionTableCounts={sectionTableCounts}
                          sections={sections}
                          setActiveTab={setActiveTab}
                          setSectionForm={setSectionForm}
                          setSectionModal={setSectionModal}
                          setSectionRanges={setSectionRanges}
                          setSettings={setSettings}
                          setShiftSchedules={setShiftSchedules}
                          setShowPrinterWizard={setShowPrinterWizard}
                          setSystemResetError={setSystemResetError}
                          setSystemResetModal={setSystemResetModal}
                          setSystemResetPassword={setSystemResetPassword}
                          setSystemResetType={setSystemResetType}
                          setVendorDevFeatures={setVendorDevFeatures}
                          setVendorDevPassword={setVendorDevPassword}
                          setVendorDevUnlocked={setVendorDevUnlocked}
                          setWizardPrinters={setWizardPrinters}
                          settings={settings}
                          shiftSchedules={shiftSchedules}
                          showAllTablesTab={showAllTablesTab}
                          showToast={showToast}
                          tables={tables}
                          testPrintStation={testPrintStation}
                          vendorDevError={vendorDevError}
                          vendorDevFeatures={vendorDevFeatures}
                          vendorDevPassword={vendorDevPassword}
                          vendorDevSaving={vendorDevSaving}
                          vendorDevUnlocked={vendorDevUnlocked}
                        />
                      )}
                      {/* ================= USERS & SHIFTS MANAGEMENT ================= */}
                      {activeTab === 'users' && currentUser?.role === 'admin' && (
                        <UsersTab
                          adjTypeFilter={adjTypeFilter}
                          adjUserFilter={adjUserFilter}
                          adjustmentsList={adjustmentsList}
                          attendanceData={attendanceData}
                          attendanceDateFilter={attendanceDateFilter}
                          attendanceDateMode={attendanceDateMode}
                          attendanceMonthFilter={attendanceMonthFilter}
                          attendanceUserFilter={attendanceUserFilter}
                          handleDeleteAdjustment={handleDeleteAdjustment}
                          handleDeleteUser={handleDeleteUser}
                          handleExportDailySales={handleExportDailySales}
                          handleExportPayroll={handleExportPayroll}
                          loadAdjustments={loadAdjustments}
                          loadPayroll={loadPayroll}
                          loadUsersAndAttendance={loadUsersAndAttendance}
                          payrollData={payrollData}
                          payrollMonth={payrollMonth}
                          setActiveTab={setActiveTab}
                          setAdjTypeFilter={setAdjTypeFilter}
                          setAdjUserFilter={setAdjUserFilter}
                          setAdjustmentForm={setAdjustmentForm}
                          setAdjustmentModal={setAdjustmentModal}
                          setAttendanceDateFilter={setAttendanceDateFilter}
                          setAttendanceDateMode={setAttendanceDateMode}
                          setAttendanceMonthFilter={setAttendanceMonthFilter}
                          setAttendanceUserFilter={setAttendanceUserFilter}
                          setPayrollMonth={setPayrollMonth}
                          setSelectedPayrollDetails={setSelectedPayrollDetails}
                          setUserForm={setUserForm}
                          setUserManagementTab={setUserManagementTab}
                          setUserModal={setUserModal}
                          settings={settings}
                          shiftSchedules={shiftSchedules}
                          userManagementTab={userManagementTab}
                          usersList={usersList}
                        />
                      )}
                    </div>

                    {/* ================= MODAL: TRANSFER TABLE ORDER ================= */}
                    {transferModal && (
                      <TransferTableModal
                        pendingTransferTable={pendingTransferTable}
                        handleTransferTableOrder={handleTransferTableOrder}
                        sections={sections}
                        setTransferModal={setTransferModal}
                        setTransferTargetId={setTransferTargetId}
                        tableCartsMap={tableCartsMap}
                        tables={tables}
                        transferModal={transferModal}
                        transferTargetId={transferTargetId}
                      />
                    )}

                    {/* ================= MODAL: TRANSFER SINGLE ITEM ================= */}
                    {transferItemModal && (
                      <TransferItemModal
                        handleConfirmTransferItem={handleConfirmTransferItem}
                        sections={sections}
                        setTransferItemAdminPassword={setTransferItemAdminPassword}
                        setTransferItemModal={setTransferItemModal}
                        setTransferItemQty={setTransferItemQty}
                        setTransferItemTargetId={setTransferItemTargetId}
                        tableCartsMap={tableCartsMap}
                        tables={tables}
                        transferItemAdminPassword={transferItemAdminPassword}
                        transferItemError={transferItemError}
                        transferItemModal={transferItemModal}
                        transferItemQty={transferItemQty}
                        transferItemTargetId={transferItemTargetId}
                      />
                    )}

                    {/* ================= MODAL: CLOCK TAMPER BLOCKER ================= */}
                    {clockError && (
                      <ClockErrorModal
                        clockError={clockError}
                        refreshData={refreshData}
                        setClockError={setClockError}
                        showToast={showToast}
                      />
                    )}

                    {/* ================= MODAL: RECEIPT PRINT ================= */}
                    {receiptOrder && (
                      <ReceiptModal
                        currentUser={currentUser}
                        printBarTicketFromReceipt={printBarTicketFromReceipt}
                        printReceipt={printReceipt}
                        receiptOrder={receiptOrder}
                        setReceiptOrder={setReceiptOrder}
                        settings={settings}
                        tables={tables}
                        vendorDevFeatures={vendorDevFeatures}
                      />
                    )}

                    {/* ================= MODAL: BAR / KITCHEN TICKET PRINT ================= */}
                    {barTicketOrder && (
                      <BarTicketModal
                        barTicketOrder={barTicketOrder}
                        printBarTicket={printBarTicket}
                        setBarTicketOrder={setBarTicketOrder}
                        tables={tables}
                      />
                    )}

                    {/* ================= MODAL: SHISHA TICKET PRINT ================= */}
                    {shishaTicketOrder && (
                      <ShishaTicketModal
                        printShishaTicket={printShishaTicket}
                        setShishaTicketOrder={setShishaTicketOrder}
                        shishaTicketOrder={shishaTicketOrder}
                        tables={tables}
                      />
                    )}

                    {/* ================= MODAL: EXPENSES PRINT ================= */}
                    {expensesPrintData && (
                      <ExpensesPrintModal
                        currentUser={currentUser}
                        expensesPrintData={expensesPrintData}
                        handlePrintExpenses={handlePrintExpenses}
                        setExpensesPrintData={setExpensesPrintData}
                        settings={settings}
                        shift={shift}
                      />
                    )}

                    {/* ================= MODAL: PRINTABLE REPORT ================= */}
                    {activeReportForPrint && (
                      <PrintableReportModal
                        activeReportForPrint={activeReportForPrint}
                        currentUser={currentUser}
                        dashboardData={dashboardData}
                        inventoryFilterMode={inventoryFilterMode}
                        printReport={printReport}
                        printReportFormat={printReportFormat}
                        reportData={reportData}
                        reportDateFrom={reportDateFrom}
                        reportDateTo={reportDateTo}
                        selectedDailyShiftIds={selectedDailyShiftIds}
                        setActiveReportForPrint={setActiveReportForPrint}
                        setPrintReportFormat={setPrintReportFormat}
                        settings={settings}
                        shiftReportSection={shiftReportSection}
                      />
                    )}

                    {/* ================= MODAL: ADD EXPENSE ================= */}
                    {expenseModal && (
                      <AddExpenseModal
                        pendingExpense={pendingExpense}
                        expenseForm={expenseForm}
                        handleAddExpense={handleAddExpense}
                        setExpenseForm={setExpenseForm}
                        setExpenseModal={setExpenseModal}
                        settings={settings}
                      />
                    )}

                    {/* ================= MODAL: EXPENSES LOG & MANAGEMENT ================= */}
                    {expensesModal && (
                      <ExpensesLogModal
                        currentUser={currentUser}
                        expenseFilterMode={expenseFilterMode}
                        expenseFromDate={expenseFromDate}
                        expenseList={expenseList}
                        expenseToDate={expenseToDate}
                        handleDeleteExpense={handleDeleteExpense}
                        loadExpensesList={loadExpensesList}
                        setEditExpenseForm={setEditExpenseForm}
                        setEditingExpense={setEditingExpense}
                        setExpenseFilterMode={setExpenseFilterMode}
                        setExpenseForm={setExpenseForm}
                        setExpenseFromDate={setExpenseFromDate}
                        setExpenseModal={setExpenseModal}
                        setExpensesModal={setExpensesModal}
                        setExpensesPrintData={setExpensesPrintData}
                        setExpenseToDate={setExpenseToDate}
                        settings={settings}
                        shift={shift}
                      />
                    )}

                    {/* ================= MODAL: EDIT EXPENSE ================= */}
                    {editingExpense && (
                      <EditExpenseModal
                        editExpenseForm={editExpenseForm}
                        handleUpdateExpense={handleUpdateExpense}
                        setEditExpenseForm={setEditExpenseForm}
                        setEditingExpense={setEditingExpense}
                        settings={settings}
                      />
                    )}

                    {/* ================= MODAL: CLOSE SHIFT ================= */}
                    {closeShiftModal && (
                      <CloseShiftModal
                        pendingCloseShift={pendingCloseShift}
                        actualCashInput={actualCashInput}
                        closeNotesInput={closeNotesInput}
                        handleConfirmCloseShift={handleConfirmCloseShift}
                        setActualCashInput={setActualCashInput}
                        setCloseNotesInput={setCloseNotesInput}
                        setCloseShiftModal={setCloseShiftModal}
                        setShiftBlockerModal={setShiftBlockerModal}
                        setShiftOverridePassword={setShiftOverridePassword}
                        settings={settings}
                        shift={shift}
                        shiftBlockerModal={shiftBlockerModal}
                        shiftOverridePassword={shiftOverridePassword}
                      />
                    )}

                    {/* ================= MODAL: ADD/EDIT PRODUCT ================= */}
                    {productModal && (
                      <ProductModal
                        categories={categories}
                        handleSaveProduct={handleSaveProduct}
                        productForm={productForm}
                        setProductForm={setProductForm}
                        setProductModal={setProductModal}
                        settings={settings}
                      />
                    )}

                    {/* ================= MODAL: ADD/EDIT SECTION ================= */}
                    {sectionModal && (
                      <SectionModal
                        handleSaveSection={handleSaveSection}
                        sectionForm={sectionForm}
                        setSectionForm={setSectionForm}
                        setSectionModal={setSectionModal}
                      />
                    )}

                    {/* ================= MODAL: CONFIGURE TABLES COUNT ================= */}
                    {tablesConfigModal && (
                      <TablesConfigModal
                        handleResetTables={handleResetTables}
                        setTableCountsForm={setTableCountsForm}
                        setTablesConfigModal={setTablesConfigModal}
                        tableCountsForm={tableCountsForm}
                      />
                    )}

                    {/* ================= MODAL: ADD/EDIT USER ================= */}
                    {userModal && (
                      <UserModal
                        handleSaveUser={handleSaveUser}
                        setUserForm={setUserForm}
                        setUserModal={setUserModal}
                        shiftSchedules={shiftSchedules}
                        userForm={userForm}
                        sections={sections}
                      />
                    )}

                    {/* ================= MODAL: NOTEBOOK / CUSTOMER DEBTS (ADMIN ONLY) ================= */}
                    {notebookModal && vendorDevFeatures.enable_notebook_for_admin !== false && (currentUser?.role === 'admin' || vendorDevFeatures.show_notebook_to_cashier) && (
                      <NotebookModal
                        debtFilter={debtFilter}
                        debtSearch={debtSearch}
                        debtViewMode={debtViewMode}
                        debtsGroupedList={debtsGroupedList}
                        debtsList={debtsList}
                        setAdminPasswordInput={setAdminPasswordInput}
                        setDebtFilter={setDebtFilter}
                        setDebtSearch={setDebtSearch}
                        setDebtViewMode={setDebtViewMode}
                        setDeleteDebtData={setDeleteDebtData}
                        setNotebookModal={setNotebookModal}
                        setPayAmountInput={setPayAmountInput}
                        setPayCustomerAmountInput={setPayCustomerAmountInput}
                        setPayCustomerModalData={setPayCustomerModalData}
                        setPayCustomerNotesInput={setPayCustomerNotesInput}
                        setPayDebtData={setPayDebtData}
                        setPayNotesInput={setPayNotesInput}
                        setViewCustomerDetails={setViewCustomerDetails}
                        settings={settings}
                      />
                    )}

                    {/* ================= MODAL: PAY DEBT ================= */}
                    {payDebtData && (
                      <PayDebtModal
                        pendingPayDebt={pendingPayDebt}
                        handleConfirmPayDebt={handleConfirmPayDebt}
                        payAmountInput={payAmountInput}
                        payDebtData={payDebtData}
                        payNotesInput={payNotesInput}
                        setPayAmountInput={setPayAmountInput}
                        setPayDebtData={setPayDebtData}
                        setPayNotesInput={setPayNotesInput}
                        settings={settings}
                      />
                    )}

                    {/* ================= MODAL: PAY CUSTOMER DEBT (FIFO) ================= */}
                    {payCustomerModalData && (
                      <PayCustomerDebtModal
                        handleConfirmPayCustomerDebts={handleConfirmPayCustomerDebts}
                        payCustomerAmountInput={payCustomerAmountInput}
                        payCustomerModalData={payCustomerModalData}
                        payCustomerNotesInput={payCustomerNotesInput}
                        setPayCustomerAmountInput={setPayCustomerAmountInput}
                        setPayCustomerModalData={setPayCustomerModalData}
                        setPayCustomerNotesInput={setPayCustomerNotesInput}
                        settings={settings}
                      />
                    )}

                    {/* ================= MODAL: DELETE DEBT (ADMIN PASSWORD REQUIRED) ================= */}
                    {deleteDebtData && (
                      <DeleteDebtModal
                        adminPasswordInput={adminPasswordInput}
                        deleteDebtData={deleteDebtData}
                        handleConfirmDeleteDebt={handleConfirmDeleteDebt}
                        setAdminPasswordInput={setAdminPasswordInput}
                        setDeleteDebtData={setDeleteDebtData}
                        settings={settings}
                      />
                    )}

                    {/* ================= MODAL: CUSTOMER DETAILS ================= */}
                    {viewCustomerDetails && (
                      <CustomerDetailsModal
                        setPayCustomerAmountInput={setPayCustomerAmountInput}
                        setPayCustomerModalData={setPayCustomerModalData}
                        setPayCustomerNotesInput={setPayCustomerNotesInput}
                        setViewCustomerDetails={setViewCustomerDetails}
                        settings={settings}
                        viewCustomerDetails={viewCustomerDetails}
                      />
                    )}

                    {/* ================= MODAL: ADD EMPLOYEE ADJUSTMENT (PENALTY/BONUS/ABSENCE) ================= */}
                    {adjustmentModal && (
                      <AdjustmentModal
                        adjustmentForm={adjustmentForm}
                        handleSaveAdjustment={handleSaveAdjustment}
                        setAdjustmentForm={setAdjustmentForm}
                        setAdjustmentModal={setAdjustmentModal}
                        settings={settings}
                        usersList={usersList}
                      />
                    )}

                    {/* ================= MODAL: EMPLOYEE PAYROLL DETAILS ================= */}
                    {selectedPayrollDetails && (
                      <PayrollDetailsModal
                        payrollMonth={payrollMonth}
                        selectedPayrollDetails={selectedPayrollDetails}
                        setSelectedPayrollDetails={setSelectedPayrollDetails}
                        onPrint={() => {
                          printElementHtml('printable-payroll-details', {
                            deviceName: settings.printer_name || '',
                            isA4: true,
                            fallbackFn: () => window.print()
                          });
                        }}
                      />
                    )}

                    {/* ================= MODAL: MANDATORY PASSWORD CHANGE ================= */}
                    {forcePasswordModal && currentUser && (
                      <ForcePasswordModal
                        confirmPasswordInput={confirmPasswordInput}
                        currentUser={currentUser}
                        handleForcePasswordChange={handleForcePasswordChange}
                        newPasswordInput={newPasswordInput}
                        passwordChangeError={passwordChangeError}
                        setConfirmPasswordInput={setConfirmPasswordInput}
                        setNewPasswordInput={setNewPasswordInput}
                      />
                    )}

                    {/* ================= SCREEN: EXPIRED LICENSE ================= */}
                    {licenseData && licenseData.isExpired && (
                      <ExpiredLicenseScreen
                        handleActivateLicense={handleActivateLicense}
                        licenseData={licenseData}
                        licenseError={licenseError}
                        licenseInput={licenseInput}
                        setLicenseInput={setLicenseInput}
                      />
                    )}

                    {/* ================= SCREEN: OFFLINE LICENSE ACTIVATION (First time) ================= */}
                    {licenseData && !licenseData.isActivated && !licenseData.isExpired && (
                      <LicenseActivationScreen
                        handleActivateLicense={handleActivateLicense}
                        licenseData={licenseData}
                        licenseError={licenseError}
                        licenseInput={licenseInput}
                        setLicenseInput={setLicenseInput}
                      />
                    )}

                    {/* ================= MODAL: CANCEL ORDER ================= */}
                    {cancelModal && orderToCancel && (
                      <CancelOrderModal
                        pendingCancelOrder={pendingCancelOrder}
                        cancelAdminPassword={cancelAdminPassword}
                        cancelReasonInput={cancelReasonInput}
                        currentUser={currentUser}
                        handleConfirmCancelOrder={handleConfirmCancelOrder}
                        orderToCancel={orderToCancel}
                        setCancelAdminPassword={setCancelAdminPassword}
                        setCancelModal={setCancelModal}
                        setCancelReasonInput={setCancelReasonInput}
                        setOrderToCancel={setOrderToCancel}
                        settings={settings}
                      />
                    )}

                    {/* ================= MODAL: RESTORE ORDER ================= */}
                    {restoreModal && orderToRestore && (
                      <RestoreOrderModal
                        pendingRestoreOrder={pendingRestoreOrder}
                        currentUser={currentUser}
                        handleConfirmRestoreOrder={handleConfirmRestoreOrder}
                        orderToRestore={orderToRestore}
                        restoreAdminPassword={restoreAdminPassword}
                        setOrderToRestore={setOrderToRestore}
                        setRestoreAdminPassword={setRestoreAdminPassword}
                        setRestoreModal={setRestoreModal}
                        settings={settings}
                      />
                    )}

                    {/* ================= MODAL: DELETE EXPENSE (ADMIN PASSWORD REQUIRED) ================= */}
                    {deleteExpenseData && (
                      <DeleteExpenseModal
                        pendingExpense={pendingExpense}
                        deleteExpensePassword={deleteExpensePassword}
                        handleConfirmDeleteExpense={handleConfirmDeleteExpense}
                        setDeleteExpenseData={setDeleteExpenseData}
                        setDeleteExpensePassword={setDeleteExpensePassword}
                      />
                    )}

                    {/* ================= MODAL: ADMIN AUTH FOR VOID / REDUCE BAR ITEMS ================= */}
                    {adminAuthModal && (
                      <AdminAuthModal
                        adminAuthError={adminAuthError}
                        adminAuthModal={adminAuthModal}
                        adminAuthPassword={adminAuthPassword}
                        adminAuthPrintVoid={adminAuthPrintVoid}
                        adminAuthReason={adminAuthReason}
                        setAdminAuthReason={setAdminAuthReason}
                        adminAuthTargetQty={adminAuthTargetQty}
                        handleConfirmAdminAuth={handleConfirmAdminAuth}
                        setAdminAuthError={setAdminAuthError}
                        setAdminAuthModal={setAdminAuthModal}
                        setAdminAuthPassword={setAdminAuthPassword}
                        setAdminAuthPrintVoid={setAdminAuthPrintVoid}
                        setAdminAuthTargetQty={setAdminAuthTargetQty}
                      />
                    )}

                    {/* ================= MODAL: ADMIN QUICK-ACCESS OVERLAY ================= */}
                    {adminOverlayModal && (
                      <AdminOverlayModal
                        adminOverlayError={adminOverlayError}
                        adminOverlayPassword={adminOverlayPassword}
                        handleAdminOverlayLogin={handleAdminOverlayLogin}
                        setAdminOverlayError={setAdminOverlayError}
                        setAdminOverlayModal={setAdminOverlayModal}
                        setAdminOverlayPassword={setAdminOverlayPassword}
                      />
                    )}

                    {/* ================= MODAL: BAR VOID / CANCELLATION TICKET ================= */}
                    {barVoidTicket && (
                      <BarVoidTicketModal
                        barVoidTicket={barVoidTicket}
                        printBarVoidTicket={printBarVoidTicket}
                        setBarVoidTicket={setBarVoidTicket}
                      />
                    )}

                    {/* ================= MODAL: CATEGORY MANAGER & REORDER ================= */}
                    {categoryManagerModal && (
                      <CategoryManagerModal
                        categories={categories}
                        handleDeleteCategory={handleDeleteCategory}
                        handleMoveCategory={handleMoveCategory}
                        products={products}
                        setCategoryForm={setCategoryForm}
                        setCategoryManagerModal={setCategoryManagerModal}
                        setCategoryModal={setCategoryModal}
                      />
                    )}

                    {/* ================= MODAL: ADD / EDIT CATEGORY ================= */}
                    {categoryModal && (
                      <CategoryModal
                        categoryForm={categoryForm}
                        handleSaveCategory={handleSaveCategory}
                        setCategoryForm={setCategoryForm}
                        setCategoryModal={setCategoryModal}
                      />
                    )}

                    {/* ================= MODAL: SYSTEM RESET CONFIRMATION ================= */}
                    {systemResetModal && (
                      <SystemResetModal
                        handleConfirmSystemReset={handleConfirmSystemReset}
                        setSystemResetError={setSystemResetError}
                        setSystemResetModal={setSystemResetModal}
                        setSystemResetPassword={setSystemResetPassword}
                        systemResetError={systemResetError}
                        systemResetLoading={systemResetLoading}
                        systemResetPassword={systemResetPassword}
                        systemResetType={systemResetType}
                      />
                    )}

                    {/* ===== Custom Note Modal (replaces blocked prompt()) ===== */}
                    {noteModal && <NoteModal
                      cart={cart}
                      noteModal={noteModal}
                      noteModalText={noteModalText}
                      selectedTable={selectedTable}
                      setCart={setCart}
                      setNoteModal={setNoteModal}
                      setNoteModalText={setNoteModalText}
                      setTableCartsMap={setTableCartsMap}
                      orderType={orderType}
                      activeTakeawayId={activeTakeawayId}
                      setTakeawayTabs={setTakeawayTabs}
                    />}

                    {/* ===== عنصر مخفي: طباعة صامتة لشيك الحساب (بدون مودال) ===== */}
                    {preBillCheckData && (
                      <PreBillCheckPrint
                        preBillCheckData={preBillCheckData}
                        settings={settings}
                        tables={tables}
                      />
                    )}

                    {/* ===== معالج إعداد وتعيين طابعات النظام لأول مرة (First-Time Printer Setup Wizard) ===== */}
                    {showPrinterWizard && (
                      <PrinterWizardModal
                        availablePrinters={availablePrinters}
                        handleSavePrinterWizard={handleSavePrinterWizard}
                        refreshPrinters={refreshPrinters}
                        setShowPrinterWizard={setShowPrinterWizard}
                        setWizardPrinters={setWizardPrinters}
                        testPrintStation={testPrintStation}
                        wizardPrinters={wizardPrinters}
                      />
                    )}

                    {/* Toast alert */}
                    {toast && <div className="app-toast">{toast}</div>}
                  </div>
                );
              }

