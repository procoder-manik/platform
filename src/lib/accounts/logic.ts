/**
 * Account rules that need no database: password policy and email tidying. Pure and shared, so the form,
 * the server and the tests agree.
 */
export const MIN_PASSWORD = 10;

const COMMON = new Set(['password', 'password1', 'password12', 'password123', 'passw0rd123', '1234567890', '0123456789', 'qwertyuiop', 'qwerty12345', 'iloveyou123', 'letmein1234', 'welcome1234', 'administrator']);

/** A plain-words problem with a new password, or null when it is acceptable. */
export function passwordProblem(password: string, email = ''): string | null {
  if (password.length < MIN_PASSWORD) return `Use at least ${MIN_PASSWORD} characters.`;
  if (password.length > 200) return 'Use 200 characters or fewer.';
  if (/^(.)\1+$/.test(password)) return 'Do not use one character over and over.';
  const lower = password.toLowerCase();
  if (COMMON.has(lower)) return 'That password is too common. Choose something harder to guess.';
  const local = email.split('@')[0]?.toLowerCase() ?? '';
  if (email && (lower === email.toLowerCase() || (local.length >= 4 && lower.includes(local)))) return 'Do not use your email address in your password.';
  return null;
}

export const cleanEmail = (raw: unknown): string => String(raw ?? '').trim().toLowerCase();
export const isEmail = (v: string): boolean => v.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
