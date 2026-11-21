import React from 'react';
import { View, StyleSheet, StatusBar, StyleProp, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../theme/tokens';

interface ScreenProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  safeBottom?: boolean;
}

export const Screen: React.FC<ScreenProps> = ({ children, style, safeBottom = true }) => {
  return (
    <SafeAreaView
      style={[styles.container, style]}
      edges={['top', 'left', 'right', ...(safeBottom ? ['bottom' as const] : [])]}
    >
      <StatusBar barStyle="dark-content" backgroundColor={colors.bg} />
      {children}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    direction: 'rtl'
  }
});
