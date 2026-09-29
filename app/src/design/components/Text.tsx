import { Text as RNText, type TextProps as RNTextProps } from 'react-native';

import type { ColorToken } from '../colors';
import { useTheme } from '../theme';
import { defaultTextColor, typography, type TextVariant } from '../typography';

type Props = Omit<RNTextProps, 'style'> & {
  variant: TextVariant;
  color?: ColorToken;
};

// The only way screens set type. No style prop on purpose.
export function Text({ variant, color, ...rest }: Props) {
  const { colors } = useTheme();
  return <RNText {...rest} style={[typography[variant], { color: colors[color ?? defaultTextColor[variant]] }]} />;
}
