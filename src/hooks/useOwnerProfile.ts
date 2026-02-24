import { useEffect, useState } from 'react';
import { getUserProfile } from '../services/firestoreSync';

// Simple in-memory cache for owner profiles (5 minute TTL)
const profileCache = new Map<string, { name: string; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Hook to fetch and display the current owner's display name.
 * This ensures "Hosted by" always shows the owner's current name,
 * even if they change it after creating the tournament.
 * 
 * Features caching to prevent redundant Firestore reads.
 * 
 * @param ownerId - The tournament owner's user ID
 * @param fallbackName - Fallback name if owner profile can't be fetched
 * @returns The owner's current display name
 */
export function useOwnerProfile(ownerId: string | undefined, fallbackName?: string): string {
  const [ownerDisplayName, setOwnerDisplayName] = useState<string>(() => {
    // Check cache first
    if (ownerId) {
      const cached = profileCache.get(ownerId);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        return cached.name;
      }
    }
    return fallbackName || 'Unknown';
  });

  useEffect(() => {
    if (!ownerId) {
      setOwnerDisplayName(fallbackName || 'Unknown');
      return;
    }

    let cancelled = false;

    const fetchOwner = async () => {
      try {
        // Check cache first
        const cached = profileCache.get(ownerId);
        if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
          if (!cancelled) {
            setOwnerDisplayName(cached.name);
          }
          return;
        }

        // Fetch from Firestore
        const profile = await getUserProfile(ownerId);
        if (!cancelled && profile) {
          // Use custom displayName, or Player #code, or fallback
          const displayName = profile.displayName || 
            (profile.userCode ? `Player #${profile.userCode}` : null);
          const finalName = displayName || fallbackName || 'Unknown';
          
          // Update cache
          profileCache.set(ownerId, {
            name: finalName,
            timestamp: Date.now()
          });
          
          setOwnerDisplayName(finalName);
        }
      } catch (error) {
        console.warn('Failed to fetch owner profile', { ownerId, error });
        if (!cancelled) {
          setOwnerDisplayName(fallbackName || 'Unknown');
        }
      }
    };

    fetchOwner();

    return () => {
      cancelled = true;
    };
  }, [ownerId, fallbackName]);

  return ownerDisplayName;
}

/**
 * Clear the profile cache for a specific user or all users.
 * Call this when a user updates their display name.
 * 
 * @param uid - Optional user ID to clear. If omitted, clears all cached profiles.
 */
export function clearOwnerProfileCache(uid?: string): void {
  if (uid) {
    profileCache.delete(uid);
  } else {
    profileCache.clear();
  }
}

