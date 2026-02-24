import { useState, useEffect, useCallback } from 'react';
import { Hash, Link, Loader2, User, X, AlertCircle } from 'lucide-react';
import { lookupUserByCode, type UserProfile } from '../../services/firestoreSync';
import { cn } from '../../utils/cn';
import { useAuthStore } from '../../store/authStore';

interface PlayerInputProps {
  /** Current input value (player name or #code) */
  value: string;
  /** Callback when input value changes */
  onChange: (value: string) => void;
  /** Callback when a user is successfully linked via #code */
  onUserLinked?: (userId: string, displayName: string | null, userCode: string) => void;
  /** Callback when a linked user is unlinked */
  onUserUnlinked?: () => void;
  /** ID of the currently linked user (if any) */
  linkedUserId?: string;
  /** List of userIds already in the tournament (to prevent duplicates) */
  existingUserIds?: string[];
  /** Placeholder text for the input */
  placeholder?: string;
  /** Additional CSS classes */
  className?: string;
  /** Whether the input is disabled */
  disabled?: boolean;
  /** Whether to auto-focus the input */
  autoFocus?: boolean;
  /** Whether to show the unlink button when player is linked (default: true for editing, false for adding) */
  showUnlinkButton?: boolean;
  /** Accessibility label */
  'aria-label'?: string;
  /** Whether the input has a validation error */
  'aria-invalid'?: boolean;
  /** ID of the element describing the input (for errors) */
  'aria-describedby'?: string;
}

type LinkStatus = 'idle' | 'searching' | 'found' | 'not-found' | 'linked';

/**
 * PlayerInput - An enhanced input for adding players with #code linking support.
 * 
 * When a user types a #code (6 digits), it searches for the user and allows linking.
 * The linked user will be able to see the tournament in their "Shared with You" section.
 * 
 * Usage:
 * - Type a player name normally: "John"
 * - Type #123456 to search for and link a registered user
 */
export function PlayerInput({
  value,
  onChange,
  onUserLinked,
  onUserUnlinked,
  linkedUserId,
  existingUserIds = [],
  placeholder = 'Player Name or #code',
  className,
  disabled = false,
  autoFocus = false,
  showUnlinkButton = true,
  'aria-label': ariaLabel,
  'aria-invalid': ariaInvalid,
  'aria-describedby': ariaDescribedBy,
}: PlayerInputProps) {
  const currentUserCode = useAuthStore(state => state.userProfile.userCode);
  
  const [linkStatus, setLinkStatus] = useState<LinkStatus>(linkedUserId ? 'linked' : 'idle');
  const [foundUser, setFoundUser] = useState<UserProfile | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Extract code from input if present
  const codeMatch = value.match(/^#(\d{6})$/);
  const inputCode = codeMatch?.[1];

  // Debounced user lookup
  useEffect(() => {
    if (!inputCode || linkedUserId) {
      if (!linkedUserId) {
        setLinkStatus('idle');
        setFoundUser(null);
        setSearchError(null);
      }
      return;
    }

    setLinkStatus('searching');
    setSearchError(null);

    const timer = setTimeout(async () => {
      try {
        const user = await lookupUserByCode(inputCode);
        if (user) {
          // Check if this user is already linked to another player in the tournament
          if (existingUserIds.includes(user.uid)) {
            setFoundUser(null);
            setLinkStatus('not-found');
            setSearchError('This player is already in the tournament');
            return;
          }
          
          setFoundUser(user);
          setLinkStatus('found');
        } else {
          setFoundUser(null);
          setLinkStatus('not-found');
          setSearchError('No player found with this code');
        }
      } catch (error) {
        console.error('Failed to lookup user:', error);
        setFoundUser(null);
        setLinkStatus('not-found');
        setSearchError('Failed to search. Try again.');
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [inputCode, linkedUserId, currentUserCode, existingUserIds]);

  // Handle linking the found user
  const handleLink = useCallback(() => {
    if (foundUser && onUserLinked) {
      onUserLinked(foundUser.uid, foundUser.displayName ?? null, foundUser.userCode);
      // Update display to show the user's name: user-set displayName > Player #code
      const displayName = foundUser.displayName || `Player #${foundUser.userCode}`;
      onChange(displayName);
      setLinkStatus('linked');
    }
  }, [foundUser, onUserLinked, onChange]);

  // Handle unlinking
  const handleUnlink = useCallback(() => {
    if (onUserUnlinked) {
      onUserUnlinked();
    }
    onChange('');
    setLinkStatus('idle');
    setFoundUser(null);
  }, [onUserUnlinked, onChange]);

  const isLinked = linkStatus === 'linked' || !!linkedUserId;

  return (
    <div className="relative flex-1">
      <div className="relative">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled || isLinked}
          autoFocus={autoFocus}
          aria-label={ariaLabel}
          aria-invalid={ariaInvalid}
          aria-describedby={ariaDescribedBy}
          className={cn(
            'h-11 text-base w-full bg-paper/70 px-4 pr-10',
            'border rounded focus:outline-none focus:ring-2 focus:ring-gold/50',
            isLinked && 'bg-green-50/50 border-green-300 pr-10',
            ariaInvalid ? 'border-red-300' : 'border-gold-2/30 focus:border-gold',
            disabled && 'opacity-50 cursor-not-allowed',
            className
          )}
        />
        
        {/* Status indicator */}
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          {linkStatus === 'searching' && (
            <Loader2 className="w-4 h-4 text-muted animate-spin" />
          )}
          {linkStatus === 'found' && !isLinked && (
            <Link className="w-4 h-4 text-gold" />
          )}
          {linkStatus === 'not-found' && (
            <AlertCircle className="w-4 h-4 text-red-400" />
          )}
          {isLinked && showUnlinkButton && (
            <button
              type="button"
              onClick={handleUnlink}
              className="p-0.5 hover:bg-red-100 rounded transition-colors"
              title="Unlink player"
            >
              <X className="w-4 h-4 text-red-500" />
            </button>
          )}
          {isLinked && !showUnlinkButton && (
            <Link className="w-4 h-4 text-green-600" aria-label="Linked player - can see this tournament" />
          )}
        </div>
      </div>

      {/* Link confirmation UI */}
      {linkStatus === 'found' && foundUser && !isLinked && (
        <div className="absolute left-0 right-0 top-full mt-1 z-10">
          <button
            type="button"
            onClick={handleLink}
            className="w-full p-3 card-medieval bg-white shadow-main flex items-center gap-3 hover:bg-white transition-colors text-left"
          >
            <div className="w-9 h-9 rounded-full bg-gold/15 border border-gold-2/60 flex items-center justify-center">
              <User className="w-4 h-4 text-gold" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-ink text-sm truncate">
                {foundUser.displayName || 'BoardBrawl Player'}
              </div>
              <div className="flex items-center gap-1 text-xs text-muted">
                <Hash className="w-3 h-3" />
                {foundUser.userCode}
              </div>
            </div>
          </button>
        </div>
      )}

      {/* Error message */}
      {searchError && linkStatus === 'not-found' && (
        <div className="flex items-center gap-1.5 mt-1.5 text-xs text-red-600">
          <AlertCircle className="w-3 h-3" />
          <span>{searchError}</span>
        </div>
      )}

      {/* Hint for code input */}
      {!inputCode && !isLinked && value.startsWith('#') && value.length < 7 && (
        <div className="flex items-center gap-1.5 mt-1.5 text-xs text-muted">
          <Hash className="w-3 h-3" />
          <span>Enter a 6-digit code to link a player</span>
        </div>
      )}
    </div>
  );
}

