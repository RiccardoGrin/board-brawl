/** Password requirements for validation */
export const PASSWORD_REQUIREMENTS = [
  { id: 'length', label: 'At least 8 characters', test: (p: string) => p.length >= 8 },
  { id: 'uppercase', label: 'One uppercase letter', test: (p: string) => /[A-Z]/.test(p) },
  { id: 'number', label: 'One number', test: (p: string) => /[0-9]/.test(p) },
] as const;

/**
 * Validates password meets requirements: 8+ chars, 1 uppercase, 1 number
 * @returns Error message if invalid, null if valid
 */
export function validatePassword(password: string): string | null {
  if (password.length < 8) {
    return 'Password must be at least 8 characters.';
  }
  if (!/[A-Z]/.test(password)) {
    return 'Password must contain at least one uppercase letter.';
  }
  if (!/[0-9]/.test(password)) {
    return 'Password must contain at least one number.';
  }
  return null;
}

/**
 * Check which password requirements are met
 * @returns Array of requirements with met status
 */
export function checkPasswordRequirements(password: string) {
  return PASSWORD_REQUIREMENTS.map(req => ({
    ...req,
    met: req.test(password),
  }));
}

/**
 * Check if all password requirements are met
 */
export function allPasswordRequirementsMet(password: string): boolean {
  return PASSWORD_REQUIREMENTS.every(req => req.test(password));
}

