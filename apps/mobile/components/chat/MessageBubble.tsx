import { View, Text, StyleSheet } from 'react-native';
import { Colors, FontSize, Radius, Spacing, FontWeight } from '@/constants/theme';

interface MessageBubbleProps {
  text: string;
  isMine: boolean;
  senderName?: string;
  status?: 'pending' | 'sent';
}

export function MessageBubble({ text, isMine, senderName, status }: MessageBubbleProps) {
  return (
    <View style={[styles.row, isMine ? styles.rowMine : styles.rowTheirs]}>
      <View
        style={[
          styles.bubble,
          isMine ? styles.bubbleMine : styles.bubbleTheirs,
          status === 'pending' && styles.pending,
        ]}
      >
        {senderName && !isMine && (
          <Text style={styles.senderName} numberOfLines={1}>
            {senderName}
          </Text>
        )}
        <Text style={[styles.text, isMine ? styles.textMine : styles.textTheirs]}>
          {text}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingHorizontal: Spacing.lg,
    marginVertical: 2,
  },
  rowMine: {
    alignItems: 'flex-end',
  },
  rowTheirs: {
    alignItems: 'flex-start',
  },
  bubble: {
    maxWidth: '78%',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: Radius.lg,
  },
  bubbleMine: {
    backgroundColor: Colors.primary,
    borderBottomRightRadius: Radius.sm,
  },
  bubbleTheirs: {
    backgroundColor: Colors.card,
    borderBottomLeftRadius: Radius.sm,
  },
  pending: {
    opacity: 0.55,
  },
  senderName: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    color: Colors.accent,
    marginBottom: 3,
  },
  text: {
    fontSize: FontSize.sm,
    lineHeight: 20,
  },
  textMine: {
    color: Colors.white,
  },
  textTheirs: {
    color: Colors.textPrimary,
  },
});
