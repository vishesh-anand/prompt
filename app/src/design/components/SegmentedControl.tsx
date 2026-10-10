import { Host, Picker, Text as NativeText } from '@expo/ui/swift-ui';
import { accessibilityLabel, pickerStyle, tag } from '@expo/ui/swift-ui/modifiers';
import { StyleSheet, useWindowDimensions } from 'react-native';

// A native segmented control is 32pt tall at the default text size. As with Button, the Host gets its height up front.
const controlHeight = 32;

type Props<T extends string> = {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  accessibilityLabel: string;
};

// Two or three choices side by side (Work or Everyday conversation).
export function SegmentedControl<T extends string>({ options, value, onChange, accessibilityLabel: label }: Props<T>) {
  const { fontScale } = useWindowDimensions();
  return (
    <Host ignoreSafeArea="all" style={[styles.host, { height: Math.ceil(controlHeight * fontScale) }]}>
      <Picker<string>
        selection={value}
        onSelectionChange={(next) => onChange(next as T)}
        modifiers={[pickerStyle('segmented'), accessibilityLabel(label)]}>
        {options.map((option) => (
          <NativeText key={option.value} modifiers={[tag(option.value)]}>
            {option.label}
          </NativeText>
        ))}
      </Picker>
    </Host>
  );
}

const styles = StyleSheet.create({
  host: { alignSelf: 'stretch' },
});
