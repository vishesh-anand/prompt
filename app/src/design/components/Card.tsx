import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { radius, space } from '../spacing';
import { useTheme } from '../theme';

// Surface color, rounded corners. No border, no shadow.
export function Card({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  return <View style={[styles.card, { backgroundColor: colors.surface }]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.card, padding: space.lg, gap: space.sm },
});
