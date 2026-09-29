import { useColorScheme } from 'react-native';

import { dark, light, type Palette } from './colors';

// Follows the phone's Light/Dark setting. Re-renders when it changes.
export function useTheme(): { colors: Palette; scheme: 'light' | 'dark' } {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  return { colors: scheme === 'dark' ? dark : light, scheme };
}
