import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  Image,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator
} from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '../../src/ui/Screen';
import { PrimaryButton } from '../../src/ui/PrimaryButton';
import { colors, fonts, radii } from '../../src/theme/tokens';
import { api } from '../../src/api/client';
import { useAppStore } from '../../src/store/useAppStore';
import { haptic } from '../../src/animations';
import { User, Lock, Eye, EyeOff } from 'lucide-react-native';

export default function WaiterLoginScreen() {
  const router = useRouter();
  const { cafeInfo, setLogin, isOnline, isPaired } = useAppStore();

  useEffect(() => {
    if (!isPaired) {
      router.replace('/(auth)/pair');
    }
  }, [isPaired]);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isError, setIsError] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [lockoutTime, setLockoutTime] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const passwordRef = useRef<TextInput>(null);

  // Lockout countdown timer
  useEffect(() => {
    if (lockoutTime <= 0) return;
    const t = setInterval(() => {
      setLockoutTime(prev => {
        if (prev <= 1) {
          clearInterval(t);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [lockoutTime]);

  const handleLogin = async () => {
    if (lockoutTime > 0 || submitting) return;

    const trimUser = username.trim();
    const trimPass = password.trim();

    if (!trimUser) {
      setIsError(true);
      setErrorMessage('اكتب اسم المستخدم');
      return;
    }
    if (!trimPass) {
      setIsError(true);
      setErrorMessage('اكتب كلمة السر');
      return;
    }

    try {
      setSubmitting(true);
      setIsError(false);
      setErrorMessage('');

      const res = await api.loginByUsername(trimUser, trimPass);
      const userObj = res.waiter || res.user;

      haptic.success();
      await setLogin(userObj, res.token || 'mock_token');
      if (userObj?.role === 'admin') {
        router.replace('/(admin)/home');
      } else {
        router.replace('/(waiter)/tables');
      }
    } catch (err: any) {
      haptic.error();
      setIsError(true);

      if (err.status === 429 || err.code === 'PIN_LOCKED' || err.code === 'USER_LOCKED') {
        const lockSec = err.lockTime || err.waitSec || 60;
        setLockoutTime(lockSec);
        setErrorMessage(`تم قفل الحساب لكثرة المحاولات. انتظر ${lockSec} ثانية`);
      } else if (err.status === 404) {
        setErrorMessage('اسم المستخدم غير موجود');
      } else if (err.status === 401) {
        setErrorMessage('كلمة السر غلط');
      } else if (err.code === 'NETWORK_ERROR') {
        setErrorMessage('مفيش اتصال بالكاشير');
      } else {
        setErrorMessage(err.message || 'خطأ في تسجيل الدخول');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.container}
          bounces={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Top Decorative Lattice */}
          <View style={styles.topLattice} />

          {/* 1. Official Logo Card */}
          <View style={styles.heroSection}>
            <View style={styles.logoCard}>
              <Image
                source={require('../../assets/taqfeela-logo.jpg')}
                style={styles.logoImage}
                resizeMode="cover"
              />
            </View>
            <Text style={styles.cafeName}>{cafeInfo?.name || 'كافيه التكية'}</Text>

            {/* Connection Chip */}
            <View style={[styles.statusChip, !isOnline && styles.statusChipOffline]}>
              <View style={[styles.statusDot, !isOnline && { backgroundColor: colors.orangeText }]} />
              <Text style={styles.statusText}>
                {isOnline ? 'متصل بالكاشير' : 'مفيش اتصال بالكاشير'}
              </Text>
            </View>
          </View>

          {/* 2. Login Form */}
          <View style={styles.formContainer}>
            <Text style={styles.formTitle}>تسجيل الدخول</Text>

            {/* Username Input */}
            <View style={[styles.inputContainer, isError && !username.trim() && styles.inputError]}>
              <User size={20} color={colors.muted} strokeWidth={2} />
              <TextInput
                style={styles.textInput}
                placeholder="اسم المستخدم"
                placeholderTextColor={colors.muted}
                value={username}
                onChangeText={(text) => {
                  setUsername(text);
                  setIsError(false);
                  setErrorMessage('');
                }}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="next"
                onSubmitEditing={() => passwordRef.current?.focus()}
                editable={lockoutTime <= 0 && !submitting}
              />
            </View>

            {/* Password Input */}
            <View style={[styles.inputContainer, isError && !password.trim() && styles.inputError]}>
              <Lock size={20} color={colors.muted} strokeWidth={2} />
              <TextInput
                ref={passwordRef}
                style={styles.textInput}
                placeholder="كلمة السر أو رمز الـ PIN"
                placeholderTextColor={colors.muted}
                value={password}
                onChangeText={(text) => {
                  setPassword(text);
                  setIsError(false);
                  setErrorMessage('');
                }}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="go"
                onSubmitEditing={handleLogin}
                editable={lockoutTime <= 0 && !submitting}
              />
              <TouchableOpacity
                onPress={() => setShowPassword(!showPassword)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                {showPassword ? (
                  <EyeOff size={20} color={colors.muted} strokeWidth={2} />
                ) : (
                  <Eye size={20} color={colors.muted} strokeWidth={2} />
                )}
              </TouchableOpacity>
            </View>

            {/* Error Message */}
            {errorMessage ? (
              <Text style={styles.errorText}>{errorMessage}</Text>
            ) : lockoutTime > 0 ? (
              <Text style={styles.lockoutText}>مغلق مؤقتاً: {lockoutTime} ثانية</Text>
            ) : null}

            {/* Login Button */}
            <PrimaryButton
              title={submitting ? 'جاري الدخول...' : 'دخول'}
              onPress={handleLogin}
              disabled={lockoutTime > 0 || submitting}
              style={styles.loginButton}
            />

            <Text style={styles.hintText}>
              استخدم نفس اسم المستخدم وكلمة السر المسجلة في الكاشير
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: 32,
    paddingHorizontal: 24,
    paddingBottom: 24,
    gap: 18,
    alignItems: 'center'
  },
  topLattice: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 180,
    opacity: 0.15,
    backgroundColor: colors.orangeTint
  },
  heroSection: {
    alignItems: 'center',
    gap: 10,
    width: '100%'
  },
  logoCard: {
    width: '100%',
    maxWidth: 342,
    height: 180,
    borderRadius: radii.hero,
    overflow: 'hidden',
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.orange,
    shadowColor: '#EE7F14',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3
  },
  logoImage: {
    width: '100%',
    height: 240,
    marginTop: -8
  },
  cafeName: {
    fontFamily: fonts.cairoBold,
    fontSize: 20,
    color: colors.text,
    textAlign: 'center',
    marginTop: 2
  },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border
  },
  statusChipOffline: {
    backgroundColor: colors.orangeTint,
    borderColor: colors.orange
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.green
  },
  statusText: {
    fontFamily: fonts.cairoSemiBold,
    fontSize: 13,
    color: colors.muted
  },
  // Form
  formContainer: {
    width: '100%',
    maxWidth: 342,
    gap: 14,
    paddingTop: 6
  },
  formTitle: {
    fontFamily: fonts.cairoBold,
    fontSize: 18,
    color: colors.text,
    textAlign: 'center',
    marginBottom: 4
  },
  inputContainer: {
    height: 56,
    borderRadius: radii.input,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 12
  },
  inputError: {
    borderColor: colors.red,
    borderWidth: 1.5
  },
  textInput: {
    flex: 1,
    fontFamily: fonts.cairoSemiBold,
    fontSize: 16,
    color: colors.text,
    textAlign: 'right'
  },
  errorText: {
    fontFamily: fonts.cairoBold,
    fontSize: 13,
    color: colors.red,
    textAlign: 'center'
  },
  lockoutText: {
    fontFamily: fonts.cairoBold,
    fontSize: 13,
    color: colors.orangeText,
    textAlign: 'center'
  },
  loginButton: {
    marginTop: 4
  },
  hintText: {
    fontFamily: fonts.cairoRegular,
    fontSize: 12,
    color: colors.muted,
    textAlign: 'center'
  }
});
