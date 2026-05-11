import {
  View,
  TextInput,
  type TextInputProps,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Text } from './Text';
import { Colors, FontSize, Radius, Spacing } from '@/constants/theme';

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  hint?: string;
  secure?: boolean;
}

export function Input({
  label,
  error,
  hint,
  secure = false,
  style,
  ...props
}: InputProps) {
  const [visible, setVisible] = useState(false);

  return (
    <View style={styles.wrapper}>
      {label ? <Text variant="label" style={styles.label}>{label}</Text> : null}

      <View style={[styles.inputRow, error ? styles.inputError : styles.inputDefault]}>
        <TextInput
          style={[styles.input, style]}
          placeholderTextColor={Colors.placeholder}
          secureTextEntry={secure && !visible}
          autoCapitalize={secure ? 'none' : props.autoCapitalize}
          autoCorrect={secure ? false : props.autoCorrect}
          {...props}
        />
        {secure ? (
          <TouchableOpacity
            onPress={() => setVisible((v) => !v)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={styles.eyeIcon}
          >
            <Ionicons
              name={visible ? 'eye-off-outline' : 'eye-outline'}
              size={20}
              color={Colors.textSecondary}
            />
          </TouchableOpacity>
        ) : null}
      </View>

      {error ? (
        <Text variant="error" style={styles.hint}>{error}</Text>
      ) : hint ? (
        <Text variant="caption" style={styles.hint}>{hint}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: 4 },
  label: { marginBottom: 2 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: Radius.md,
    backgroundColor: Colors.white,
    paddingHorizontal: Spacing.md,
    minHeight: 48,
  },
  inputDefault: { borderColor: Colors.border },
  inputError: { borderColor: Colors.error },
  input: {
    flex: 1,
    fontSize: FontSize.md,
    color: Colors.textPrimary,
    paddingVertical: Spacing.sm,
  },
  eyeIcon: { paddingLeft: Spacing.sm },
  hint: { marginTop: 2, paddingHorizontal: 2 },
});
