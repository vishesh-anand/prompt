import { SymbolView } from 'expo-symbols';
import { StyleSheet, View } from 'react-native';

import { space } from '../spacing';
import { useTheme } from '../theme';
import { Text } from './Text';

type Props = {
  value: string;
  label: string;
  // An improvement, e.g. { direction: 'down', text: '4 fewer filler words' }.
  // Always an arrow plus words, never color alone.
  change?: { direction: 'up' | 'down'; text: string };
};

export function Stat({ value, label, change }: Props) {
  const { colors } = useTheme();
  return (
    <View style={styles.stat} accessible accessibilityLabel={`${label}: ${value}${change ? `, ${change.text}` : ''}`}>
      <Text variant="label">{label}</Text>
      <Text variant="bigNumber">{value}</Text>
      {change ? (
        <View style={styles.change}>
          <SymbolView name={change.direction === 'up' ? 'arrow.up' : 'arrow.down'} size={14} tintColor={colors.positive} />
          <Text variant="label" color="positive">
            {change.text}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stat: { gap: space.xs },
  change: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
});
