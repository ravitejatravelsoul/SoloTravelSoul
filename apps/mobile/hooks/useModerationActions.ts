import { useCallback } from 'react';
import { Alert } from 'react-native';
import { router } from 'expo-router';
import type { ReportTargetType } from '@solotravelsoul/shared';
import { useAuthStore } from '@/stores/authStore';
import { useBlockStore } from '@/stores/blockStore';
import { useUIStore } from '@/stores/uiStore';

/**
 * Report / block menu for user-generated content (App Store guideline 1.2:
 * users must be able to flag objectionable content and block abusive users).
 */
export function useModerationActions() {
  const myUid = useAuthStore((s) => s.user?.uid ?? '');
  const blockUser = useBlockStore((s) => s.blockUser);
  const addToast = useUIStore((s) => s.addToast);

  const report = useCallback((targetType: ReportTargetType, targetId: string) => {
    router.push({ pathname: '/(app)/community/report', params: { targetType, targetId } } as never);
  }, []);

  const confirmBlock = useCallback(
    (authorId: string, authorName: string, onBlocked?: () => void) => {
      Alert.alert(
        `Block ${authorName || 'this traveler'}?`,
        "You won't see their posts, journals or comments, and they can't message you.",
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Block',
            style: 'destructive',
            onPress: async () => {
              try {
                await blockUser(authorId);
                addToast('Blocked.', 'success');
                onBlocked?.();
              } catch {
                addToast('Could not block. Please try again.', 'error');
              }
            },
          },
        ]
      );
    },
    [blockUser, addToast]
  );

  /** Opens the menu for content by someone else; does nothing for your own content. */
  const openMenu = useCallback(
    (opts: { targetType: ReportTargetType; targetId: string; authorId: string; authorName: string; label: string; onBlocked?: () => void }) => {
      if (!opts.authorId || opts.authorId === myUid) return;
      Alert.alert(opts.label, undefined, [
        { text: `Report ${opts.label.toLowerCase()}`, onPress: () => report(opts.targetType, opts.targetId) },
        { text: `Block ${opts.authorName || 'author'}`, style: 'destructive', onPress: () => confirmBlock(opts.authorId, opts.authorName, opts.onBlocked) },
        { text: 'Cancel', style: 'cancel' },
      ]);
    },
    [myUid, report, confirmBlock]
  );

  return { openMenu, report, confirmBlock, myUid };
}
