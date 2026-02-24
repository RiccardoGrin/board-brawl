import { syncLocalToRemote } from './firestoreSync';
import { useAuthStore } from '../store/authStore';
import { useTournamentStore } from '../store/tournamentStore';
import { useSyncStore } from '../store/syncStore';

/**
 * Force a push of all local tournaments/sessions to Firestore for the current user.
 * Surfaces errors via syncStore so the UI can show feedback.
 */
export async function retryFullSync() {
  const user = useAuthStore.getState().user;
  const sync = useSyncStore.getState();
  if (!user) {
    sync.fail('Sign in to sync your data.');
    return;
  }

  const { tournaments, gameSessions } = useTournamentStore.getState();
  const snapshot = { tournaments, gameSessions };

  sync.start();
  try {
    await syncLocalToRemote(user.uid, snapshot);
    sync.success();
  } catch (error: any) {
    sync.fail(error?.message || 'Sync failed. Please retry.');
  }
}


