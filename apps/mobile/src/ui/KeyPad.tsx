import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, fonts, radii } from '../theme/tokens';
import { haptic } from '../animations';

interface KeyPadProps {
  onPressDigit: (digit: string) => void;
  onDelete: () => void;
}

export const KeyPad: React.FC<KeyPadProps> = ({ onPressDigit, onDelete }) => {
  const keys = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    ['', '0', 'delete']
  ];

  const handlePress = (key: string) => {
    if (!key) return;
    haptic.light();
    if (key === 'delete') {
      onDelete();
    } else {
      onPressDigit(key);
    }
  };

  return (
    <View style={styles.container}>
      {keys.map((row, rIdx) => (
        <View key={rIdx} style={styles.row}>
          {row.map((k, cIdx) => {
            if (k === '') {
              return <View key={cIdx} style={styles.keyEmpty} />;
            }
            const isDelete = k === 'delete';
            return (
              <TouchableOpacity
                key={cIdx}
                activeOpacity={0.65}
                onPress={() => handlePress(k)}
                style={styles.key}
              >
                <Text style={[
                  styles.keyText,
                  isDelete && styles.keyTextDelete
                ]}>
                  {isDelete ? 'حذف' : k}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: 12,
    direction: 'ltr',
    width: '100%'
  },
  row: {
    flexDirection: 'row',
    gap: 12
  },
  key: {
    flex: 1,
    height: 64,
    borderRadius: radii.card,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center'
  },
  keyEmpty: {
    flex: 1,
    height: 64
  },
  keyText: {
    fontFamily: fonts.balooSemiBold,
    fontSize: 26,
    color: colors.text
  },
  keyTextDelete: {
    fontFamily: fonts.cairoSemiBold,
    fontSize: 16,
    color: colors.text
  }
});
