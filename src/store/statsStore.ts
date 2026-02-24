/**
 * Stats Store
 *
 * Zustand store for managing user statistics state.
 * Stats are read-only from the client (written by Cloud Functions).
 */

import { create } from 'zustand';
import type { UserStats } from '../types/stats';
import { DEFAULT_USER_STATS } from '../types/stats';
import { loadUserStats, subscribeToUserStats } from '../services/statsService';

interface StatsStore {
  /** Current user stats (null if not loaded) */
  stats: UserStats | null;

  /** Loading state */
  loading: boolean;

  /** Error message if load failed */
  error: string | null;

  /** Active subscription unsubscribe function */
  _unsubscribe: (() => void) | null;

  /** Load stats for a user (one-time fetch) */
  loadStats: (uid: string) => Promise<void>;

  /** Subscribe to real-time stats updates */
  subscribeToStats: (uid: string) => void;

  /** Unsubscribe from stats updates */
  unsubscribe: () => void;

  /** Clear stats (on sign-out) */
  clearStats: () => void;
}

export const useStatsStore = create<StatsStore>((set, get) => ({
  stats: null,
  loading: false,
  error: null,
  _unsubscribe: null,

  loadStats: async (uid: string) => {
    set({ loading: true, error: null });
    try {
      const stats = await loadUserStats(uid);
      set({ stats, loading: false });
    } catch (error) {
      console.error('[statsStore] Failed to load stats:', error);
      set({
        stats: { ...DEFAULT_USER_STATS, lastUpdated: new Date().toISOString() },
        loading: false,
        error: 'Failed to load stats',
      });
    }
  },

  subscribeToStats: (uid: string) => {
    // Unsubscribe from any existing subscription
    const { _unsubscribe } = get();
    if (_unsubscribe) {
      _unsubscribe();
    }

    set({ loading: true, error: null });

    const unsubscribe = subscribeToUserStats(uid, (stats) => {
      set({ stats, loading: false, error: null });
    });

    set({ _unsubscribe: unsubscribe });
  },

  unsubscribe: () => {
    const { _unsubscribe } = get();
    if (_unsubscribe) {
      _unsubscribe();
      set({ _unsubscribe: null });
    }
  },

  clearStats: () => {
    const { _unsubscribe } = get();
    if (_unsubscribe) {
      _unsubscribe();
    }
    set({
      stats: null,
      loading: false,
      error: null,
      _unsubscribe: null,
    });
  },
}));
