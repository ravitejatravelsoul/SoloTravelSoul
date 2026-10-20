import { useCallback, useEffect, useRef, useState } from 'react';
import { isEmailVerifiedInToken, refreshEmailVerification, sendVerificationEmail } from '@solotravelsoul/firebase';
import { useAuthStore } from '@/stores/authStore';

const RESEND_COOLDOWN_MS = 60_000;

/**
 * Whether the signed-in e-mail is verified, as the server sees it (the ID token's claim, never just client state).
 * Needed only for group invitations addressed to this e-mail; nothing else in the app waits on it.
 */
export function useEmailVerification() {
  const uid = useAuthStore((s) => s.user?.uid);
  const email = useAuthStore((s) => s.user?.email ?? '');
  const [verified, setVerified] = useState<boolean | null>(null);
  const [sending, setSending] = useState(false);
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const lastSent = useRef(0);

  useEffect(() => {
    setVerified(null);
    setMessage(null);
    if (!uid) return;
    let alive = true;
    isEmailVerifiedInToken().then((v) => { if (alive) setVerified(v); }).catch(() => { if (alive) setVerified(false); });
    return () => { alive = false; };
  }, [uid]);

  const send = useCallback(async () => {
    if (sending) return;
    const wait = lastSent.current + RESEND_COOLDOWN_MS - Date.now();
    if (wait > 0) { setMessage(`A request was just sent. You can ask again in ${Math.ceil(wait / 1000)} seconds.`); return; }
    setSending(true);
    try {
      await sendVerificationEmail();
      lastSent.current = Date.now();
      setMessage(`Verification requested for ${email}. Check your inbox and spam folder; it can take a few minutes. Then tap "I have verified".`);
    } catch (e) {
      const code = (e as { code?: string }).code;
      setMessage(code === 'auth/too-many-requests' ? 'Too many requests. Wait a little and try again.' : 'Could not send the request. Check your connection and try again.');
    } finally {
      setSending(false);
    }
  }, [sending, email]);

  const refresh = useCallback(async () => {
    if (checking) return;
    setChecking(true);
    try {
      const v = await refreshEmailVerification();
      setVerified(v);
      setMessage(v ? null : 'Not verified yet. Open the link in the e-mail, then tap "I have verified" again.');
    } catch {
      setMessage('Could not check right now. Check your connection and try again.');
    } finally {
      setChecking(false);
    }
  }, [checking]);

  return { verified, email, sending, checking, message, send, refresh };
}
