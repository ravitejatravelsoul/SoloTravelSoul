import { memo, useState, useCallback } from 'react';
import { View, StyleSheet, TouchableOpacity, Alert, TextInput } from 'react-native';
import { useModerationActions } from '@/hooks/useModerationActions';
import { Ionicons } from '@expo/vector-icons';
import { Text, Avatar } from '@/components/ui';
import { useAuthStore } from '@/stores/authStore';
import { getUserInitials } from '@solotravelsoul/shared';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';
import type { PostComment } from '@solotravelsoul/shared';

function timeAgo(date: Date): string {
  const diff = (Date.now() - date.getTime()) / 1000;
  if (diff < 60) return 'now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

interface Props {
  comment: PostComment;
  onReply?: (commentId: string, authorName: string) => void;
  onDelete?: (commentId: string, parentCommentId: string | null) => void;
  onEdit?: (commentId: string, text: string) => void;
  isReply?: boolean;
}

export const CommentItem = memo(function CommentItem({ comment, onReply, onDelete, onEdit, isReply }: Props) {
  const myUid = useAuthStore((s) => s.user?.uid ?? '');
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(comment.text);
  const isOwner = myUid === comment.authorId;

  const moderation = useModerationActions();

  const handleLongPress = useCallback(() => {
    if (!isOwner) {
      if (!comment.isDeleted) {
        moderation.openMenu({ targetType: 'comment', targetId: comment.commentId, authorId: comment.authorId, authorName: comment.authorName, label: 'Comment' });
      }
      return;
    }
    Alert.alert('Comment', undefined, [
      { text: 'Edit', onPress: () => setEditing(true) },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => onDelete?.(comment.commentId, comment.parentCommentId),
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, [isOwner, comment, onDelete, moderation]);

  const handleEditSave = useCallback(() => {
    if (editText.trim() && editText.trim() !== comment.text) {
      onEdit?.(comment.commentId, editText.trim());
    }
    setEditing(false);
  }, [editText, comment, onEdit]);

  const initials = getUserInitials(comment.authorName);

  if (comment.isDeleted) {
    return (
      <View style={[styles.row, isReply && styles.replyRow]}>
        <Text style={styles.deleted}>(Comment deleted)</Text>
      </View>
    );
  }

  return (
    <TouchableOpacity
      style={[styles.row, isReply && styles.replyRow]}
      onLongPress={handleLongPress}
      activeOpacity={0.9}
    >
      <Avatar uri={comment.authorPhoto} initials={initials} size={isReply ? 28 : 34} />
      <View style={styles.content}>
        <View style={styles.bubble}>
          <Text style={styles.author}>{comment.authorName}</Text>
          {editing ? (
            <TextInput
              value={editText}
              onChangeText={setEditText}
              onBlur={handleEditSave}
              onSubmitEditing={handleEditSave}
              autoFocus
              style={styles.editInput}
              multiline
            />
          ) : (
            <Text style={styles.text}>{comment.text}</Text>
          )}
        </View>
        <View style={styles.meta}>
          <Text style={styles.time}>{timeAgo(comment.createdAt)}</Text>
          {onReply && !isReply && (
            <TouchableOpacity
              onPress={() => onReply(comment.commentId, comment.authorName)}
              hitSlop={8}
            >
              <Text style={styles.replyBtn}>Reply</Text>
            </TouchableOpacity>
          )}
          {comment.replyCount > 0 && !isReply && (
            <Text style={styles.replyCount}>{comment.replyCount} repl{comment.replyCount === 1 ? 'y' : 'ies'}</Text>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
  },
  replyRow: {
    marginLeft: 42,
  },
  content: { flex: 1 },
  bubble: {
    backgroundColor: Colors.chipBackground,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  author: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
    marginBottom: 2,
  },
  text: {
    fontSize: FontSize.sm,
    color: Colors.textPrimary,
    lineHeight: 18,
  },
  editInput: {
    fontSize: FontSize.sm,
    color: Colors.textPrimary,
    padding: 0,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginTop: 4,
    paddingHorizontal: 4,
  },
  time: { fontSize: FontSize.xs, color: Colors.placeholder },
  replyBtn: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: Colors.textSecondary },
  replyCount: { fontSize: FontSize.xs, color: Colors.primary },
  deleted: { fontSize: FontSize.sm, color: Colors.placeholder, fontStyle: 'italic' },
});
