import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert
} from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '../../src/ui/Screen';
import { colors, fonts, radii } from '../../src/theme/tokens';
import { useAppStore } from '../../src/store/useAppStore';
import { outbox } from '../../src/outbox/worker';
import { haptic } from '../../src/animations';
import {
  Store,
  Wifi,
  User,
  LogOut,
  RefreshCw,
  Trash2,
  Info,
  ShieldCheck
} from 'lucide-react-native';

export default function SettingsScreen() {
  const router = useRouter();
  const {
    cafeInfo,
    activeWaiter,
    isOnline,
    pendingOutboxCount,
    logoutWaiter,
    unpairDevice
  } = useAppStore();

  const handleLogout = async () => {
    Alert.alert(
      'تسجيل خروج',
      `هل أنت متأكد من تسجيل خروج الويتر "${activeWaiter?.name}"؟`,
      [
        { text: 'إلغاء', style: 'cancel' },
        {
          text: 'تسجيل خروج',
          style: 'destructive',
          onPress: async () => {
            haptic.medium();
            await logoutWaiter();
            router.replace('/(auth)/login');
          }
        }
      ]
    );
  };

  const handleUnpair = async () => {
    Alert.alert(
      'فصل وإعادة ربط الجهاز',
      'هل أنت متأكد من إلغاء اقتران هذا الموبايل بالكاشير؟ ستحتاج لمسح كود QR جديد.',
      [
        { text: 'إلغاء', style: 'cancel' },
        {
          text: 'فصل الجهاز',
          style: 'destructive',
          onPress: async () => {
            try {
              haptic.error();
              await unpairDevice();
            } finally {
              router.replace('/(auth)/pair');
            }
          }
        }
      ]
    );
  };

  const handleSyncOutbox = async () => {
    haptic.medium();
    await outbox.retryNow();
    Alert.alert('مزامنة', 'تم بدء مزامنة الطلبات المعلقة مع الكاشير');
  };

  return (
    <Screen safeBottom={false}>
      {/* 1. Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>الإعدادات</Text>
        <Text style={styles.headerSubtitle}>إعدادات الاتصال وحساب الويتر</Text>
      </View>

      <ScrollView contentContainerStyle={styles.container}>
        {/* Admin Return Banner if logged in user is Admin */}
        {activeWaiter?.role === 'admin' && (
          <View style={[styles.card, { borderColor: colors.orange, backgroundColor: '#FFF5EB' }]}>
            <View style={styles.cardRow}>
              <View style={styles.iconCircle}>
                <ShieldCheck size={22} color={colors.orange} />
              </View>
              <View style={styles.cardTextGroup}>
                <Text style={styles.cardTitle}>حساب مدير النظام (الأدمن)</Text>
                <Text style={styles.cardSub}>يمكنك التبديل بين شاشة الطاولات ولوحة تحكم الأدمن</Text>
              </View>
            </View>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => {
                haptic.medium();
                router.replace('/(admin)/home');
              }}
              style={styles.actionBtn}
            >
              <Text style={styles.actionBtnText}>العودة للوحة تحكم الأدمن (التقارير والفواتير)</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Café Info Card */}
        <View style={styles.card}>
          <View style={styles.cardRow}>
            <View style={styles.iconCircle}>
              <Store size={22} color={colors.orange} />
            </View>
            <View style={styles.cardTextGroup}>
              <Text style={styles.cardTitle}>{cafeInfo?.name || 'كافيه التكية'}</Text>
              <Text style={styles.cardSub}>
                خادم الكاشير: {cafeInfo?.host || '127.0.0.1'}:{cafeInfo?.port || 3000}
              </Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.cardRow}>
            <View style={[styles.statusDot, { backgroundColor: isOnline ? colors.green : colors.red }]} />
            <Text style={styles.statusLabel}>
              {isOnline ? 'متصل ومستقر عبر الواي فاي' : 'غير متصل بالكاشير'}
            </Text>
          </View>
        </View>

        {/* Waiter Profile Card */}
        <View style={styles.card}>
          <View style={styles.cardRow}>
            <View style={styles.iconCircle}>
              <User size={22} color={colors.brown} />
            </View>
            <View style={styles.cardTextGroup}>
              <Text style={styles.cardTitle}>{activeWaiter?.name || 'الويتر الحالي'}</Text>
              <Text style={styles.cardSub}>
                الصالة المصرحة: {activeWaiter?.assignedHalls?.join('، ') || 'جميع الصالات'}
              </Text>
            </View>
          </View>

          <TouchableOpacity
            activeOpacity={0.7}
            onPress={handleLogout}
            style={styles.actionBtnOutline}
          >
            <LogOut size={18} color={colors.red} />
            <Text style={styles.actionBtnTextDanger}>تسجيل خروج الويتر</Text>
          </TouchableOpacity>
        </View>

        {/* Offline Outbox Diagnostics */}
        <View style={styles.card}>
          <View style={styles.cardRow}>
            <View style={styles.iconCircle}>
              <RefreshCw size={22} color={colors.orangeText} />
            </View>
            <View style={styles.cardTextGroup}>
              <Text style={styles.cardTitle}>صندوق الطلبات المحفوظة (Outbox)</Text>
              <Text style={styles.cardSub}>
                {pendingOutboxCount > 0
                  ? `${pendingOutboxCount} طلبات في انتظار الإرسال`
                  : 'جميع الطلبات مرسلة ومزامنة بالكامل'}
              </Text>
            </View>
          </View>

          <TouchableOpacity
            activeOpacity={0.7}
            onPress={handleSyncOutbox}
            style={styles.actionBtn}
          >
            <RefreshCw size={18} color={colors.text} />
            <Text style={styles.actionBtnText}>مزامنة الطلبات المعلقة الآن</Text>
          </TouchableOpacity>
        </View>

        {/* Danger Zone: Unpair */}
        <View style={styles.card}>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={handleUnpair}
            style={styles.unpairBtn}
          >
            <Trash2 size={18} color={colors.red} />
            <Text style={styles.unpairText}>إلغاء اقتران هذا الهاتف بالكاشير</Text>
          </TouchableOpacity>
        </View>

        {/* App Info Footer */}
        <View style={styles.footer}>
          <ShieldCheck size={18} color={colors.muted} />
          <Text style={styles.versionText}>تطبيق تقفيلة للموبايل · إصدار 1.0.0</Text>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingTop: 24,
    paddingHorizontal: 20,
    paddingBottom: 14,
    gap: 2
  },
  headerTitle: {
    fontFamily: fonts.balooBold,
    fontSize: 26,
    color: colors.text,
    lineHeight: 30
  },
  headerSubtitle: {
    fontFamily: fonts.cairoRegular,
    fontSize: 13,
    color: colors.muted
  },
  container: {
    paddingHorizontal: 20,
    paddingBottom: 32,
    gap: 16
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 14
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.bg,
    justifyContent: 'center',
    alignItems: 'center'
  },
  cardTextGroup: {
    flex: 1,
    gap: 2
  },
  cardTitle: {
    fontFamily: fonts.cairoBold,
    fontSize: 16,
    color: colors.text
  },
  cardSub: {
    fontFamily: fonts.cairoRegular,
    fontSize: 13,
    color: colors.muted
  },
  divider: {
    height: 1,
    backgroundColor: colors.divider
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginLeft: 4
  },
  statusLabel: {
    fontFamily: fonts.cairoSemiBold,
    fontSize: 13,
    color: colors.text2
  },
  actionBtn: {
    height: 46,
    borderRadius: radii.chip,
    backgroundColor: colors.orange,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8
  },
  actionBtnText: {
    fontFamily: fonts.cairoBold,
    fontSize: 14,
    color: colors.text
  },
  actionBtnOutline: {
    height: 46,
    borderRadius: radii.chip,
    borderWidth: 1,
    borderColor: colors.red,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8
  },
  actionBtnTextDanger: {
    fontFamily: fonts.cairoBold,
    fontSize: 14,
    color: colors.red
  },
  unpairBtn: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8
  },
  unpairText: {
    fontFamily: fonts.cairoBold,
    fontSize: 14,
    color: colors.red
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    marginTop: 8
  },
  versionText: {
    fontFamily: fonts.cairoRegular,
    fontSize: 12,
    color: colors.muted
  }
});
