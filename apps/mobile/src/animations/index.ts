import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

export const haptic = {
  light: () => {
    if (Platform.OS !== 'web') {
      try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch (_) {}
    }
  },
  medium: () => {
    if (Platform.OS !== 'web') {
      try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch (_) {}
    }
  },
  success: () => {
    if (Platform.OS !== 'web') {
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch (_) {}
    }
  },
  error: () => {
    if (Platform.OS !== 'web') {
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); } catch (_) {}
    }
  },
  selection: () => {
    if (Platform.OS !== 'web') {
      try { Haptics.selectionAsync(); } catch (_) {}
    }
  }
};

export const springConfig = {
  damping: 15,
  mass: 1,
  stiffness: 120,
  overshootClamping: false,
  restSpeedThreshold: 0.001,
  restDisplacementThreshold: 0.001
};
