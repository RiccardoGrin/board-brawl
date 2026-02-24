import { useEffect, useRef, useState } from 'react';
import { LogOut, User as UserIcon, Mail, Lock, Loader2, LogIn, UserPlus, Sparkles, Eye, EyeOff, KeyRound, CheckCircle, AlertCircle, Clock, MailCheck, Check, X, Hash, Copy, Settings } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useAuthModalStore } from '../store/authModalStore';
import { Button } from './ui/button';
import { Modal } from './ui/modal';
import { AccountSettingsModal } from './AccountSettingsModal';
import { validatePassword, checkPasswordRequirements, allPasswordRequirementsMet } from '../utils/validation';
import googleSvg from '/google.svg?url';

/** Authentication modal modes */
type Mode = 'signin' | 'signup' | 'reset';

/**
 * AuthMenu - Account dropdown with sign-in/sign-up modal
 * 
 * Features:
 * - Email/password authentication with client-side validation
 * - Google OAuth sign-in
 * - Password reset flow
 * - Email verification prompts
 * - Rate limiting feedback
 */
export function AuthMenu() {
  const user = useAuthStore(state => state.user);
  const userProfile = useAuthStore(state => state.userProfile);
  const status = useAuthStore(state => state.status);
  const error = useAuthStore(state => state.error);
  const successMessage = useAuthStore(state => state.successMessage);
  const rateLimit = useAuthStore(state => state.rateLimit);
  const signInWithEmail = useAuthStore(state => state.signInWithEmail);
  const signUpWithEmail = useAuthStore(state => state.signUpWithEmail);
  const signInWithGoogle = useAuthStore(state => state.signInWithGoogle);
  const signOut = useAuthStore(state => state.signOut);
  const sendPasswordReset = useAuthStore(state => state.sendPasswordReset);
  const sendVerificationEmail = useAuthStore(state => state.sendVerificationEmail);
  const clearError = useAuthStore(state => state.clearError);
  const clearSuccessMessage = useAuthStore(state => state.clearSuccessMessage);

  // Auth modal store for external triggers (e.g., from landing page CTA)
  const requestedMode = useAuthModalStore((state) => state.requestedMode);
  const clearRequest = useAuthModalStore((state) => state.clearRequest);

  // Modal and form state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  // Menu and refs
  const [menuOpen, setMenuOpen] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const emailInputRef = useRef<HTMLInputElement | null>(null);

  // Listen for external modal open requests (e.g., from landing page CTA)
  useEffect(() => {
    if (requestedMode) {
      clearError();
      clearSuccessMessage();
      setMode(requestedMode);
      setShowPassword(false);
      setShowConfirmPassword(false);
      setIsModalOpen(true);
      setMenuOpen(false);
      clearRequest();
    }
  }, [requestedMode, clearError, clearSuccessMessage, clearRequest]);

  // Copy user code to clipboard
  const copyUserCode = () => {
    if (userProfile.userCode) {
      navigator.clipboard.writeText(`#${userProfile.userCode}`);
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    }
  };

  // Derived state
  const isLoading = status === 'loading';
  const isRateLimited = rateLimit.lockedUntil !== null && rateLimit.remainingSeconds > 0;

  useEffect(() => {
    if (!menuOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [menuOpen]);

  const openModal = (selectedMode: Mode) => {
    clearError();
    clearSuccessMessage();
    setMode(selectedMode);
    setShowPassword(false);
    setShowConfirmPassword(false);
    setIsModalOpen(true);
    setMenuOpen(false);
  };

  // Focus email input when modal opens
  useEffect(() => {
    if (isModalOpen && emailInputRef.current) {
      // Small delay to ensure modal animation completes
      const timer = setTimeout(() => emailInputRef.current?.focus(), 100);
      return () => clearTimeout(timer);
    }
  }, [isModalOpen]);

  const closeModal = () => {
    setIsModalOpen(false);
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setLocalError(null);
    clearError();
    clearSuccessMessage();
  };

  // Unique IDs for aria-describedby (accessibility)
  const emailErrorId = 'email-error';
  const passwordErrorId = 'password-error';
  const confirmPasswordErrorId = 'confirm-password-error';
  const formErrorId = 'form-error';
  const formSuccessId = 'form-success';

  /**
   * Determines which form field should display an error message.
   * Routes errors to specific fields based on error message content
   * to provide contextual feedback near the relevant input.
   */
  const getFieldError = () => {
    const combinedError = error || localError;
    if (!combinedError) return { email: null, password: null, confirmPassword: null, general: null };
    
    const lowerError = combinedError.toLowerCase();
    
    // Email-only errors (validation issues, user not found)
    if (lowerError.includes('valid email') || lowerError.includes('no account') || lowerError.includes('user not found')) {
      return { email: combinedError, password: null, confirmPassword: null, general: null };
    }
    
    // Password mismatch error
    if (lowerError.includes('do not match')) {
      return { email: null, password: null, confirmPassword: combinedError, general: null };
    }
    
    // Password-only errors (validation issues, weak password, credential errors)
    if (lowerError.includes('password') || lowerError.includes('credential') || lowerError.includes('incorrect')) {
      return { email: null, password: combinedError, confirmPassword: null, general: null };
    }
    
    // Email already in use (show at email field)
    if (lowerError.includes('email') && lowerError.includes('already')) {
      return { email: combinedError, password: null, confirmPassword: null, general: null };
    }
    
    // Everything else is a general error
    return { email: null, password: null, confirmPassword: null, general: combinedError };
  };

  const fieldErrors = getFieldError();

  // Password requirements for signup mode
  const requirementsMet = checkPasswordRequirements(password);
  const allRequirementsMet = allPasswordRequirementsMet(password);
  const passwordsMatch = password === confirmPassword && confirmPassword.length > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    clearSuccessMessage();
    setLocalError(null);

    // Handle password reset mode
    if (mode === 'reset') {
      const success = await sendPasswordReset(email);
      if (success) {
        // Keep modal open to show success message
      }
      return;
    }

    // Client-side validation for sign-up
    if (mode === 'signup') {
      const passwordError = validatePassword(password);
      if (passwordError) {
        setLocalError(passwordError);
        return;
      }
      if (password !== confirmPassword) {
        setLocalError('Passwords do not match.');
        return;
      }
    }

    if (mode === 'signin') {
      await signInWithEmail(email, password);
    } else {
      await signUpWithEmail(email, password);
    }
    
    const state = useAuthStore.getState();
    if (!state.error) {
      // For signup, keep modal open briefly to show verification message
      if (mode === 'signup' && state.successMessage) {
        setPassword('');
        setConfirmPassword('');
        // Close after a delay so user can see the success message
        setTimeout(() => {
          setEmail('');
          setIsModalOpen(false);
        }, 3000);
      } else {
        setEmail('');
        setPassword('');
        setConfirmPassword('');
        setIsModalOpen(false);
      }
    }
  };

  const avatarLetter = user?.displayName?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || 'U';
  const showSignedOut = !user;

  return (
    <div className="relative" ref={menuRef} data-auth-menu>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setMenuOpen(prev => !prev)}
        className="group w-11 h-11 p-0 text-ink hover:text-gold bg-transparent hover:bg-transparent focus-visible:bg-transparent rounded-full"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
      >
        <div className="w-11 h-11 rounded-full bg-white/95 shadow-md backdrop-blur-sm border-2 border-gold-2/60 flex items-center justify-center text-ink font-bold transition-all group-hover:border-gold group-hover:text-gold group-hover:shadow-lg">
          {showSignedOut ? <UserIcon className="w-5 h-5" /> : <span className="text-base">{avatarLetter}</span>}
        </div>
        <span className="sr-only">Account menu</span>
      </Button>

      {menuOpen && (
        <div
          role="menu"
          aria-label="Account actions"
          className="absolute right-0 mt-2 w-56 card-medieval bg-white shadow-main p-2 z-50"
        >
          {showSignedOut ? (
            <div className="flex flex-col gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start gap-2 hover:text-gold"
                onClick={() => openModal('signin')}
              >
                <LogIn className="w-4 h-4" />
                Sign in
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start gap-2 hover:text-gold"
                onClick={() => openModal('signup')}
              >
                <UserPlus className="w-4 h-4" />
                Create account
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              {/* User display name header */}
              {(userProfile.displayName || user?.displayName || userProfile.userCode) && (
                <div className="px-3 py-2 text-sm text-muted engraved">
                  <div className="font-bold text-ink truncate">
                    {userProfile.displayName || user?.displayName || `Player #${userProfile.userCode}`}
                  </div>
                </div>
              )}
              {/* User code display */}
              {userProfile.userCode && (
                <div className="px-3 py-2">
                  <button
                    onClick={copyUserCode}
                    className="flex items-center gap-2 w-full p-2 rounded bg-gold-2/10 border border-gold-2/30 hover:border-gold hover:bg-gold-2/20 transition-colors group"
                    title="Click to copy your player code"
                  >
                    <Hash className="w-3.5 h-3.5 text-gold shrink-0" />
                    <span className="font-mono font-bold text-ink text-sm tracking-wide">{userProfile.userCode}</span>
                    <span className="ml-auto">
                      {codeCopied ? (
                        <Check className="w-3.5 h-3.5 text-green-600" />
                      ) : (
                        <Copy className="w-3.5 h-3.5 text-muted group-hover:text-gold transition-colors" />
                      )}
                    </span>
                  </button>
                  <p className="text-[10px] text-muted mt-1 px-1">Share this code so friends can add you to tournaments</p>
                </div>
              )}
              {/* Email verification prompt */}
              {user && !user.emailVerified && user.providerData?.[0]?.providerId === 'password' && (
                <div className="px-3 py-2 mb-1">
                  <div className="flex items-start gap-2 p-2 rounded bg-amber-50 border border-amber-200 text-xs text-amber-800">
                    <MailCheck className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    <div>
                      <span>Email not verified.</span>
                      <button
                        type="button"
                        onClick={async () => {
                          await sendVerificationEmail();
                        }}
                        disabled={isLoading}
                        className="ml-1 underline hover:text-amber-900 font-medium"
                      >
                        {isLoading ? 'Sending...' : 'Resend'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
              {/* Account Settings button */}
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start gap-2 hover:text-gold"
                onClick={() => {
                  setMenuOpen(false);
                  setIsSettingsModalOpen(true);
                }}
              >
                <Settings className="w-4 h-4" />
                Account Settings
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start gap-2 text-muted hover:text-red-700"
                onClick={() => {
                  setMenuOpen(false);
                  signOut();
                }}
              >
                <LogOut className="w-4 h-4" />
                Sign out
              </Button>
            </div>
          )}
        </div>
      )}

      <Modal 
        isOpen={isModalOpen} 
        onClose={closeModal} 
        title={mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Reset password'}
      >
        <form className="space-y-5" onSubmit={handleSubmit}>
          {/* Mode tabs - hide in reset mode */}
          {mode !== 'reset' && (
            <div className="flex gap-3">
              <Button
                type="button"
                variant={mode === 'signin' ? 'primary' : 'ghost'}
                size="sm"
                className="flex-1"
                onClick={() => { setMode('signin'); setLocalError(null); clearError(); clearSuccessMessage(); }}
              >
                <LogIn className="w-4 h-4 mr-2" /> Sign in
              </Button>
              <Button
                type="button"
                variant={mode === 'signup' ? 'primary' : 'ghost'}
                size="sm"
                className="flex-1"
                onClick={() => { setMode('signup'); setLocalError(null); clearError(); clearSuccessMessage(); }}
              >
                <UserPlus className="w-4 h-4 mr-2" /> Create
              </Button>
            </div>
          )}

          {/* Back to sign in link for reset mode */}
          {mode === 'reset' && (
            <button
              type="button"
              onClick={() => { setMode('signin'); clearError(); clearSuccessMessage(); }}
              className="flex items-center gap-1 text-sm text-muted hover:text-gold transition-colors"
            >
              <LogIn className="w-3 h-3" />
              Back to sign in
            </button>
          )}

          {/* Success message */}
          {successMessage && (
            <div 
              id={formSuccessId}
              className="flex items-start gap-2 p-3 rounded-lg bg-green-50 border border-green-200 text-green-800 text-sm"
              role="status"
              aria-live="polite"
            >
              <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Rate limit warning */}
          {isRateLimited && (
            <div 
              className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm"
              role="alert"
              aria-live="assertive"
            >
              <Clock className="w-4 h-4 mt-0.5 shrink-0 animate-pulse" />
              <span>Too many attempts. Please wait {rateLimit.remainingSeconds}s before trying again.</span>
            </div>
          )}

          {/* General error (not field-specific) */}
          {fieldErrors.general && (
            <div 
              id={formErrorId}
              className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm"
              role="alert"
              aria-live="assertive"
            >
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{fieldErrors.general}</span>
            </div>
          )}

          {/* Email field */}
          <div className="space-y-2">
            <label htmlFor="auth-email" className="block text-sm font-bold text-muted engraved">
              <span className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-muted" />
                Email
              </span>
            </label>
            <input
              id="auth-email"
              ref={emailInputRef}
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={`w-full h-11 px-3 bg-paper/70 border rounded focus:outline-none focus:ring-2 focus:ring-gold/50 focus:border-gold ${
                fieldErrors.email ? 'border-red-400 focus:ring-red-200 focus:border-red-400' : 'border-gold-2/40'
              }`}
              autoComplete="email"
              placeholder="you@example.com"
              aria-invalid={!!fieldErrors.email}
              aria-describedby={fieldErrors.email ? emailErrorId : undefined}
            />
            {fieldErrors.email && (
              <p id={emailErrorId} className="flex items-center gap-1.5 text-sm text-red-600" role="alert">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                {fieldErrors.email}
              </p>
            )}
          </div>

          {/* Password field - hide in reset mode */}
          {mode !== 'reset' && (
            <div className="space-y-2">
              <label htmlFor="auth-password" className="block text-sm font-bold text-muted engraved">
                <span className="flex items-center gap-2">
                  <Lock className="w-4 h-4 text-muted" />
                  Password
                </span>
              </label>
              <div className="relative">
                <input
                  id="auth-password"
                  required
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`w-full h-11 px-3 pr-10 bg-paper/70 border rounded focus:outline-none focus:ring-2 focus:ring-gold/50 focus:border-gold ${
                    fieldErrors.password ? 'border-red-400 focus:ring-red-200 focus:border-red-400' : 'border-gold-2/40'
                  }`}
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  placeholder="••••••••"
                  aria-invalid={!!fieldErrors.password}
                  aria-describedby={fieldErrors.password ? passwordErrorId : undefined}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-ink transition-colors"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {fieldErrors.password && (
                <p id={passwordErrorId} className="flex items-center gap-1.5 text-sm text-red-600" role="alert">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  {fieldErrors.password}
                </p>
              )}
              
              {/* Password requirements checklist - only show in signup mode */}
              {mode === 'signup' && password.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {requirementsMet.map(req => (
                    <li 
                      key={req.id} 
                      className={`flex items-center gap-2 text-xs ${req.met ? 'text-green-600' : 'text-muted'}`}
                    >
                      {req.met ? (
                        <Check className="w-3.5 h-3.5" />
                      ) : (
                        <X className="w-3.5 h-3.5" />
                      )}
                      {req.label}
                    </li>
                  ))}
                </ul>
              )}
              
              {/* Forgot password link - only show in signin mode */}
              {mode === 'signin' && (
                <button
                  type="button"
                  onClick={() => { setMode('reset'); clearError(); clearSuccessMessage(); setLocalError(null); }}
                  className="text-xs text-muted hover:text-gold transition-colors"
                >
                  Forgot your password?
                </button>
              )}
            </div>
          )}

          {/* Confirm Password field - only show in signup mode */}
          {mode === 'signup' && (
            <div className="space-y-2">
              <label htmlFor="auth-confirm-password" className="block text-sm font-bold text-muted engraved">
                <span className="flex items-center gap-2">
                  <Lock className="w-4 h-4 text-muted" />
                  Confirm Password
                </span>
              </label>
              <div className="relative">
                <input
                  id="auth-confirm-password"
                  required
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className={`w-full h-11 px-3 pr-10 bg-paper/70 border rounded focus:outline-none focus:ring-2 focus:ring-gold/50 focus:border-gold ${
                    (fieldErrors.confirmPassword || (confirmPassword && password !== confirmPassword)) 
                      ? 'border-red-400 focus:ring-red-200 focus:border-red-400' 
                      : 'border-gold-2/40'
                  }`}
                  autoComplete="new-password"
                  placeholder="••••••••"
                  aria-invalid={!!fieldErrors.confirmPassword || (confirmPassword.length > 0 && password !== confirmPassword)}
                  aria-describedby={fieldErrors.confirmPassword ? confirmPasswordErrorId : undefined}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-ink transition-colors"
                  aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                >
                  {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {fieldErrors.confirmPassword && (
                <p id={confirmPasswordErrorId} className="flex items-center gap-1.5 text-sm text-red-600" role="alert">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  {fieldErrors.confirmPassword}
                </p>
              )}
              {confirmPassword && password !== confirmPassword && !fieldErrors.confirmPassword && (
                <p className="flex items-center gap-1.5 text-xs text-red-600">
                  <X className="w-3 h-3" />
                  Passwords do not match
                </p>
              )}
              {passwordsMatch && (
                <p className="flex items-center gap-1.5 text-xs text-green-600">
                  <Check className="w-3 h-3" />
                  Passwords match
                </p>
              )}
            </div>
          )}

          {/* Reset mode description */}
          {mode === 'reset' && !successMessage && (
            <p className="text-sm text-muted">
              Enter your email address and we'll send you a link to reset your password.
            </p>
          )}

          <div className="space-y-3">
            <Button 
              type="submit" 
              variant="primary" 
              className="w-full justify-center"
              disabled={isLoading || isRateLimited || (mode === 'signup' && (!allRequirementsMet || !passwordsMatch))}
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : mode === 'reset' ? (
                <KeyRound className="w-4 h-4 mr-2" />
              ) : (
                <Sparkles className="w-4 h-4 mr-2" />
              )}
              {mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Send reset link'}
            </Button>
            
            {/* Google sign-in - hide in reset mode */}
            {mode !== 'reset' && (
              <Button
                type="button"
                variant="secondary"
                className="w-full justify-center"
                onClick={async () => {
                  clearError();
                  clearSuccessMessage();
                  await signInWithGoogle();
                  if (!useAuthStore.getState().error) {
                    setEmail('');
                    setPassword('');
                    setConfirmPassword('');
                    setIsModalOpen(false);
                  }
                }}
                disabled={isLoading || isRateLimited}
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <img src={googleSvg} alt="Google logo" className="w-4 h-4 mr-2" />
                )}
                Continue with Google
              </Button>
            )}
          </div>
        </form>
      </Modal>

      <AccountSettingsModal 
        isOpen={isSettingsModalOpen} 
        onClose={() => setIsSettingsModalOpen(false)} 
      />
    </div>
  );
}
