import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, fonts, radii } from '../theme/tokens';
import { haptic } from '../animations';
import { Minus, Plus } from 'lucide-react-native';

interface StepperProps {
  qty: number;
  onIncrement: () => void;
  onDecrement: () => void;
}

export const Stepper: React.FC<StepperProps> = ({ qty, onIncrement, onDecrement }) => {
  return (
    <View style={styles.container}>
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => {
          haptic.light();
          onDecrement();
        }}
        style={styles.minusBtn}
        accessibilityLabel="تقليل الكمية"
      >
        <Minus size={20} color={colors.text} strokeWidth={2.4} />
      </TouchableOpacity>

      <Text style={styles.qtyText}>{qty}</Text>

      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => {
          haptic.light();
          onIncrement();
        }}
        style={styles.plusBtn}
        accessibilityLabel="زيادة الكمية"
      >
        <Plus size={20} color={colors.text} strokeWidth={2.4} />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    direction: 'ltr',
    padding: 4,
    borderRadius: radii.input,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.orange
  },
  minusBtn: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center'
  },
  qtyText: {
    minWidth: 30,
    textAlign: 'center',
    fontFamily: fonts.balooBold,
    fontSize: 22,
    color: colors.text
  },
  plusBtn: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: colors.orange,
    justifyContent: 'center',
    alignItems: 'center'
  }
});
