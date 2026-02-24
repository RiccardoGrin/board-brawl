import { create } from 'zustand';

type SyncStatus = 'idle' | 'syncing' | 'error';

interface SyncStore {
  status: SyncStatus;
  pending: number;
  lastError: string | null;
  lastSuccessAt: number | null;
  start: () => void;
  success: () => void;
  fail: (message: string) => void;
  clearError: () => void;
}

export const useSyncStore = create<SyncStore>((set) => ({
  status: 'idle',
  pending: 0,
  lastError: null,
  lastSuccessAt: null,

  start: () => set((state) => ({
    status: 'syncing',
    pending: state.pending + 1,
  })),

  success: () => set((state) => ({
    pending: Math.max(0, state.pending - 1),
    status: state.pending - 1 > 0 ? 'syncing' : 'idle',
    lastError: null,
    lastSuccessAt: Date.now(),
  })),

  fail: (message) => set((state) => ({
    pending: Math.max(0, state.pending - 1),
    status: 'error',
    lastError: message,
  })),

  clearError: () => set((state) => ({
    lastError: null,
    status: state.pending > 0 ? 'syncing' : 'idle',
  })),
}));


