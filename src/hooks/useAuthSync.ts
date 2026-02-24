import { useEffect, useRef } from 'react';
import { useAuthStore } from '../store/authStore';
import { useTournamentStore } from '../store/tournamentStore';
import { useSyncStore } from '../store/syncStore';
import { loadRemoteState, syncLocalToRemote, upsertUserProfile } from '../services/firestoreSync';
import { mergeSnapshots, toEpoch } from '../services/syncMerge';
import { onSnapshot, query, where, collection } from 'firebase/firestore';
import { db } from '../lib/firebase';

export function useAuthSync() {
  const user = useAuthStore(state => state.user);
  const initialized = useAuthStore(state => state.initialized);
  // Skip sync in test environment (Vite sets import.meta.env.MODE)
  const isTestEnv = import.meta.env?.MODE === 'test';

  if (isTestEnv) {
    return;
  }

  const hydrate = useTournamentStore(state => state.hydrateFromSnapshot);
  const resetStore = useTournamentStore(state => state.resetStore);
  const tournaments = useTournamentStore(state => state.tournaments);
  const gameSessions = useTournamentStore(state => state.gameSessions);
  const activeTournamentId = useTournamentStore(state => state.activeTournamentId);

  // Track the previous user ID to detect user changes
  const prevUserIdRef = useRef<string | null>(null);

  const localRef = useRef({
    tournaments,
    gameSessions,
    activeTournamentId,
  });

  useEffect(() => {
    localRef.current = { tournaments, gameSessions, activeTournamentId };
  }, [tournaments, gameSessions, activeTournamentId]);

  // Clear store immediately when user changes (logout or switch accounts)
  useEffect(() => {
    if (isTestEnv) return;
    
    const currentUid = user?.uid ?? null;
    const prevUid = prevUserIdRef.current;
    
    // Detect user change (not initial load)
    if (prevUid !== null && prevUid !== currentUid) {
      // Clear the store immediately so UI doesn't show stale data
      resetStore();
      // Also clear the localRef so we don't try to sync old data
      localRef.current = { tournaments: {}, gameSessions: {}, activeTournamentId: null };
    }
    
    prevUserIdRef.current = currentUid;
  }, [user, resetStore, isTestEnv]);

  useEffect(() => {
    if (isTestEnv) return;
    if (!initialized || !user) return;

    let cancelled = false;
    const sync = useSyncStore.getState();
    const uid = user.uid; // Capture uid at effect start

    // Helper to check if we should abort (cancelled or user logged out)
    const shouldAbort = () => cancelled || useAuthStore.getState().user?.uid !== uid;
    
    // Helper to check if error is a permission error during logout (should be silently ignored)
    const isLogoutPermissionError = (error: any) => 
      error?.code === 'permission-denied' && !useAuthStore.getState().user;

    const runSync = async () => {
      sync.start();
      try {
        if (shouldAbort()) return;

        try {
          const userProfile = await upsertUserProfile(uid, {
            displayName: user.displayName,
            photoURL: user.photoURL,
            email: user.email,
          });

          // Store userCode, displayName, and feature access fields in auth store
          // Use the displayName from Firestore (which preserves custom names)
          useAuthStore.getState().setUserProfile({
            userCode: userProfile.userCode,
            displayName: userProfile.displayName ?? null,
            accountTier: userProfile.accountTier,
            features: userProfile.features,
          });
        } catch (error: any) {
          if (isLogoutPermissionError(error)) return; // Silently abort during logout
          throw error;
        }

        if (shouldAbort()) return;

        let remote;
        try {
          remote = await loadRemoteState(uid);
        } catch (error: any) {
          if (isLogoutPermissionError(error)) return; // Silently abort during logout
          throw error;
        }

        if (shouldAbort()) return;

        // Push any local tournaments that are missing remotely, lack timestamps remotely, or differ in sessions,
        // or are newer based on updatedAt.
        // IMPORTANT: Only OWNERS can push tournaments to remote. Viewers should never push.
        const localTournaments = Object.values(localRef.current.tournaments);
        const tournamentsToPush = localTournaments.filter((local) => {
          // Only owners can push tournaments - viewers/members cannot recreate deleted tournaments
          const isOwner = !local.ownerId || local.ownerId === uid;
          if (!isOwner) {
            return false;
          }

          const remoteMatch = remote.tournaments[local.id];
          if (!remoteMatch) return true;
          const remoteUpdated = toEpoch(remoteMatch.updatedAt);
          const localUpdated = toEpoch(local.updatedAt);
          if (!remoteUpdated) return true;
          if (local.gameSessions.length !== remoteMatch.gameSessions?.length) return true;
          return localUpdated > remoteUpdated;
        });

        if (tournamentsToPush.length) {
          if (shouldAbort()) return;
          
          const toSync = {
            tournaments: Object.fromEntries(tournamentsToPush.map(t => [t.id, t])),
            gameSessions: Object.fromEntries(
              tournamentsToPush.flatMap(t => t.gameSessions.map(sessionId => {
                const session = localRef.current.gameSessions[sessionId];
                return session ? [[sessionId, session]] : [];
              }))
            ),
          };
          try {
            await syncLocalToRemote(uid, toSync);
          } catch (error: any) {
            if (isLogoutPermissionError(error)) return; // Silently abort during logout
            throw error;
          }
        }

        if (shouldAbort()) return;

        let latest;
        try {
          latest = await loadRemoteState(uid);
        } catch (error: any) {
          if (isLogoutPermissionError(error)) return; // Silently abort during logout
          throw error;
        }

        if (shouldAbort()) return;

        // Pass uid to filter out local tournaments that don't belong to this user
        const merged = mergeSnapshots(localRef.current, latest, uid);

        const nextActive = merged.tournaments[localRef.current.activeTournamentId!]
          ? localRef.current.activeTournamentId
          : Object.keys(merged.tournaments)[0] ?? null;

        if (!cancelled) {
          hydrate({
            tournaments: merged.tournaments,
            gameSessions: merged.gameSessions,
            activeTournamentId: nextActive,
          });
        }
        sync.success();
      } catch (error: any) {
        // Silently ignore permission errors during logout
        if (isLogoutPermissionError(error)) {
          sync.success(); // Clear any pending sync state
          return;
        }
        console.error('Sync error', { message: error?.message, code: error?.code, stack: error?.stack });
        if (!cancelled) {
          sync.fail(`Failed to sync data. ${error?.message || 'Please retry.'}`);
        }
      }
    };

    runSync();

    return () => {
      cancelled = true;
    };
  }, [initialized, user, hydrate, isTestEnv]);

  // Live listener: keep in sync with server updates while signed in.
  useEffect(() => {
    if (isTestEnv) return;
    if (!user) return;
    
    const sync = useSyncStore.getState();
    const uid = user.uid; // Capture uid at effect start
    const q = query(collection(db, 'tournaments'), where('memberIds', 'array-contains', uid));

    const unsubscribe = onSnapshot(q, async () => {
      // Check if user is still logged in before processing
      const currentUser = useAuthStore.getState().user;
      if (!currentUser || currentUser.uid !== uid) {
        return;
      }

      sync.start();
      try {
        const remote = await loadRemoteState(uid);

        // Re-check user before hydrating
        const stillLoggedIn = useAuthStore.getState().user?.uid === uid;
        if (!stillLoggedIn) {
          return;
        }
        
        // Pass uid to filter out local tournaments that don't belong to this user
        const merged = mergeSnapshots(localRef.current, remote, uid);
        const nextActive = merged.tournaments[localRef.current.activeTournamentId!]
          ? localRef.current.activeTournamentId
          : Object.keys(merged.tournaments)[0] ?? null;
        hydrate({
          tournaments: merged.tournaments,
          gameSessions: merged.gameSessions,
          activeTournamentId: nextActive,
        });
        sync.success();
      } catch (error: any) {
        // Silently ignore permission errors during logout
        if (error?.code === 'permission-denied' && !useAuthStore.getState().user) {
          sync.success(); // Clear any pending sync state
          return;
        }
        console.error('Live sync error', { message: error?.message, code: error?.code, stack: error?.stack });
        sync.fail('Live sync failed. Retrying…');
      }
    });

    return () => unsubscribe();
  }, [user, hydrate, isTestEnv]);
}

