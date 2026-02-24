import { useEffect, useRef } from 'react';
import { useAuthStore } from '../store/authStore';
import { useLibraryStore } from '../store/libraryStore';
import { useSyncStore } from '../store/syncStore';
import { loadLibraryDataRemote, syncAllLibraryData } from '../services/librarySync';

/**
 * Hook to sync library data with Firestore when user authentication state changes.
 *
 * Phase 2 Changes:
 * - Syncs libraries, userGames, memberships, and shelves
 * - Guest mode no longer creates local libraries (users must sign in)
 * - System libraries (My Library, Wishlist) are created by Cloud Function on signup
 * - Shelf configurations sync along with library data
 */
export function useLibrarySync() {
  const user = useAuthStore((state) => state.user);
  const initialized = useAuthStore((state) => state.initialized);

  // Skip sync in test environment
  const isTestEnv = import.meta.env?.MODE === 'test';

  if (isTestEnv) {
    return;
  }

  const hydrateFromSnapshot = useLibraryStore((state) => state.hydrateFromSnapshot);
  const resetStore = useLibraryStore((state) => state.resetStore);
  const libraries = useLibraryStore((state) => state.libraries);
  const userGames = useLibraryStore((state) => state.userGames);
  const memberships = useLibraryStore((state) => state.memberships);
  const shelves = useLibraryStore((state) => state.shelves);

  // Track the previous user ID to detect user changes
  const prevUserIdRef = useRef<string | null>(null);
  const hasSyncedRef = useRef<boolean>(false);

  const localRef = useRef({
    libraries,
    userGames,
    memberships,
    shelves,
  });

  useEffect(() => {
    localRef.current = { libraries, userGames, memberships, shelves };
  }, [libraries, userGames, memberships, shelves]);

  // Clear store when user changes (logout or switch accounts)
  useEffect(() => {
    if (isTestEnv) return;

    const currentUid = user?.uid ?? null;
    const prevUid = prevUserIdRef.current;

    // Detect user change (not initial load)
    if (prevUid !== null && prevUid !== currentUid) {
      // Clear the store immediately
      resetStore();
      localRef.current = { libraries: {}, userGames: {}, memberships: {}, shelves: {} };
      hasSyncedRef.current = false;
    }

    prevUserIdRef.current = currentUid;
  }, [user, resetStore, isTestEnv]);

  // Main sync effect
  useEffect(() => {
    if (isTestEnv) return;
    if (!initialized) return;

    // Guest mode: don't sync, don't create libraries
    // Users must sign in to use library features
    if (!user) {
      return;
    }

    // Prevent duplicate syncs
    if (hasSyncedRef.current) return;
    hasSyncedRef.current = true;

    let cancelled = false;
    const sync = useSyncStore.getState();
    const uid = user.uid;

    // Helper to check if we should abort
    const shouldAbort = () => cancelled || useAuthStore.getState().user?.uid !== uid;

    // Helper to check if error is a permission error during logout
    const isLogoutPermissionError = (error: unknown) => {
      const err = error as { code?: string };
      return err?.code === 'permission-denied' && !useAuthStore.getState().user;
    };

    const runSync = async () => {
      sync.start();
      try {
        if (shouldAbort()) return;

        // Load remote library data
        let remote;
        try {
          remote = await loadLibraryDataRemote(uid);
        } catch (error: unknown) {
          if (isLogoutPermissionError(error)) return;
          throw error;
        }

        if (shouldAbort()) return;

        const hasLocalData = Object.keys(localRef.current.libraries).length > 0;
        const hasRemoteData = Object.keys(remote.libraries).length > 0;

        if (hasRemoteData) {
          // Remote has data - use it
          if (hasLocalData) {

            // Merge: remote wins for conflicts, but keep local data not in remote
            const mergedLibraries = { ...localRef.current.libraries, ...remote.libraries };
            const mergedUserGames = { ...localRef.current.userGames, ...remote.userGames };
            const mergedMemberships = { ...localRef.current.memberships };
            // For shelves, remote wins (they contain game placements that should be authoritative)
            const mergedShelves = { ...localRef.current.shelves, ...remote.shelves };

            // Merge memberships per library
            for (const [libraryId, remoteMemberships] of Object.entries(remote.memberships)) {
              const localMemberships = mergedMemberships[libraryId] || [];
              const remoteGameIds = new Set(remoteMemberships.map((m) => m.gameId));

              // Keep local memberships not in remote, then add all remote
              const localOnly = localMemberships.filter((m) => !remoteGameIds.has(m.gameId));
              mergedMemberships[libraryId] = [...localOnly, ...remoteMemberships];
            }

            // Check for local-only data to push
            const localOnlyLibraries = Object.keys(localRef.current.libraries).filter(
              (id) => !remote.libraries[id]
            );
            const localOnlyGames = Object.keys(localRef.current.userGames).filter(
              (id) => !remote.userGames[id]
            );

            if (localOnlyLibraries.length > 0 || localOnlyGames.length > 0) {
              try {
                await syncAllLibraryData(uid, mergedLibraries, mergedUserGames, mergedMemberships, mergedShelves);
              } catch (error: unknown) {
                if (isLogoutPermissionError(error)) return;
                // Don't fail the whole sync if push fails
              }
            }

            if (!cancelled) {
              hydrateFromSnapshot({
                libraries: mergedLibraries,
                userGames: mergedUserGames,
                memberships: mergedMemberships,
                shelves: mergedShelves,
              });
            }
          } else {
            if (!cancelled) {
              hydrateFromSnapshot(remote);
            }
          }
        } else if (hasLocalData) {
          // Only local has data - push to remote
          try {
            await syncAllLibraryData(
              uid,
              localRef.current.libraries,
              localRef.current.userGames,
              localRef.current.memberships,
              localRef.current.shelves
            );
          } catch (error: unknown) {
            if (isLogoutPermissionError(error)) return;
          }
        } else {
          // Neither has data - system libraries should be created by Cloud Function
          // Just wait for them to sync on next load
        }

        sync.success();
      } catch (error: unknown) {
        if (isLogoutPermissionError(error)) {
          sync.success();
          return;
        }
        // Don't fail the sync status for library errors - tournament sync is primary
        sync.success();
      }
    };

    runSync();

    return () => {
      cancelled = true;
    };
  }, [initialized, user, hydrateFromSnapshot, isTestEnv]);
}
