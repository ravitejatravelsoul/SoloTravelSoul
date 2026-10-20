import { useEffect, useState } from 'react';
import { subscribeToMyGroupInvites } from '@solotravelsoul/firebase';
import type { GroupInvite } from '@solotravelsoul/shared';
import { useAuthStore } from '@/stores/authStore';
import { useBlockStore } from '@/stores/blockStore';

/** Pending group invitations addressed to the signed-in person's e-mail address. */
/** `verified` is the e-mail verification state: the rules let only a verified address read invitations, so nothing is subscribed before that. */
export function useMyGroupInvites(verified: boolean | null): GroupInvite[] {
  const uid = useAuthStore((s) => s.user?.uid);
  const email = useAuthStore((s) => s.user?.email);
  const [invites, setInvites] = useState<GroupInvite[]>([]);
  const blockedUids = useBlockStore((s) => s.blockedUids);

  useEffect(() => {
    setInvites([]);
    if (!uid || !email || verified !== true) return;
    return subscribeToMyGroupInvites(email, (next) => {
      if (useAuthStore.getState().user?.uid !== uid) return;
      setInvites(next);
    });
  }, [uid, email, verified]);

  // Invitations from someone the person blocked are not shown (the rules also refuse to let them join that group).
  return invites.filter((i) => !blockedUids.includes(i.inviterUid));
}
