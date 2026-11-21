import React from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Alert
} from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '../../src/ui/Screen';
import { colors, fonts, radii } from '../../src/theme/tokens';
import { useAppStore } from '../../src/store/useAppStore';
import { haptic } from '../../src/animations';
import {
  Store,
  Smartphone,
  LogOut,
  ShieldCheck,
  ChevronLeft,
  ArrowRightLeft,
  User,
  Trash2
} from 'lucide-react-native';

export default function AdminMoreScreen() {
  const router = useRouter();
  const { cafeInfo, activeWaiter, logoutWaiter, unpairDevice } = useAppStore();

  const handleSwitchToWaiter = () => {
    haptic.medium();
    router.replace('/(waiter)/tables');
  };

  const handleLogout = () => {
    Alert.alert(
      'تسجيل خروج',
      `هل أنت متأكد من تسجيل خروج "${activeWaiter?.name || 'المدير'}"؟`,
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

  const handleUnpair = () => {
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

  return (
    <Screen safeBottom={false}>
      {/* 1. Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>المزيد</Text>
        <Text style={styles.headerSubtitle}>إدارة الكافيه والأجهزة وصلاحيات الأدمن</Text>
      </View>

      <ScrollView contentContainerStyle={styles.container}>
        {/* Café Card */}
        <View style={styles.card}>
          <View style={styles.cardRow}>
            <View style={styles.iconCircle}>
              <Store size={22} color={colors.orange} />
            </View>
            <View style={styles.cardTextGroup}>
              <Text style={styles.cardTitle}>{cafeInfo?.name || 'تقفيلة كافيه'}</Text>
              <Text style={styles.cardSub}>
                الاتصال: {cafeInfo?.host || '127.0.0.1'}:{cafeInfo?.port || 3000}
              </Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.cardRow}>
            <View style={styles.iconCircle}>
              <User size={22} color={colors.brown} />
            </View>
            <View style={styles.cardTextGroup}>
              <Text style={styles.cardTitle}>{activeWaiter?.name || 'مدير النظام'}</Text>
              <Text style={styles.cardSub}>الصلاحية: مدير عام (كامل الصلاحيات)</Text>
            </View>
          </View>
        </View>

        {/* Actions List */}
        <View style={styles.card}>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={handleSwitchToWaiter}
            style={styles.actionRow}
          >
            <View style={styles.actionIconGroup}>
              <ArrowRightLeft size={20} color={colors.orangeText} />
              <Text style={styles.actionText}>فتح شاشة الطاولات والطلبات (الويتر)</Text>
            </View>
            <ChevronLeft size={20} color={colors.muted} />
          </TouchableOpacity>

          <View style={styles.divider} />

          <TouchableOpacity
            activeOpacity={0.7}
            onPress={handleLogout}
            style={styles.actionRow}
          >
            <View style={styles.actionIconGroup}>
              <LogOut size={20} color={colors.red} />
              <Text style={[styles.actionText, { color: colors.red }]}>تسجيل الخروج من الحساب</Text>
            </View>
            <ChevronLeft size={20} color={colors.muted} />
          </TouchableOpacity>

          <View style={styles.divider} />

          <TouchableOpacity
            activeOpacity={0.7}
            onPress={handleUnpair}
            style={styles.actionRow}
          >
            <View style={styles.actionIconGroup}>
              <Trash2 size={20} color={colors.red} />
              <Text style={[styles.actionText, { color: colors.red }]}>إلغاء اقتران الهاتف بالكاشير</Text>
            </View>
            <ChevronLeft size={20} color={colors.muted} />
          </TouchableOpacity>
        </View>

        {/* System & Cloud Info */}
        <View style={styles.card}>
          <View style={styles.cardRow}>
            <ShieldCheck size={22} color={colors.green} />
            <View style={styles.cardTextGroup}>
              <Text style={styles.cardTitle}>المتابعة المحلية والسحابية الآمنة</Text>
              <Text style={styles.cardSub}>يدعم الاتصال المحلي والربط عن بُعد من أي دولة</Text>
            </View>
          </View>
        </View>

        {/* App Version */}
        <View style={styles.footer}>
          <Text style={styles.versionText}>تطبيق تقفيلة للموبايل · نسخة الأدمن والويتر 1.0.4</Text>
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
    includeFontPadding: false,
    paddingVertical: 2
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
    gap: 12
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
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6
  },
  actionIconGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  actionText: {
    fontFamily: fonts.cairoBold,
    fontSize: 15,
    color: colors.text
  },
  footer: {
    alignItems: 'center',
    marginTop: 12
  },
  versionText: {
    fontFamily: fonts.cairoRegular,
    fontSize: 12,
    color: colors.muted
  }
});
