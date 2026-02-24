import { create } from 'zustand';

type AuthModalMode = 'signin' | 'signup' | null;

interface AuthModalStore {
  requestedMode: AuthModalMode;
  requestSignUp: () => void;
  requestSignIn: () => void;
  clearRequest: () => void;
}

export const useAuthModalStore = create<AuthModalStore>((set) => ({
  requestedMode: null,
  requestSignUp: () => set({ requestedMode: 'signup' }),
  requestSignIn: () => set({ requestedMode: 'signin' }),
  clearRequest: () => set({ requestedMode: null }),
}));
