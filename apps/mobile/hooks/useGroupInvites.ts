import { useEffect, useState } from 'react';
import { subscribeToMyGroupInvites } from '@solotravelsoul/firebase';
import type { GroupInvite } from '@solotravelsoul/shared';
import { useAuthStore } from '@/stores/authStore';
import { useBlockStore } from '@/stores/blockStore';

/** Pending group invitations addressed to the signed-in person's e-mail address. */
export function useMyGroupInvites(): GroupInvite[] {
  const uid = useAuthStore((s) => s.user?.uid);
  const email = useAuthStore((s) => s.user?.email);
  const [invites, setInvites] = useState<GroupInvite[]>([]);
  const blockedUids = useBlockStore((s) => s.blockedUids);

  useEffect(() => {
    setInvites([]);
    if (!uid || !email) return;
    return subscribeToMyGroupInvites(email, (next) => {
      if (useAuthStore.getState().user?.uid !== uid) return;
      setInvites(next);
    });
  }, [uid, email]);

  // Invitations from someone the person blocked are not shown (the rules also refuse to let them join that group).
  return invites.filter((i) => !blockedUids.includes(i.inviterUid));
}
