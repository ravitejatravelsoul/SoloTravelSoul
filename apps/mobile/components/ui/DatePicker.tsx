import { useState } from 'react';
import {
  View,
  TouchableOpacity,
  Platform,
  Modal,
  StyleSheet,
} from 'react-native';
import DateTimePicker, {
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { Text } from './Text';
import { Colors, Radius, Spacing, FontSize, FontWeight } from '@/constants/theme';

function formatDisplay(date: Date): string {
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

interface DatePickerProps {
  label?: string;
  value: Date;
  onChange: (date: Date) => void;
  minimumDate?: Date;
  maximumDate?: Date;
  error?: string;
}

export function DatePicker({
  label,
  value,
  onChange,
  minimumDate,
  maximumDate,
  error,
}: DatePickerProps) {
  const [showAndroid, setShowAndroid] = useState(false);
  const [showIOSModal, setShowIOSModal] = useState(false);
  const [tempDate, setTempDate] = useState<Date>(value);

  const handlePress = () => {
    if (Platform.OS === 'android') {
      setShowAndroid(true);
    } else {
      setTempDate(value);
      setShowIOSModal(true);
    }
  };

  const handleAndroidChange = (_: DateTimePickerEvent, date?: Date) => {
    setShowAndroid(false);
    if (date) onChange(date);
  };

  const handleIOSDone = () => {
    onChange(tempDate);
    setShowIOSModal(false);
  };

  return (
    <View style={styles.wrapper}>
      {label ? <Text variant="label" style={styles.label}>{label}</Text> : null}

      <TouchableOpacity
        onPress={handlePress}
        activeOpacity={0.7}
        style={[
          styles.field,
          error ? styles.fieldError : styles.fieldDefault,
        ]}
      >
        <Text variant="body">{formatDisplay(value)}</Text>
        <Ionicons name="calendar-outline" size={18} color={Colors.textSecondary} />
      </TouchableOpacity>

      {error ? (
        <Text variant="error" style={styles.hint}>{error}</Text>
      ) : null}

      {/* Android: renders native picker inline */}
      {Platform.OS === 'android' && showAndroid ? (
        <DateTimePicker
          value={value}
          mode="date"
          display="default"
          onChange={handleAndroidChange}
          minimumDate={minimumDate}
          maximumDate={maximumDate}
        />
      ) : null}

      {/* iOS: modal bottom-sheet with spinner — textColor ensures dates are
          always readable regardless of the device's dark/light mode setting */}
      {Platform.OS === 'ios' ? (
        <Modal
          visible={showIOSModal}
          transparent
          animationType="slide"
          onRequestClose={() => setShowIOSModal(false)}
        >
          <View style={styles.overlay}>
            <View style={styles.sheet}>
              <View style={styles.sheetHeader}>
                <TouchableOpacity
                  onPress={() => setShowIOSModal(false)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Text style={styles.cancelLabel}>Cancel</Text>
                </TouchableOpacity>
                <Text variant="label">{label ?? 'Select date'}</Text>
                <TouchableOpacity
                  onPress={handleIOSDone}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Text style={styles.doneLabel}>Done</Text>
                </TouchableOpacity>
              </View>
              <DateTimePicker
                value={tempDate}
                mode="date"
                display="spinner"
                onChange={(_, d) => {
                  if (d) setTempDate(d);
                }}
                minimumDate={minimumDate}
                maximumDate={maximumDate}
                textColor={Colors.textPrimary}
                accentColor={Colors.primary}
              />
            </View>
          </View>
        </Modal>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: 4 },
  label: { marginBottom: 2 },
  field: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: Radius.md,
    backgroundColor: Colors.white,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    minHeight: 48,
  },
  fieldDefault: { borderColor: Colors.border },
  fieldError: { borderColor: Colors.error },
  hint: { marginTop: 2, paddingHorizontal: 2 },
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: Colors.overlay,
  },
  sheet: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: Radius.lg,
    borderTopRightRadius: Radius.lg,
    paddingBottom: Spacing['2xl'],
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  cancelLabel: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
  },
  doneLabel: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
    color: Colors.primary,
  },
});
