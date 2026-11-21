import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { colors, fonts, radii } from '../theme/tokens';
import { WifiOff, AlertCircle, Info } from 'lucide-react-native';

interface BannerProps {
  kind?: 'offline' | 'alert' | 'info';
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

export const Banner: React.FC<BannerProps> = ({
  kind = 'offline',
  title,
  message,
  actionLabel,
  onAction
}) => {
  const isOffline = kind === 'offline';
  const isAlert = kind === 'alert';

  const icon = isOffline ? (
    <WifiOff size={24} color={colors.orangeText} strokeWidth={1.8} />
  ) : isAlert ? (
    <AlertCircle size={24} color={colors.red} strokeWidth={1.8} />
  ) : (
    <Info size={24} color={colors.brown} strokeWidth={1.8} />
  );

  return (
    <View style={[
      styles.container,
      isOffline && styles.containerOffline,
      isAlert && styles.containerAlert
    ]}>
      <View style={styles.iconWrapper}>{icon}</View>
      <View style={styles.textWrapper}>
        <Text style={[
          styles.title,
          isOffline && styles.titleOffline,
          isAlert && styles.titleAlert
        ]}>
          {title}
        </Text>
        <Text style={styles.message}>{message}</Text>
        {actionLabel && onAction && (
          <TouchableOpacity activeOpacity={0.7} onPress={onAction} style={styles.actionBtn}>
            <Text style={styles.actionText}>{actionLabel}</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 14,
    borderRadius: radii.card,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12
  },
  containerOffline: {
    backgroundColor: colors.orangeTint,
    borderColor: colors.orange
  },
  containerAlert: {
    backgroundColor: colors.redTint,
    borderColor: colors.red
  },
  iconWrapper: {
    marginTop: 2
  },
  textWrapper: {
    flex: 1,
    gap: 2
  },
  title: {
    fontFamily: fonts.cairoBold,
    fontSize: 15,
    color: colors.text
  },
  titleOffline: {
    color: colors.orangeText
  },
  titleAlert: {
    color: colors.red
  },
  message: {
    fontFamily: fonts.cairoRegular,
    fontSize: 13,
    lineHeight: 19,
    color: colors.text2
  },
  actionBtn: {
    marginTop: 6,
    alignSelf: 'flex-start'
  },
  actionText: {
    fontFamily: fonts.cairoBold,
    fontSize: 13,
    color: colors.orangeText,
    textDecorationLine: 'underline'
  }
});
