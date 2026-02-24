import { AlertTriangle, X } from 'lucide-react';
import { Button } from './ui/button';
import { useSyncStore } from '../store/syncStore';
import { retryFullSync } from '../services/syncActions';
import { useSyncExternalStore } from 'react';

/** Maps verbose error messages to short, user-friendly versions */
function simplifyError(error: string): string {
  const lower = error.toLowerCase();
  if (lower.includes('sign in') || lower.includes('sign-in')) {
    return 'Sign in to sync';
  }
  if (lower.includes('network') || lower.includes('offline') || lower.includes('fetch')) {
    return 'No connection';
  }
  if (lower.includes('permission') || lower.includes('denied') || lower.includes('unauthorized')) {
    return 'Access denied';
  }
  if (lower.includes('timeout')) {
    return 'Request timed out';
  }
  // Default short message
  return 'Sync failed';
}

export function SyncStatusBar() {
  // Skip rendering in test environment (Vite sets import.meta.env.MODE)
  const isTestEnv = import.meta.env?.MODE === 'test';
  if (isTestEnv) return null;

  // Manual subscription with useSyncExternalStore to avoid caching warnings.
  const snapshot = useSyncExternalStore(
    useSyncStore.subscribe,
    () => useSyncStore.getState(),
    () => useSyncStore.getState()
  );

  const { lastError, clearError } = snapshot;

  // Only show when there's an error
  if (!lastError) return null;

  const shortError = simplifyError(lastError);

  return (
    <div 
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-auto max-w-[90vw]"
      role="alert" 
      aria-live="assertive"
    >
      <div
        className="flex items-center gap-3 rounded-lg border border-red-300 bg-red-50 px-4 py-2.5 text-sm shadow-lg"
      >
        <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" aria-hidden="true" />
        <span className="text-red-800 font-medium">{shortError}</span>
        <div className="flex items-center gap-1 ml-2">
          <Button 
            size="sm" 
            variant="ghost" 
            onClick={() => retryFullSync()}
            className="text-red-700 hover:text-red-900 hover:bg-red-100 px-2 py-1 h-auto text-xs font-medium"
          >
            Retry
          </Button>
          <button
            onClick={() => clearError()}
            className="p-1 rounded hover:bg-red-100 text-red-500 hover:text-red-700 transition-colors"
            aria-label="Dismiss error"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
