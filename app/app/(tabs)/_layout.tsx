import { NativeTabs } from 'expo-router/unstable-native-tabs';

import { useTheme } from '@/design';

// Apple's own tab bar. Home and Progress for now; Settings joins in step 9.
export default function TabsLayout() {
  const { colors } = useTheme();
  return (
    <NativeTabs tintColor={colors.accentText}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="house" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="progress">
        <NativeTabs.Trigger.Label>Progress</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="chart.line.uptrend.xyaxis" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
