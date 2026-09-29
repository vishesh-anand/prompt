import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { screenMargin, space } from '../spacing';
import { useTheme } from '../theme';

type Props = {
  children: ReactNode;
  scroll?: boolean;
};

// Full-screen container: themed background, kept clear of the notch and home bar, 24pt side margins.
export function Screen({ children, scroll }: Props) {
  const { colors } = useTheme();
  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: colors.background }]}>
      {scroll ? (
        <ScrollView contentContainerStyle={styles.content}>{children}</ScrollView>
      ) : (
        <View style={[styles.fill, styles.content]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { paddingHorizontal: screenMargin, paddingVertical: space.xl },
});
