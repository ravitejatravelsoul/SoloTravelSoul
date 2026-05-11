import { useState, useCallback, useRef } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Text,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useHaptics } from '@/hooks/useHaptics';
import { Colors, FontSize, Radius, Spacing, FontWeight } from '@/constants/theme';

const MAX_CHARS = 1000;

interface ChatInputProps {
  onSend: (text: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function ChatInput({ onSend, disabled, placeholder = 'Message…' }: ChatInputProps) {
  const [text, setText] = useState('');
  const haptics = useHaptics();
  const sendScale = useRef(new Animated.Value(1)).current;

  const animateSend = useCallback(() => {
    Animated.sequence([
      Animated.timing(sendScale, { toValue: 0.82, duration: 70, useNativeDriver: true }),
      Animated.spring(sendScale, { toValue: 1, useNativeDriver: true, tension: 200, friction: 8 }),
    ]).start();
  }, [sendScale]);

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    haptics.light();
    animateSend();
    onSend(trimmed);
    setText('');
  }, [text, disabled, onSend, haptics, animateSend]);

  const canSend = text.trim().length > 0 && !disabled;
  const nearLimit = text.length > MAX_CHARS - 80;

  return (
    <View style={styles.container}>
      <View style={[styles.inputRow, disabled && styles.inputRowDisabled]}>
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={(t) => setText(t.slice(0, MAX_CHARS))}
          placeholder={placeholder}
          placeholderTextColor={Colors.placeholder}
          multiline
          maxLength={MAX_CHARS}
          returnKeyType="default"
          blurOnSubmit={false}
          editable={!disabled}
        />
        <Animated.View style={{ transform: [{ scale: sendScale }] }}>
          <TouchableOpacity
            style={[styles.sendBtn, !canSend && styles.sendBtnDisabled]}
            onPress={handleSend}
            disabled={!canSend}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="send" size={18} color={canSend ? Colors.white : Colors.placeholder} />
          </TouchableOpacity>
        </Animated.View>
      </View>
      {nearLimit && (
        <Text style={styles.counter}>{MAX_CHARS - text.length} left</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.surface,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    paddingBottom: Platform.OS === 'ios' ? Spacing.xl : Spacing.sm,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: Colors.card,
    borderRadius: Radius.xl,
    paddingLeft: Spacing.md,
    paddingRight: 6,
    paddingVertical: 6,
  },
  inputRowDisabled: {
    opacity: 0.6,
  },
  input: {
    flex: 1,
    fontSize: FontSize.sm,
    color: Colors.textPrimary,
    maxHeight: 100,
    paddingTop: Platform.OS === 'ios' ? 4 : 0,
    paddingBottom: Platform.OS === 'ios' ? 4 : 0,
  },
  sendBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
  },
  sendBtnDisabled: {
    backgroundColor: Colors.chipBackground,
  },
  counter: {
    fontSize: FontSize.xs,
    color: Colors.warning,
    fontWeight: FontWeight.medium,
    textAlign: 'right',
    marginTop: 2,
  },
});
