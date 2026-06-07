import { useState } from 'react';
import { View, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from './Text';
import { Colors, FontSize, Radius, Spacing } from '@/constants/theme';

interface TagInputProps {
  tags: string[];
  onChange: (tags: string[]) => void;
  maxTags?: number;
  placeholder?: string;
}

export function TagInput({ tags, onChange, maxTags = 5, placeholder = 'Add…' }: TagInputProps) {
  const [input, setInput] = useState('');

  const addTag = () => {
    const trimmed = input.trim();
    if (!trimmed || tags.includes(trimmed) || tags.length >= maxTags) return;
    onChange([...tags, trimmed]);
    setInput('');
  };

  const removeTag = (tag: string) => {
    onChange(tags.filter((t) => t !== tag));
  };

  return (
    <View style={styles.container}>
      <View style={styles.tagsRow}>
        {tags.map((tag) => (
          <View key={tag} style={styles.tag}>
            <Text style={styles.tagLabel}>{tag}</Text>
            <TouchableOpacity onPress={() => removeTag(tag)} hitSlop={8}>
              <Ionicons name="close" size={14} color={Colors.white} />
            </TouchableOpacity>
          </View>
        ))}
      </View>
      {tags.length < maxTags && (
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            onSubmitEditing={addTag}
            placeholder={`${placeholder} (${tags.length}/${maxTags})`}
            placeholderTextColor={Colors.placeholder}
            returnKeyType="done"
          />
          <TouchableOpacity onPress={addTag} disabled={!input.trim()} style={styles.addBtn}>
            <Ionicons name="add" size={20} color={Colors.primary} />
          </TouchableOpacity>
        </View>
      )}
      {tags.length >= maxTags && (
        <Text style={styles.maxNote}>Maximum {maxTags} entries</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: Spacing.sm },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.primary,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
  },
  tagLabel: { fontSize: FontSize.sm, color: Colors.white },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
  },
  input: { flex: 1, height: 42, fontSize: FontSize.md, color: Colors.textPrimary },
  addBtn: { padding: 4 },
  maxNote: { fontSize: FontSize.xs, color: Colors.placeholder },
});
