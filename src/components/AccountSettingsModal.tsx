import { useState, useEffect } from 'react';
import { Hash, Copy, Check, User, Loader2, AlertCircle } from 'lucide-react';
import { Modal } from './ui/modal';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { useAuthStore } from '../store/authStore';
import { useTournamentStore } from '../store/tournamentStore';
import { updateUserDisplayName } from '../services/firestoreSync';
import { clearOwnerProfileCache } from '../hooks/useOwnerProfile';

interface AccountSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const DISPLAY_NAME_MAX = 25;
const COUNTER_THRESHOLD = 20;

/**
 * AccountSettingsModal - User account settings management
 * 
 * Features:
 * - Set/update custom display name (1-25 characters)
 * - View and copy user code
 * - Preview how name appears in tournaments
 */
export function AccountSettingsModal({ isOpen, onClose }: AccountSettingsModalProps) {
  const user = useAuthStore(state => state.user);
  const userProfile = useAuthStore(state => state.userProfile);
  const setUserProfile = useAuthStore(state => state.setUserProfile);
  
  const [displayName, setDisplayName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [codeCopied, setCodeCopied] = useState(false);

  // Initialize display name from user profile
  useEffect(() => {
    if (isOpen && userProfile.displayName) {
      setDisplayName(userProfile.displayName);
    } else if (isOpen) {
      setDisplayName('');
    }
  }, [isOpen, userProfile.displayName]);

  // Clear messages when modal closes
  useEffect(() => {
    if (!isOpen) {
      setError(null);
      setSuccessMessage(null);
      setCodeCopied(false);
    }
  }, [isOpen]);

  const handleSave = async () => {
    if (!user?.uid) return;
    
    const trimmed = displayName.trim();
    
    // Validate
    if (trimmed.length === 0) {
      setError('Display name cannot be empty');
      return;
    }
    
    if (trimmed.length > DISPLAY_NAME_MAX) {
      setError(`Display name cannot exceed ${DISPLAY_NAME_MAX} characters`);
      return;
    }
    
    setIsSaving(true);
    setError(null);
    setSuccessMessage(null);
    
    try {
      const updatedProfile = await updateUserDisplayName(user.uid, trimmed);
      
      // Update local state
      setUserProfile({
        userCode: updatedProfile.userCode,
        displayName: updatedProfile.displayName ?? null,
      });
      
      // Update player names in all local tournaments where this user is linked
      useTournamentStore.getState().updateLinkedPlayerNames(user.uid, trimmed);
      
      // Clear cache so "Hosted by" updates immediately
      clearOwnerProfileCache(user.uid);
      
      setSuccessMessage('Display name updated successfully!');
      
      // Close modal after a brief delay to show success message
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err) {
      console.error('Failed to update display name:', err);
      setError(err instanceof Error ? err.message : 'Failed to update display name');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCopyCode = () => {
    if (userProfile.userCode) {
      navigator.clipboard.writeText(`#${userProfile.userCode}`);
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    }
  };

  const hasChanges = displayName.trim() !== (userProfile.displayName || '');

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Account Settings">
      <div className="space-y-6">
        {/* Display Name Section */}
        <div className="space-y-3">
          <div className="flex justify-between items-end mb-2">
            <label htmlFor="display-name" className="block text-sm font-bold text-muted engraved">
              <span className="flex items-center gap-2">
                <User className="w-4 h-4 text-muted" />
                Display Name
              </span>
            </label>
            {displayName.length >= COUNTER_THRESHOLD && (
              <span className="text-[10px] text-muted tabular">
                {displayName.length}/{DISPLAY_NAME_MAX}
              </span>
            )}
          </div>
          <Input
            id="display-name"
            type="text"
            value={displayName}
            onChange={(e) => {
              setDisplayName(e.target.value.slice(0, DISPLAY_NAME_MAX));
              setError(null);
              setSuccessMessage(null);
            }}
            placeholder={userProfile.userCode ? `Player #${userProfile.userCode}` : 'Enter your name'}
            maxLength={DISPLAY_NAME_MAX}
            className="h-11 text-base"
            disabled={isSaving}
          />
          <p className="text-xs text-muted px-1">
            This is how you'll appear in shared tournaments
          </p>
        </div>

        {/* User Code Section */}
        <div className="space-y-3">
          <label className="block text-sm font-bold text-muted engraved">
            <span className="flex items-center gap-2">
              <Hash className="w-4 h-4 text-muted" />
              Your Player Code
            </span>
          </label>
          {userProfile.userCode ? (
            <button
              onClick={handleCopyCode}
              className="flex items-center gap-3 w-full p-3 rounded-lg bg-gold-2/10 border border-gold-2/30 hover:border-gold hover:bg-gold-2/20 transition-colors group"
              title="Click to copy your player code"
            >
              <Hash className="w-4 h-4 text-gold shrink-0" />
              <span className="font-mono font-bold text-ink text-lg tracking-wide flex-1 text-left">
                #{userProfile.userCode}
              </span>
              <span>
                {codeCopied ? (
                  <Check className="w-4 h-4 text-green-600" />
                ) : (
                  <Copy className="w-4 h-4 text-muted group-hover:text-gold transition-colors" />
                )}
              </span>
            </button>
          ) : (
            <div className="p-3 rounded-lg bg-gray-50 border border-gray-200 text-sm text-muted">
              No code assigned yet
            </div>
          )}
          <p className="text-xs text-muted px-1">
            Share this code so friends can add you to tournaments
          </p>
        </div>

        {/* Email Display Section */}
        {user?.email && (
          <div className="space-y-3">
            <label className="block text-sm font-bold text-muted engraved">
              Email Address
            </label>
            <div className="p-3 rounded-lg bg-paper/50 border border-gold-2/20 text-sm text-ink">
              {user.email}
            </div>
          </div>
        )}

        {/* Success Message */}
        {successMessage && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 border border-green-200 text-green-800 text-sm">
            <Check className="w-4 h-4 shrink-0" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <Button 
            type="button" 
            variant="ghost" 
            className="flex-1"
            onClick={onClose}
            disabled={isSaving}
          >
            Cancel
          </Button>
          <Button 
            type="button" 
            variant="primary" 
            className="flex-1"
            onClick={handleSave}
            disabled={isSaving || !hasChanges || displayName.trim().length === 0}
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              'Save Changes'
            )}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

