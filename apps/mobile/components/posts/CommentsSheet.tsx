import { useState, useCallback, useRef } from 'react';
import {
  View,
  StyleSheet,
  Modal,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text, EmptyState } from '@/components/ui';
import { CommentItem } from './CommentItem';
import { useComments } from '@/hooks/useComments';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';

interface Props {
  postId: string;
  authorId: string;
  onClose: () => void;
}

const MAX_COMMENT = 500;

export function CommentsSheet({ postId, authorId, onClose }: Props) {
  const { comments, loading, submitting, submit, remove, edit } = useComments(postId, authorId);
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<{ id: string; name: string } | null>(null);
  const inputRef = useRef<TextInput>(null);

  const handleReply = useCallback((commentId: string, authorName: string) => {
    setReplyTo({ id: commentId, name: authorName });
    inputRef.current?.focus();
  }, []);

  const cancelReply = useCallback(() => setReplyTo(null), []);

  const handleSend = useCallback(async () => {
    if (!text.trim() || submitting) return;
    const t = text.trim();
    setText('');
    const parentId = replyTo?.id ?? null;
    setReplyTo(null);
    await submit(t, parentId);
  }, [text, submitting, replyTo, submit]);

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} onPress={onClose} />
        <KeyboardAvoidingView
          behavior="padding"
          style={styles.sheet}
        >
          {/* ── Handle bar ── */}
          <View style={styles.handle} />

          {/* ── Title ── */}
          <View style={styles.titleRow}>
            <Text style={styles.title}>Comments</Text>
            <TouchableOpacity onPress={onClose} hitSlop={12}>
              <Ionicons name="close" size={22} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* ── Comment list ── */}
          {loading ? (
            <ActivityIndicator size="small" color={Colors.primary} style={styles.loader} />
          ) : (
            <FlatList
              data={comments}
              keyExtractor={(c) => c.commentId}
              renderItem={({ item }) => (
                <CommentItem
                  comment={item}
                  onReply={handleReply}
                  onDelete={remove}
                  onEdit={edit}
                />
              )}
              contentContainerStyle={styles.list}
              ListEmptyComponent={
                <EmptyState
                  emoji="💬"
                  title="No comments yet"
                  subtitle="Be the first to comment."
                />
              }
            />
          )}

          {/* ── Reply indicator ── */}
          {replyTo && (
            <View style={styles.replyBar}>
              <Text style={styles.replyLabel}>Replying to {replyTo.name}</Text>
              <TouchableOpacity onPress={cancelReply} hitSlop={8}>
                <Ionicons name="close-circle" size={16} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>
          )}

          {/* ── Input ── */}
          <View style={styles.inputRow}>
            <TextInput
              ref={inputRef}
              style={styles.input}
              value={text}
              onChangeText={(t) => t.length <= MAX_COMMENT && setText(t)}
              placeholder={replyTo ? `Reply to ${replyTo.name}...` : 'Add a comment...'}
              placeholderTextColor={Colors.placeholder}
              multiline
              maxLength={MAX_COMMENT}
            />
            <TouchableOpacity
              style={[styles.sendBtn, (!text.trim() || submitting) && styles.sendBtnDisabled]}
              onPress={handleSend}
              disabled={!text.trim() || submitting}
            >
              {submitting ? (
                <ActivityIndicator size="small" color={Colors.white} />
              ) : (
                <Ionicons name="send" size={18} color={Colors.white} />
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: Radius['2xl'],
    borderTopRightRadius: Radius['2xl'],
    maxHeight: '80%',
    paddingBottom: Platform.OS === 'ios' ? 34 : Spacing.lg,
  },
  handle: {
    width: 36,
    height: 4,
    backgroundColor: Colors.border,
    borderRadius: Radius.full,
    alignSelf: 'center',
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing['2xl'],
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  title: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
  },
  loader: { padding: Spacing['3xl'] },
  list: {
    padding: Spacing['2xl'],
    paddingBottom: Spacing.md,
    flexGrow: 1,
  },
  replyBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing['2xl'],
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.chipBackground,
  },
  replyLabel: { fontSize: FontSize.sm, color: Colors.textSecondary },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.sm,
    paddingHorizontal: Spacing['2xl'],
    paddingVertical: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
  },
  input: {
    flex: 1,
    backgroundColor: Colors.chipBackground,
    borderRadius: Radius.xl,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontSize: FontSize.md,
    color: Colors.textPrimary,
    maxHeight: 100,
  },
  sendBtn: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.full,
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: { opacity: 0.5 },
});
