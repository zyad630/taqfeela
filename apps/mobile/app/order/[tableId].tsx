import React, { useState, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Modal,
  Alert,
  KeyboardAvoidingView,
  Platform
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Screen } from '../../src/ui/Screen';
import { Stepper } from '../../src/ui/Stepper';
import { PrimaryButton } from '../../src/ui/PrimaryButton';
import { colors, fonts, radii } from '../../src/theme/tokens';
import { useAppStore, Product, Table, CartItem as ExistingCartItem } from '../../src/store/useAppStore';
import { outbox } from '../../src/outbox/worker';
import { haptic } from '../../src/animations';
import { ChevronRight, Search, Plus, FileText, X, ShoppingBag } from 'lucide-react-native';

interface CartItem {
  product: Product;
  qty: number;
  note: string;
}

export default function OrderScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tableId: string; tableNumber: string; hall: string }>();

  const tableId = parseInt(params.tableId || '1', 10);
  const tableNumber = params.tableNumber || String(tableId);
  const hall = params.hall || 'الصالات';

  const { categories, products, tables, activeWaiter, loadTables } = useAppStore();

  // Sync table cart data in real-time while order screen is active
  useEffect(() => {
    loadTables();
    const interval = setInterval(loadTables, 3000);
    return () => clearInterval(interval);
  }, [loadTables]);

  // Guard: Hall Permission Security Check
  useEffect(() => {
    if (!activeWaiter) return;
    const assignedHalls = activeWaiter.assignedHalls || ['ALL'];
    if (!assignedHalls.includes('ALL')) {
      const allowedLower = assignedHalls.map(h => String(h).toLowerCase().trim());
      const currentHallLower = String(hall).toLowerCase().trim();
      const isAllowed = allowedLower.includes(currentHallLower);
      if (!isAllowed) {
        Alert.alert('غير مصرح', `غير مسموح لك بفتح أو الطلب على طاولات قسم "${hall}" المخصص لويتر آخر.`, [
          { text: 'حسناً', onPress: () => router.back() }
        ]);
      }
    }
  }, [activeWaiter, hall]);

  const [selectedCatId, setSelectedCatId] = useState<number | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [cart, setCart] = useState<Record<number, CartItem>>({});
  const [showExistingOrders, setShowExistingOrders] = useState(false);

  // Note modal state
  const [noteModalVisible, setNoteModalVisible] = useState(false);
  const [activeNoteProductId, setActiveNoteProductId] = useState<number | null>(null);
  const [customNote, setCustomNote] = useState('');

  // Get existing table data
  const currentTable = useMemo(() => {
    return tables.find(t => t.id === tableId);
  }, [tables, tableId]);

  const existingItems = currentTable?.cartItems || [];
  const existingTotal = currentTable?.totalPrice || 0;
  const isBusy = currentTable?.state !== 'free' && existingItems.length > 0;

  // Auto-show existing orders banner if table has items
  useEffect(() => {
    if (isBusy) {
      setShowExistingOrders(true);
    }
  }, [isBusy]);

  // Common quick notes
  const quickNotes = ['من غير سكر', 'سكر زيادة', 'بدون ثلج', 'ثلج زيادة', 'سخن جداً', 'سفري / تيك أواي'];

  // Filter products by category and search
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchCat = selectedCatId === 'all' || p.categoryId === selectedCatId;
      const matchSearch = !searchQuery.trim() || p.name.toLowerCase().includes(searchQuery.trim().toLowerCase());
      return matchCat && matchSearch;
    });
  }, [products, selectedCatId, searchQuery]);

  // Total new items count
  const totalItemCount = useMemo(() => {
    return Object.values(cart).reduce((sum, item) => sum + item.qty, 0);
  }, [cart]);

  // Total new items price
  const newOrderTotal = useMemo(() => {
    return Object.values(cart).reduce((sum, item) => sum + (item.product.price * item.qty), 0);
  }, [cart]);

  const handleIncrement = (product: Product) => {
    setCart((prev) => {
      const current = prev[product.id];
      const nextQty = (current?.qty || 0) + 1;
      return {
        ...prev,
        [product.id]: {
          product,
          qty: nextQty,
          note: current?.note || ''
        }
      };
    });
  };

  const handleDecrement = (productId: number) => {
    setCart((prev) => {
      const current = prev[productId];
      if (!current || current.qty <= 1) {
        const next = { ...prev };
        delete next[productId];
        return next;
      }
      return {
        ...prev,
        [productId]: {
          ...current,
          qty: current.qty - 1
        }
      };
    });
  };

  const openNoteModal = (productId: number) => {
    haptic.selection();
    setActiveNoteProductId(productId);
    setCustomNote(cart[productId]?.note || '');
    setNoteModalVisible(true);
  };

  const saveNote = (noteText: string) => {
    if (activeNoteProductId == null) return;
    setCart((prev) => {
      const current = prev[activeNoteProductId];
      if (!current) return prev;
      return {
        ...prev,
        [activeNoteProductId]: {
          ...current,
          note: noteText.trim()
        }
      };
    });
    setNoteModalVisible(false);
    setActiveNoteProductId(null);
  };

  const handleSendOrder = async () => {
    if (totalItemCount === 0) return;

    try {
      haptic.success();

      // Generate idempotent UUID
      const clientOrderId = `order_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

      const itemsToSend = Object.values(cart).map((c) => ({
        productId: c.product.id,
        name: c.product.name,
        qty: c.qty,
        note: c.note
      }));

      // Durable enqueue into SQLite outbox
      await outbox.enqueueOrder({
        clientOrderId,
        tableId,
        tableName: `طاولة ${tableNumber}`,
        items: itemsToSend
      });

      // Navigate back to tables
      router.back();
    } catch (err: any) {
      Alert.alert('خطأ', 'فشل حفظ الطلب: ' + err.message);
    }
  };

  return (
    <Screen safeBottom={false}>
      {/* 1. Header */}
      <View style={styles.header}>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => router.back()}
          style={styles.backButton}
          accessibilityLabel="رجوع للطاولات"
        >
          <ChevronRight size={24} color={colors.text} strokeWidth={2} />
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <Text style={styles.headerTitle} numberOfLines={1}>طاولة {tableNumber}</Text>
          <Text style={styles.headerSubtitle} numberOfLines={1}>
            {hall} · {isBusy ? 'إضافة للطلب' : 'طلب جديد'}
          </Text>
        </View>
      </View>

      {/* Existing Orders Banner (when table is busy) */}
      {isBusy && (
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => setShowExistingOrders(!showExistingOrders)}
          style={styles.existingBanner}
        >
          <View style={styles.existingBannerLeft}>
            <ShoppingBag size={18} color={colors.orangeText} strokeWidth={2} />
            <Text style={styles.existingBannerText}>
              {existingItems.length} أصناف موجودة · إجمالي {existingTotal.toFixed(0)} ج.م
            </Text>
          </View>
          <Text style={styles.existingBannerToggle}>
            {showExistingOrders ? 'إخفاء ▲' : 'عرض ▼'}
          </Text>
        </TouchableOpacity>
      )}

      {/* Existing Orders Details (expandable) */}
      {isBusy && showExistingOrders && (
        <View style={styles.existingList}>
          {existingItems.map((item: ExistingCartItem, idx: number) => (
            <View key={idx} style={styles.existingRow}>
              <Text style={styles.existingItemName} numberOfLines={1}>
                {item.name}
              </Text>
              <Text style={styles.existingItemQty}>×{item.qty}</Text>
              <Text style={styles.existingItemPrice}>
                {(item.price * item.qty).toFixed(0)} ج.م
              </Text>
            </View>
          ))}
          <View style={styles.existingTotalRow}>
            <Text style={styles.existingTotalLabel}>إجمالي الطاولة</Text>
            <Text style={styles.existingTotalValue}>{existingTotal.toFixed(0)} ج.م</Text>
          </View>
        </View>
      )}

      {/* 2. Search Input */}
      <View style={styles.searchWrapper}>
        <View style={styles.searchBox}>
          <Search size={20} color={colors.muted} strokeWidth={2} />
          <TextInput
            style={styles.searchInput}
            placeholder="ابحث عن صنف"
            placeholderTextColor={colors.muted}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery ? (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <X size={18} color={colors.muted} />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {/* 3. Category Chips */}
      <View style={styles.catsWrapper}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.catsScroll}
        >
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => {
              haptic.selection();
              setSelectedCatId('all');
            }}
            style={[
              styles.catChip,
              selectedCatId === 'all' && styles.catChipActive
            ]}
          >
            <Text style={[
              styles.catText,
              selectedCatId === 'all' && styles.catTextActive
            ]}>
              الكل
            </Text>
          </TouchableOpacity>

          {categories.map((cat) => {
            const isSelected = selectedCatId === cat.id;
            return (
              <TouchableOpacity
                key={cat.id}
                activeOpacity={0.7}
                onPress={() => {
                  haptic.selection();
                  setSelectedCatId(cat.id);
                }}
                style={[
                  styles.catChip,
                  isSelected && styles.catChipActive
                ]}
              >
                <Text style={[
                  styles.catText,
                  isSelected && styles.catTextActive
                ]}>
                  {cat.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* 4. Products List */}
      <ScrollView contentContainerStyle={styles.productsList}>
        {filteredProducts.map((p) => {
          const inCart = cart[p.id];
          const qty = inCart ? inCart.qty : 0;
          const note = inCart?.note;

          return (
            <View key={p.id} style={styles.productRow}>
              {/* Product Info */}
              <View style={styles.productInfo}>
                <Text style={styles.productName} numberOfLines={1}>{p.name}</Text>
                <Text style={styles.productPrice}>{p.price} ج.م</Text>

                {/* Note button */}
                {qty > 0 && (
                  <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={() => openNoteModal(p.id)}
                    style={styles.noteBtn}
                  >
                    <Text style={styles.noteBtnText} numberOfLines={1}>
                      {note ? `📝 ${note}` : '+ إضافة ملاحظة'}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Action: Stepper or Plus Button */}
              {qty > 0 ? (
                <Stepper
                  qty={qty}
                  onIncrement={() => handleIncrement(p)}
                  onDecrement={() => handleDecrement(p.id)}
                />
              ) : (
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => {
                    haptic.light();
                    handleIncrement(p);
                  }}
                  style={styles.addBtn}
                  accessibilityLabel={`إضافة ${p.name}`}
                >
                  <Plus size={22} color={colors.orangeText} strokeWidth={2.4} />
                </TouchableOpacity>
              )}
            </View>
          );
        })}

        {filteredProducts.length === 0 && (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>لم يتم العثور على أصناف مطابقة للبحث</Text>
          </View>
        )}
      </ScrollView>

      {/* 5. Footer: Item count + Total + "إرسال للكاشير" button */}
      <View style={styles.footer}>
        <View style={styles.countContainer}>
          <Text style={styles.countNumber}>{totalItemCount}</Text>
          <Text style={styles.countLabel}>
            {newOrderTotal > 0 ? `${newOrderTotal.toFixed(0)} ج.م` : 'أصناف في الطلب'}
          </Text>
        </View>

        <PrimaryButton
          title={isBusy ? 'إضافة للطلب' : 'إرسال للكاشير'}
          onPress={handleSendOrder}
          disabled={totalItemCount === 0}
          style={styles.sendButton}
        />
      </View>

      {/* Note Modal */}
      <Modal
        visible={noteModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setNoteModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>ملاحظة خاصة على الصنف</Text>
              <TouchableOpacity onPress={() => setNoteModalVisible(false)}>
                <X size={22} color={colors.muted} />
              </TouchableOpacity>
            </View>

            {/* Quick Notes Pills */}
            <View style={styles.quickNotesRow}>
              {quickNotes.map((qNote) => (
                <TouchableOpacity
                  key={qNote}
                  activeOpacity={0.7}
                  onPress={() => setCustomNote(qNote)}
                  style={styles.quickNotePill}
                >
                  <Text style={styles.quickNoteText}>{qNote}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Text Input */}
            <TextInput
              style={styles.modalInput}
              placeholder="اكتب ملاحظة مخصصة (مثلاً: زيادة لبن)"
              placeholderTextColor={colors.muted}
              value={customNote}
              onChangeText={setCustomNote}
              maxLength={120}
            />

            <View style={styles.modalActions}>
              <PrimaryButton
                title="حفظ الملاحظة"
                onPress={() => saveNote(customNote)}
                style={{ flex: 1 }}
              />
              {customNote ? (
                <TouchableOpacity
                  onPress={() => saveNote('')}
                  style={styles.clearNoteBtn}
                >
                  <Text style={styles.clearNoteText}>حذف</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingTop: 20,
    paddingHorizontal: 12,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4
  },
  backButton: {
    width: 48,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center'
  },
  headerInfo: {
    flex: 1
  },
  headerTitle: {
    fontFamily: fonts.balooBold,
    fontSize: 24,
    color: colors.text,
    lineHeight: 28
  },
  headerSubtitle: {
    fontFamily: fonts.cairoRegular,
    fontSize: 13,
    color: colors.muted
  },
  // --- Existing Orders Banner & List ---
  existingBanner: {
    marginHorizontal: 20,
    marginBottom: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: radii.card,
    backgroundColor: colors.orangeTint,
    borderWidth: 1,
    borderColor: colors.orange,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  existingBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1
  },
  existingBannerText: {
    fontFamily: fonts.cairoBold,
    fontSize: 13,
    color: colors.orangeText,
    flex: 1
  },
  existingBannerToggle: {
    fontFamily: fonts.cairoSemiBold,
    fontSize: 12,
    color: colors.orangeText
  },
  existingList: {
    marginHorizontal: 20,
    marginBottom: 10,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: radii.card,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border
  },
  existingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
    gap: 8
  },
  existingItemName: {
    fontFamily: fonts.cairoSemiBold,
    fontSize: 13,
    color: colors.text,
    flex: 1
  },
  existingItemQty: {
    fontFamily: fonts.balooBold,
    fontSize: 14,
    color: colors.muted,
    lineHeight: 18,
    minWidth: 30,
    textAlign: 'center'
  },
  existingItemPrice: {
    fontFamily: fonts.cairoBold,
    fontSize: 13,
    color: colors.orangeText,
    minWidth: 60,
    textAlign: 'left'
  },
  existingTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 4
  },
  existingTotalLabel: {
    fontFamily: fonts.cairoBold,
    fontSize: 14,
    color: colors.text
  },
  existingTotalValue: {
    fontFamily: fonts.balooBold,
    fontSize: 16,
    color: colors.orangeText,
    lineHeight: 20
  },
  // --- Search, Categories, Products (unchanged) ---
  searchWrapper: {
    paddingHorizontal: 20,
    paddingBottom: 12
  },
  searchBox: {
    height: 48,
    borderRadius: radii.input,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    gap: 10
  },
  searchInput: {
    flex: 1,
    fontFamily: fonts.cairoRegular,
    fontSize: 15,
    color: colors.text
  },
  catsWrapper: {
    paddingBottom: 8
  },
  catsScroll: {
    paddingHorizontal: 20,
    gap: 8
  },
  catChip: {
    height: 40,
    paddingHorizontal: 16,
    borderRadius: radii.chip,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center'
  },
  catChipActive: {
    backgroundColor: colors.orange,
    borderColor: colors.orange
  },
  catText: {
    fontFamily: fonts.cairoSemiBold,
    fontSize: 15,
    color: colors.text
  },
  catTextActive: {
    color: colors.text
  },
  productsList: {
    paddingHorizontal: 20,
    paddingBottom: 24
  },
  productRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider
  },
  productInfo: {
    flex: 1,
    gap: 4
  },
  productName: {
    fontFamily: fonts.cairoBold,
    fontSize: 16,
    color: colors.text
  },
  productPrice: {
    fontFamily: fonts.cairoSemiBold,
    fontSize: 14,
    color: colors.orangeText
  },
  noteBtn: {
    alignSelf: 'flex-start',
    height: 28,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.orange,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 2
  },
  noteBtnText: {
    fontFamily: fonts.cairoSemiBold,
    fontSize: 12,
    color: colors.orangeText
  },
  addBtn: {
    width: 52,
    height: 52,
    borderRadius: radii.input,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center'
  },
  footer: {
    height: 86,
    paddingHorizontal: 20,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16
  },
  countContainer: {
    justifyContent: 'center',
    alignItems: 'flex-start'
  },
  countNumber: {
    fontFamily: fonts.balooBold,
    fontSize: 26,
    color: colors.text,
    lineHeight: 28
  },
  countLabel: {
    fontFamily: fonts.cairoRegular,
    fontSize: 12,
    color: colors.muted
  },
  sendButton: {
    flex: 1
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center'
  },
  emptyText: {
    fontFamily: fonts.cairoSemiBold,
    fontSize: 14,
    color: colors.muted
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end'
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.hero,
    borderTopRightRadius: radii.hero,
    padding: 24,
    gap: 16
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  modalTitle: {
    fontFamily: fonts.cairoBold,
    fontSize: 17,
    color: colors.text
  },
  quickNotesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  quickNotePill: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radii.pill,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border
  },
  quickNoteText: {
    fontFamily: fonts.cairoSemiBold,
    fontSize: 13,
    color: colors.text2
  },
  modalInput: {
    height: 48,
    borderRadius: radii.input,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
    paddingHorizontal: 14,
    fontFamily: fonts.cairoRegular,
    fontSize: 14,
    color: colors.text
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center'
  },
  clearNoteBtn: {
    paddingHorizontal: 16,
    height: 56,
    borderRadius: radii.button,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border
  },
  clearNoteText: {
    fontFamily: fonts.cairoBold,
    fontSize: 14,
    color: colors.muted
  }
});
