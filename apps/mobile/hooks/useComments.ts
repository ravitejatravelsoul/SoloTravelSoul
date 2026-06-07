import { useState, useEffect, useCallback, useRef } from 'react';
import {
  addComment,
  editComment,
  deleteComment,
  subscribeComments,
  subscribeReplies,
  createSocialNotification,
} from '@solotravelsoul/firebase';
import { useAuthStore } from '@/stores/authStore';
import type { PostComment } from '@solotravelsoul/shared';

const COMMENTS_PAGE = 50;

export function useComments(postId: string, postAuthorId: string) {
  const profile = useAuthStore((s) => s.profile);
  const myUid = useAuthStore((s) => s.user?.uid ?? '');

  const [comments, setComments] = useState<PostComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const unsubRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!postId) return;
    setLoading(true);
    unsubRef.current?.();
    unsubRef.current = subscribeComments(postId, COMMENTS_PAGE, (data) => {
      setComments(data);
      setLoading(false);
    });
    return () => { unsubRef.current?.(); unsubRef.current = null; };
  }, [postId]);

  const submit = useCallback(async (text: string, parentCommentId: string | null = null) => {
    if (!profile || !text.trim()) return;
    setSubmitting(true);
    try {
      await addComment({
        postId,
        authorId: myUid,
        authorName: profile.name,
        authorPhoto: profile.photoURL,
        text: text.trim(),
        parentCommentId,
      });

      // Notify post author (skip if commenting on own post)
      if (myUid !== postAuthorId) {
        await createSocialNotification({
          userId: postAuthorId,
          type: 'commented_post',
          actorId: myUid,
          actorName: profile.name,
          actorPhoto: profile.photoURL,
          targetId: postId,
          targetTitle: text.slice(0, 80),
        }).catch(() => {});
      }
    } finally {
      setSubmitting(false);
    }
  }, [profile, myUid, postId, postAuthorId]);

  const remove = useCallback(async (commentId: string, parentCommentId: string | null) => {
    await deleteComment(commentId, postId, parentCommentId);
  }, [postId]);

  const edit = useCallback(async (commentId: string, text: string) => {
    if (!text.trim()) return;
    await editComment(commentId, text.trim());
  }, []);

  return { comments, loading, submitting, submit, remove, edit };
}

// ── useReplies — for a single comment thread ──────────────────────────────────

export function useReplies(parentCommentId: string) {
  const [replies, setReplies] = useState<PostComment[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const unsubRef = useRef<(() => void) | null>(null);

  const expand = useCallback(() => {
    setExpanded(true);
    setLoading(true);
    unsubRef.current?.();
    unsubRef.current = subscribeReplies(parentCommentId, (data) => {
      setReplies(data);
      setLoading(false);
    });
  }, [parentCommentId]);

  useEffect(() => {
    return () => { unsubRef.current?.(); unsubRef.current = null; };
  }, []);

  return { replies, loading, expanded, expand };
}
