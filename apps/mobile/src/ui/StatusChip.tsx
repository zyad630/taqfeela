import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, fonts, radii } from '../theme/tokens';

interface StatusChipProps {
  status: 'connected' | 'offline' | 'stale';
  label?: string;
}

export const StatusChip: React.FC<StatusChipProps> = ({ status, label }) => {
  const isConnected = status === 'connected';
  const isStale = status === 'stale';

  const defaultText = isConnected
    ? 'متصل'
    : isStale
    ? 'بيانات سابقة'
    : 'مفيش اتصال بالكاشير';

  const dotColor = isConnected
    ? colors.green
    : isStale
    ? colors.orangeText
    : colors.red;

  return (
    <View style={[
      styles.chip,
      !isConnected && styles.chipOffline
    ]}>
      <View style={[styles.dot, { backgroundColor: dotColor }]} />
      <Text style={styles.text}>{label || defaultText}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border
  },
  chipOffline: {
    backgroundColor: colors.orangeTint,
    borderColor: colors.orange
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4
  },
  text: {
    fontFamily: fonts.cairoSemiBold,
    fontSize: 13,
    color: colors.muted
  }
});
