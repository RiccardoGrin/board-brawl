import { create } from 'zustand';
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
  sendPasswordResetEmail,
  sendEmailVerification,
  verifyPasswordResetCode,
  confirmPasswordReset,
} from 'firebase/auth';
import type { User } from 'firebase/auth';
import { auth } from '../lib/firebase';

type AuthStatus = 'idle' | 'loading';

// Rate limit tracking for too-many-requests errors
interface RateLimitState {
  lockedUntil: number | null;
  remainingSeconds: number;
}

/**
 * Account tiers for feature access control.
 */
export type AccountTier = 'free' | 'premium' | 'admin';

/**
 * User profile state for player sharing and feature access.
 *
 * The userCode is a unique 6-digit identifier that allows users to be added
 * to tournaments without sharing their email address. It's generated on
 * first sign-in and stored in Firestore.
 */
export interface UserProfileState {
  /** Unique 6-digit code for player linking (e.g., "847291") */
  userCode: string | null;
  /** User's display name for showing in linked player UI */
  displayName: string | null;
  /** Account tier for feature access (defaults to 'free') */
  accountTier?: AccountTier;
  /** Specific feature flags for granular access control */
  features?: string[];
}

const friendlyAuthError = (code?: string) => {
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/invalid-login-credentials':
      return 'Email or password is incorrect.';
    case 'auth/user-not-found':
      return 'No account found for this email.';
    case 'auth/email-already-in-use':
      return 'An account already exists with this email.';
    case 'auth/weak-password':
      return 'Password must be at least 6 characters.';
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/popup-closed-by-user':
      return 'The sign-in window was closed. Please try again.';
    case 'auth/popup-blocked':
      return 'The sign-in window was blocked by the browser. Please allow popups and try again.';
    case 'auth/account-exists-with-different-credential':
      return 'This email is already linked to another sign-in method. Sign in with email/password, then link Google.';
    case 'auth/network-request-failed':
      return 'Network error. Please check your connection and try again.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please wait a moment and try again.';
    default:
      return 'Something went wrong. Please try again.';
  }
};

interface AuthStore {
  user: User | null;
  userProfile: UserProfileState;
  status: AuthStatus;
  initialized: boolean;
  error: string | null;
  successMessage: string | null;
  rateLimit: RateLimitState;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  sendPasswordReset: (email: string) => Promise<boolean>;
  verifyResetCode: (code: string) => Promise<string | null>;
  confirmReset: (code: string, newPassword: string) => Promise<boolean>;
  sendVerificationEmail: () => Promise<boolean>;
  clearError: () => void;
  clearSuccessMessage: () => void;
  setUserProfile: (profile: UserProfileState) => void;
  _setUserFromListener: (user: User | null) => void;
  _updateRateLimitTimer: () => void;
}

let listenerRegistered = false;
let rateLimitInterval: ReturnType<typeof setInterval> | null = null;
const provider = new GoogleAuthProvider();

// Rate limit duration in seconds (Firebase typically locks for ~60 seconds)
const RATE_LIMIT_DURATION = 60;

export const useAuthStore = create<AuthStore>((set, get) => {
  if (!listenerRegistered) {
    onAuthStateChanged(auth, (user) => {
      set({
        user,
        initialized: true,
        status: 'idle',
        error: null,
      });
    });
    listenerRegistered = true;
  }

  const startRateLimitTimer = () => {
    const lockedUntil = Date.now() + RATE_LIMIT_DURATION * 1000;
    set({ 
      rateLimit: { lockedUntil, remainingSeconds: RATE_LIMIT_DURATION } 
    });

    // Clear any existing interval
    if (rateLimitInterval) {
      clearInterval(rateLimitInterval);
    }

    // Update countdown every second
    rateLimitInterval = setInterval(() => {
      const state = get();
      if (!state.rateLimit.lockedUntil) {
        if (rateLimitInterval) clearInterval(rateLimitInterval);
        return;
      }

      const remaining = Math.max(0, Math.ceil((state.rateLimit.lockedUntil - Date.now()) / 1000));
      
      if (remaining <= 0) {
        set({ rateLimit: { lockedUntil: null, remainingSeconds: 0 } });
        if (rateLimitInterval) clearInterval(rateLimitInterval);
      } else {
        set({ rateLimit: { ...state.rateLimit, remainingSeconds: remaining } });
      }
    }, 1000);
  };

  const handleAuthError = (error: any) => {
    const code = error?.code;
    if (code === 'auth/too-many-requests') {
      startRateLimitTimer();
    }
    set({ error: friendlyAuthError(code) });
  };

  return {
    user: null,
    userProfile: { userCode: null, displayName: null },
    status: 'idle',
    initialized: false,
    error: null,
    successMessage: null,
    rateLimit: { lockedUntil: null, remainingSeconds: 0 },

    _setUserFromListener: (user) => {
      set({ user, initialized: true, status: 'idle', error: null });
      // Clear userProfile when user logs out
      if (!user) {
        set({ userProfile: { userCode: null, displayName: null } });
      }
    },
    
    setUserProfile: (profile) => {
      set({ userProfile: profile });
    },

    _updateRateLimitTimer: () => {
      const state = get();
      if (state.rateLimit.lockedUntil) {
        const remaining = Math.max(0, Math.ceil((state.rateLimit.lockedUntil - Date.now()) / 1000));
        if (remaining <= 0) {
          set({ rateLimit: { lockedUntil: null, remainingSeconds: 0 } });
        }
      }
    },

    clearError: () => set({ error: null }),
    clearSuccessMessage: () => set({ successMessage: null }),

    signInWithEmail: async (email, password) => {
      set({ status: 'loading', error: null, successMessage: null });
      try {
        await signInWithEmailAndPassword(auth, email, password);
      } catch (error: any) {
        handleAuthError(error);
      } finally {
        set({ status: 'idle' });
      }
    },

    signUpWithEmail: async (email, password) => {
      set({ status: 'loading', error: null, successMessage: null });
      try {
        const result = await createUserWithEmailAndPassword(auth, email, password);
        // Send verification email after successful signup
        if (result.user) {
          try {
            await sendEmailVerification(result.user);
            set({ successMessage: 'Account created! Check your email to verify your account.' });
          } catch {
            // Don't fail signup if verification email fails
            console.warn('Failed to send verification email');
          }
        }
      } catch (error: any) {
        handleAuthError(error);
      } finally {
        set({ status: 'idle' });
      }
    },

    signInWithGoogle: async () => {
      set({ status: 'loading', error: null, successMessage: null });
      try {
        await signInWithPopup(auth, provider);
      } catch (error: any) {
        handleAuthError(error);
      } finally {
        set({ status: 'idle' });
      }
    },

    signOut: async () => {
      set({ status: 'loading', error: null, successMessage: null });
      try {
        await firebaseSignOut(auth);
      } catch (error: any) {
        set({ error: error?.message || 'Failed to sign out' });
      } finally {
        set({ status: 'idle' });
      }
    },

    sendPasswordReset: async (email) => {
      set({ status: 'loading', error: null, successMessage: null });
      try {
        // Send password reset email (action URL is configured in Firebase Console)
        await sendPasswordResetEmail(auth, email);
        set({ 
          successMessage: 'Password reset email sent! Check your inbox.',
          status: 'idle'
        });
        return true;
      } catch (error: any) {
        handleAuthError(error);
        set({ status: 'idle' });
        return false;
      }
    },

    verifyResetCode: async (code) => {
      set({ status: 'loading', error: null, successMessage: null });
      try {
        const email = await verifyPasswordResetCode(auth, code);
        set({ status: 'idle' });
        return email;
      } catch (error: any) {
        const errorCode = error?.code;
        if (errorCode === 'auth/expired-action-code') {
          set({ error: 'This reset link has expired. Please request a new one.' });
        } else if (errorCode === 'auth/invalid-action-code') {
          set({ error: 'This reset link is invalid or has already been used.' });
        } else {
          handleAuthError(error);
        }
        set({ status: 'idle' });
        return null;
      }
    },

    confirmReset: async (code, newPassword) => {
      set({ status: 'loading', error: null, successMessage: null });
      try {
        await confirmPasswordReset(auth, code, newPassword);
        set({ 
          successMessage: 'Password reset successful! You can now sign in with your new password.',
          status: 'idle'
        });
        return true;
      } catch (error: any) {
        const errorCode = error?.code;
        if (errorCode === 'auth/expired-action-code') {
          set({ error: 'This reset link has expired. Please request a new one.' });
        } else if (errorCode === 'auth/invalid-action-code') {
          set({ error: 'This reset link is invalid or has already been used.' });
        } else if (errorCode === 'auth/weak-password') {
          set({ error: 'Password is too weak. Please choose a stronger password.' });
        } else {
          handleAuthError(error);
        }
        set({ status: 'idle' });
        return false;
      }
    },

    sendVerificationEmail: async () => {
      const user = get().user;
      if (!user) {
        set({ error: 'You must be signed in to verify your email.' });
        return false;
      }
      
      set({ status: 'loading', error: null, successMessage: null });
      try {
        await sendEmailVerification(user);
        set({ 
          successMessage: 'Verification email sent! Check your inbox.',
          status: 'idle'
        });
        return true;
      } catch (error: any) {
        handleAuthError(error);
        set({ status: 'idle' });
        return false;
      }
    },
  };
});



