import { useMemo } from 'react';
import { useAuthStore } from '../store/authStore';
import type { AccountTier } from '../services/firestoreSync';

/**
 * Known feature flags for the application.
 * Add new features here as they are gated.
 */
export type FeatureFlag = 'aiPhotoImport';

/**
 * Hook for checking feature access based on user's account tier and feature flags.
 *
 * Access hierarchy:
 * 1. Admin tier -> All features
 * 2. Premium tier -> Premium features (including AI features)
 * 3. Specific feature flag -> Granted feature only
 * 4. Free tier -> Basic features only
 */
export function useFeatureAccess() {
  const user = useAuthStore((state) => state.user);
  const userProfile = useAuthStore((state) => state.userProfile);

  const accountTier: AccountTier = userProfile?.accountTier ?? 'free';
  const features: string[] = userProfile?.features ?? [];

  /**
   * Check if the user has access to a specific feature.
   */
  const hasFeature = useMemo(() => {
    return (feature: FeatureFlag): boolean => {
      // Must be signed in
      if (!user) return false;

      // Admins have access to everything
      if (accountTier === 'admin') return true;

      // Premium users have access to premium features
      if (accountTier === 'premium') {
        // AI features are included in premium
        if (feature === 'aiPhotoImport') return true;
      }

      // Check for specific feature grant
      return features.includes(feature);
    };
  }, [user, accountTier, features]);

  /**
   * Check if user is an admin.
   */
  const isAdmin = useMemo(() => {
    return user && accountTier === 'admin';
  }, [user, accountTier]);

  /**
   * Check if user has premium tier or higher.
   */
  const isPremiumOrHigher = useMemo(() => {
    return user && (accountTier === 'premium' || accountTier === 'admin');
  }, [user, accountTier]);

  return {
    accountTier,
    features,
    hasFeature,
    isAdmin,
    isPremiumOrHigher,
    /** Quick check for AI photo import feature */
    canUseAiPhotoImport: hasFeature('aiPhotoImport'),
  };
}
