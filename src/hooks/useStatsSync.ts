/**
 * Stats Sync Hook
 *
 * Subscribes to real-time stats updates when user is signed in.
 * Clears stats when user signs out.
 */

import { useEffect, useRef } from 'react';
import { useAuthStore } from '../store/authStore';
import { useStatsStore } from '../store/statsStore';

export function useStatsSync() {
  const user = useAuthStore((state) => state.user);
  const initialized = useAuthStore((state) => state.initialized);

  // Skip sync in test environment
  const isTestEnv = import.meta.env?.MODE === 'test';

  const subscribeToStats = useStatsStore((state) => state.subscribeToStats);
  const clearStats = useStatsStore((state) => state.clearStats);

  // Track the previous user ID to detect user changes
  const prevUserIdRef = useRef<string | null>(null);

  // Clear stats immediately when user changes (logout or switch accounts)
  useEffect(() => {
    if (isTestEnv) return;

    const currentUid = user?.uid ?? null;
    const prevUid = prevUserIdRef.current;

    // Detect user change (not initial load)
    if (prevUid !== null && prevUid !== currentUid) {
      console.debug('[statsSync] User changed, clearing stats', { prevUid, currentUid });
      clearStats();
    }

    prevUserIdRef.current = currentUid;
  }, [user, clearStats, isTestEnv]);

  // Subscribe to stats when user signs in
  useEffect(() => {
    if (isTestEnv) return;
    if (!initialized) return;

    if (user) {
      console.debug('[statsSync] Subscribing to stats', { uid: user.uid });
      subscribeToStats(user.uid);
    } else {
      console.debug('[statsSync] No user, clearing stats');
      clearStats();
    }

    // Cleanup is handled by clearStats on unmount or user change
  }, [initialized, user, subscribeToStats, clearStats, isTestEnv]);
}
