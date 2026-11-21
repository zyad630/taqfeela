import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import { colors } from '../theme/tokens';

interface PinDotsProps {
  length?: number;
  value: string;
  isError?: boolean;
}

export const PinDots: React.FC<PinDotsProps> = ({ length = 4, value, isError = false }) => {
  const shakeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isError) {
      Animated.sequence([
        Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true })
      ]).start();
    }
  }, [isError]);

  return (
    <Animated.View style={[styles.container, { transform: [{ translateX: shakeAnim }] }]}>
      {Array.from({ length }).map((_, index) => {
        const isFilled = index < value.length;
        return (
          <View
            key={index}
            style={[
              styles.dot,
              isFilled && styles.dotFilled,
              isError && styles.dotError
            ]}
          />
        );
      })}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: 16,
    direction: 'ltr',
    justifyContent: 'center',
    alignItems: 'center'
  },
  dot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colors.orange,
    backgroundColor: 'transparent'
  },
  dotFilled: {
    backgroundColor: colors.orange
  },
  dotError: {
    borderColor: colors.red,
    backgroundColor: colors.red
  }
});
