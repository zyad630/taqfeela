import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  ScrollView,
  Platform
} from 'react-native';
import { useRouter } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Screen } from '../../src/ui/Screen';
import { PrimaryButton } from '../../src/ui/PrimaryButton';
import { colors, fonts, radii } from '../../src/theme/tokens';
import { api } from '../../src/api/client';
import { useAppStore } from '../../src/store/useAppStore';
import { parsePairingPayload } from '../../src/discovery/lan';
import { haptic } from '../../src/animations';
import { QrCode, Smartphone, Wifi, Camera } from 'lucide-react-native';

export default function PairScreen() {
  const router = useRouter();
  const { setPairing } = useAppStore();

  const [mode, setMode] = useState<'qr' | 'manual'>('manual');
  const [code, setCode] = useState('');
  const [host, setHost] = useState('192.168.1.');
  const [port, setPort] = useState('3000');
  const [deviceName, setDeviceName] = useState(Platform.OS === 'android' ? 'موبايل أندرويد' : 'موبايل ويتر');
  const [loading, setLoading] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);

  const handlePair = async (
    targetCode: string,
    targetHost: string,
    targetPort: number,
    targetQrToken?: string
  ) => {
    if (!targetQrToken && (!targetCode || targetCode.length !== 6)) {
      Alert.alert('تنبيه', 'يرجى إدخال كود اقتران مكون من 6 أرقام أو مسح باركود الكاشير');
      return;
    }
    if (!targetHost || targetHost === '192.168.1.') {
      Alert.alert('تنبيه', 'يرجى تحديد عنوان IP جهاز الكاشير على الشبكة المحلية أولاً');
      return;
    }

    try {
      setLoading(true);
      const res = await api.pair({
        code: targetCode,
        qrToken: targetQrToken,
        deviceName,
        platform: Platform.OS,
        host: targetHost,
        port: targetPort,
        protocol: 'http'
      });

      haptic.success();
      await setPairing(
        {
          name: res.cafe?.name || 'كافيه التكية',
          code: res.cafe?.code,
          host: targetHost,
          port: targetPort,
          protocol: 'http'
        },
        res.deviceToken
      );

      router.replace('/(auth)/login');
    } catch (err: any) {
      haptic.error();
      const msg = err.message || 'فشل الاقتران. تأكد أن الموبايل والكاشير على نفس شبكة الواي فاي والكود ساري.';
      Alert.alert('خطأ في الاقتران', msg, [
        { text: 'حسناً', onPress: () => setScanned(false) }
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleManualSubmit = () => {
    const p = parseInt(port, 10) || 3000;
    handlePair(code.trim(), host.trim(), p);
  };

  const handleBarCodeScanned = ({ data }: { data: string }) => {
    if (scanned || loading) return;
    setScanned(true);
    haptic.selection();
    const parsed = parsePairingPayload(data);
    if (parsed && (parsed.qrToken || parsed.code)) {
      const targetHost = host.trim();
      const targetPort = parsed.port || parseInt(port, 10) || 3000;
      const cafeLabel = parsed.cafeName || 'جهاز الكاشير المحلي';
      if (!targetHost || targetHost === '192.168.1.') {
        setCode(parsed.code || '');
        setPort(String(targetPort));
        setMode('manual');
        Alert.alert(
          'أدخل عنوان الكاشير',
          `تم قراءة كود الاقتران لكافيه "${cafeLabel}". لحمايتك، أدخل عنوان IP الكاشير المحلي الظاهر على شاشة الكاشير ثم اضغط تأكيد.`,
          [{ text: 'حسناً', onPress: () => setScanned(false) }]
        );
        return;
      }
      // Security (Issue 20): Always show confirmation screen with Cafe Name & local host before sending pairing request
      Alert.alert(
        'تأكيد الاقتران بالكاشير',
        `هل تريد ربط هذا الهاتف بكافيه "${cafeLabel}" على العنوان المحلي ${targetHost}:${targetPort}؟`,
        [
          { text: 'إلغاء', style: 'cancel', onPress: () => setScanned(false) },
          {
            text: 'تأكيد الاقتران',
            onPress: () => handlePair(parsed.code, targetHost, targetPort, parsed.qrToken)
          }
        ]
      );
    } else {
      Alert.alert('كود غير صالح', 'الباركود الذي تم مسحه غير متوافق مع نظام كاشير تقفيلة.', [
        { text: 'حاول مجدداً', onPress: () => setScanned(false) }
      ]);
    }
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.iconCircle}>
            <Smartphone size={32} color={colors.orange} strokeWidth={2} />
          </View>
          <Text style={styles.title}>ربط الموبايل بجهاز الكاشير</Text>
          <Text style={styles.subtitle}>
            افتح شاشة الإعدادات في برنامج الكاشير واضغط على "ربط هاتف ويتر جديد"
          </Text>
        </View>

        {/* Mode Selector */}
        <View style={styles.tabContainer}>
          <TouchableOpacity
            style={[styles.tab, mode === 'manual' && styles.tabActive]}
            onPress={() => {
              haptic.selection();
              setMode('manual');
            }}
          >
            <Smartphone size={18} color={mode === 'manual' ? colors.text : colors.muted} />
            <Text style={[styles.tabText, mode === 'manual' && styles.tabTextActive]}>
              كود الاقتران (6 أرقام)
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, mode === 'qr' && styles.tabActive]}
            onPress={async () => {
              haptic.selection();
              setScanned(false);
              setMode('qr');
              if (!permission?.granted) {
                await requestPermission();
              }
            }}
          >
            <QrCode size={18} color={mode === 'qr' ? colors.text : colors.muted} />
            <Text style={[styles.tabText, mode === 'qr' && styles.tabTextActive]}>
              مسح باركود QR
            </Text>
          </TouchableOpacity>
        </View>

        {/* Content based on mode */}
        {mode === 'manual' ? (
          <View style={styles.card}>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>كود الاقتران (المعروض على شاشة الكاشير)</Text>
              <TextInput
                style={styles.codeInput}
                placeholder="000000"
                placeholderTextColor={colors.muted}
                keyboardType="numeric"
                maxLength={6}
                value={code}
                onChangeText={(t) => setCode(t.replace(/[^0-9]/g, ''))}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>عنوان IP جهاز الكاشير (أو رابط المتابعة عن بُعد)</Text>
              <View style={styles.ipRow}>
                <TextInput
                  style={[styles.input, { flex: 2 }]}
                  placeholder="192.168.1.10"
                  placeholderTextColor={colors.muted}
                  value={host}
                  onChangeText={setHost}
                  keyboardType="default"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <TextInput
                  style={[styles.input, { flex: 1, textAlign: 'center' }]}
                  placeholder="3000"
                  placeholderTextColor={colors.muted}
                  value={port}
                  onChangeText={setPort}
                  keyboardType="numeric"
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>اسم هذا الهاتف (للتعريف بالكاشير)</Text>
              <TextInput
                style={styles.input}
                placeholder="موبايل أحمد"
                placeholderTextColor={colors.muted}
                value={deviceName}
                onChangeText={setDeviceName}
              />
            </View>

            <PrimaryButton
              title="اتصال وتأكيد الاقتران"
              onPress={handleManualSubmit}
              loading={loading}
              disabled={code.length !== 6 || loading}
              style={{ marginTop: 8 }}
            />
          </View>
        ) : (
          <View style={styles.card}>
            {!permission ? (
              <View style={styles.qrPlaceholder}>
                <ActivityIndicator size="large" color={colors.orange} />
                <Text style={styles.qrHint}>جاري تهيئة الكاميرا...</Text>
              </View>
            ) : !permission.granted ? (
              <View style={styles.qrPlaceholder}>
                <Camera size={52} color={colors.orange} />
                <Text style={styles.qrHint}>
                  يحتاج التطبيق إذن استخدام الكاميرا لمسح كود QR من شاشة الكاشير.
                </Text>
                <PrimaryButton
                  title="السماح باستخدام الكاميرا"
                  onPress={requestPermission}
                  style={{ width: '100%', marginTop: 8 }}
                />
              </View>
            ) : (
              <View style={styles.cameraBox}>
                <CameraView
                  style={StyleSheet.absoluteFillObject}
                  facing="back"
                  barcodeScannerSettings={{
                    barcodeTypes: ['qr'],
                  }}
                  onBarcodeScanned={scanned || loading ? undefined : handleBarCodeScanned}
                />
                <View style={styles.scanFrame} />
                {loading ? (
                  <View style={styles.cameraLoadingOverlay}>
                    <ActivityIndicator size="large" color="#FFFFFF" />
                    <Text style={styles.cameraLoadingText}>جاري الاقتران بالكاشير...</Text>
                  </View>
                ) : scanned ? (
                  <TouchableOpacity
                    style={styles.rescanBadge}
                    onPress={() => setScanned(false)}
                  >
                    <Text style={styles.rescanBadgeText}>إعادة المسح</Text>
                  </TouchableOpacity>
                ) : (
                  <View style={styles.cameraInstructionBox}>
                    <Text style={styles.cameraInstructionText}>
                      وجّه الكاميرا نحو كود QR المعروض على شاشة الكاشير
                    </Text>
                  </View>
                )}
              </View>
            )}

            <PrimaryButton
              title="التبديل إلى الإدخال اليدوي للكود"
              onPress={() => setMode('manual')}
            />
          </View>
        )}

        {/* Wi-Fi Hint */}
        <View style={styles.wifiHint}>
          <Wifi size={18} color={colors.orangeText} />
          <Text style={styles.wifiHintText}>
            تأكد أن هاتف الموبايل وجهاز الكاشير متصلان بنفس شبكة الواي فاي المحلية.
          </Text>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 24,
    gap: 20
  },
  header: {
    alignItems: 'center',
    gap: 8,
    marginTop: 10
  },
  iconCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8
  },
  title: {
    fontFamily: fonts.balooBold,
    fontSize: 24,
    color: colors.text,
    textAlign: 'center'
  },
  subtitle: {
    fontFamily: fonts.cairoRegular,
    fontSize: 14,
    color: colors.muted,
    textAlign: 'center',
    lineHeight: 20
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radii.pill,
    padding: 4,
    borderWidth: 1,
    borderColor: colors.border
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    borderRadius: radii.pill
  },
  tabActive: {
    backgroundColor: colors.orange
  },
  tabText: {
    fontFamily: fonts.cairoSemiBold,
    fontSize: 13,
    color: colors.muted
  },
  tabTextActive: {
    color: colors.text
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 16
  },
  inputGroup: {
    gap: 6
  },
  label: {
    fontFamily: fonts.cairoSemiBold,
    fontSize: 13,
    color: colors.muted
  },
  codeInput: {
    height: 60,
    borderRadius: radii.input,
    borderWidth: 2,
    borderColor: colors.orange,
    backgroundColor: colors.bg,
    textAlign: 'center',
    fontFamily: fonts.balooBold,
    fontSize: 28,
    letterSpacing: 8,
    color: colors.text
  },
  ipRow: {
    flexDirection: 'row',
    gap: 8,
    direction: 'ltr'
  },
  input: {
    height: 48,
    borderRadius: radii.input,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
    paddingHorizontal: 14,
    fontFamily: fonts.cairoSemiBold,
    fontSize: 14,
    color: colors.text
  },
  qrPlaceholder: {
    height: 260,
    borderRadius: radii.card,
    borderWidth: 2,
    borderColor: colors.orange,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    gap: 14
  },
  qrHint: {
    fontFamily: fonts.cairoSemiBold,
    fontSize: 14,
    color: colors.muted,
    textAlign: 'center',
    lineHeight: 20
  },
  cameraBox: {
    height: 280,
    borderRadius: radii.card,
    overflow: 'hidden',
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000000'
  },
  scanFrame: {
    width: 190,
    height: 190,
    borderWidth: 2.5,
    borderColor: colors.orange,
    borderRadius: 16,
    backgroundColor: 'transparent'
  },
  cameraInstructionBox: {
    position: 'absolute',
    bottom: 12,
    left: 16,
    right: 16,
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radii.pill
  },
  cameraInstructionText: {
    fontFamily: fonts.cairoSemiBold,
    fontSize: 12,
    color: '#FFFFFF',
    textAlign: 'center'
  },
  cameraLoadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10
  },
  cameraLoadingText: {
    fontFamily: fonts.cairoSemiBold,
    fontSize: 14,
    color: '#FFFFFF'
  },
  rescanBadge: {
    position: 'absolute',
    bottom: 14,
    backgroundColor: colors.orange,
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: radii.pill
  },
  rescanBadgeText: {
    fontFamily: fonts.cairoBold,
    fontSize: 13,
    color: colors.text
  },
  wifiHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.orangeTint,
    padding: 14,
    borderRadius: radii.input,
    borderWidth: 1,
    borderColor: colors.orange
  },
  wifiHintText: {
    flex: 1,
    fontFamily: fonts.cairoSemiBold,
    fontSize: 12.5,
    color: colors.orangeText,
    lineHeight: 18
  }
});
