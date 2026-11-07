import { Text as RNText, type TextProps as RNTextProps } from 'react-native';

import type { ColorToken } from '../colors';
import { useTheme } from '../theme';
import { defaultTextColor, typography, type TextVariant } from '../typography';

type Props = Omit<RNTextProps, 'style'> & {
  variant: TextVariant;
  color?: ColorToken;
  // Semibold at the variant's size: the point in the answer line, a time on a button (DESIGN.md, Feedback reveal).
  strong?: boolean;
  // Figures of one width, for times and counts that sit in a column or change (DESIGN.md, Lettering).
  tabular?: boolean;
};

// The only way screens set type. No style prop on purpose.
export function Text({ variant, color, strong, tabular, ...rest }: Props) {
  const { colors } = useTheme();
  return (
    <RNText
      {...rest}
      style={[
        typography[variant],
        { color: colors[color ?? defaultTextColor[variant]] },
        strong ? { fontWeight: '600' } : null,
        tabular ? { fontVariant: ['tabular-nums'] } : null,
      ]}
    />
  );
}
