export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export function isValidPassword(password: string): boolean {
  return password.length >= 8;
}

export function isNonEmpty(value: string): boolean {
  return value.trim().length > 0;
}

export function passwordStrength(password: string): 'weak' | 'medium' | 'strong' {
  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecial = /[^A-Za-z0-9]/.test(password);
  const long = password.length >= 12;

  const score = [hasUpper, hasLower, hasNumber, hasSpecial, long].filter(Boolean).length;
  if (score >= 4) return 'strong';
  if (score >= 2) return 'medium';
  return 'weak';
}

export function sanitizeText(input: string): string {
  return input.trim().replace(/\s+/g, ' ');
}
