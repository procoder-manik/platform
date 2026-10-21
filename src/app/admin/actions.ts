'use server';

import { AuthError } from 'next-auth';
import { z } from 'zod';
import { signIn, signOut } from '@/lib/auth/config';

export interface SignInState {
  error?: string;
}

const schema = z.object({ email: z.string().trim(), password: z.string() });

const messages: Record<string, string> = {
  rate_limited: 'Too many attempts. Wait 15 minutes, then try again.',
  invalid: 'The email or password is not right. Check both and try again.',
};

export async function signInAction(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const { email, password } = schema.parse({ email: formData.get('email'), password: formData.get('password') });
  if (!email || !password) return { error: 'Enter your email and password.' };
  try {
    await signIn('credentials', { email, password, redirectTo: '/admin' });
    return {};
  } catch (error) {
    if (error instanceof AuthError) {
      const code = 'code' in error && typeof error.code === 'string' ? error.code : 'invalid';
      return { error: messages[code] ?? messages.invalid };
    }
    throw error; // Lets the redirect after a successful sign-in through.
  }
}

export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: '/admin/login' });
}
