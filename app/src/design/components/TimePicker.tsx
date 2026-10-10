import { DatePicker, Host } from '@expo/ui/swift-ui';
import { accessibilityLabel, datePickerStyle } from '@expo/ui/swift-ui/modifiers';
import { StyleSheet } from 'react-native';

// The native hour-and-minute wheel is 216pt tall.
const wheelHeight = 216;

type Props = {
  value: Date;
  onChange: (value: Date) => void;
  accessibilityLabel: string;
};

// Pick a time of day.
export function TimePicker({ value, onChange, accessibilityLabel: label }: Props) {
  return (
    <Host ignoreSafeArea="all" style={styles.host}>
      <DatePicker
        selection={value}
        displayedComponents={['hourAndMinute']}
        onDateChange={onChange}
        modifiers={[datePickerStyle('wheel'), accessibilityLabel(label)]}
      />
    </Host>
  );
}

const styles = StyleSheet.create({
  host: { alignSelf: 'stretch', height: wheelHeight },
});
