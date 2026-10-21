'use server';

import { headers } from 'next/headers';
import { z } from 'zod';
import { HttpError } from '@/lib/http/errors';
import { requireModule } from '@/lib/modules/server';
import { changePassword, deleteAddress, deleteCustomerAccount, getCustomer, loginCustomer, registerCustomer, requestMagicLink, requestPasswordReset, resendVerification, resetPassword, saveAddress, signInWithLink, signOutCustomer, toggleWishlist, updateProfile, verifyEmail, type Customer, type Meta } from './engine';

export type Result = { ok: true; message: string; redirect?: string; saved?: boolean } | { ok: false; message: string; errors: Record<string, string>; needLogin?: boolean };

async function meta(): Promise<Meta> {
  const h = await headers();
  return { ip: h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown', userAgent: h.get('user-agent') };
}

/** Only a path on this site. Anything else goes to the account page. */
export async function safeNext(next: unknown): Promise<string> {
  const n = typeof next === 'string' ? next : '';
  return /^\/(?!\/)[^\s\\]{0,300}$/.test(n) && !n.startsWith('/admin') && !n.startsWith('/api') ? n : '/account';
}

function fail(error: unknown): Result {
  if (error instanceof HttpError) return { ok: false, message: error.message, errors: error.code && error.code !== 'error' ? { [error.code]: error.message } : {}, needLogin: error.status === 401 && error.code === 'unauthenticated' };
  if (error instanceof z.ZodError) return { ok: false, message: 'Some fields need attention.', errors: Object.fromEntries(error.issues.map((i) => [String(i.path[0] ?? 'form'), i.message])) };
  console.error('[accounts] unexpected error', error);
  return { ok: false, message: 'Something went wrong on our side. Please try again.', errors: {} };
}

async function signedIn(): Promise<Customer> {
  await requireModule('accounts');
  const customer = await getCustomer();
  if (!customer) throw new HttpError(401, 'Please sign in first.', 'unauthenticated');
  return customer;
}

const email = z.string().max(254);
const text = (n: number) => z.string().max(n);

export async function registerAction(input: unknown): Promise<Result> {
  try {
    await requireModule('accounts');
    const d = z.object({ name: text(120), email, password: text(200), company: text(100).optional() }).strict().parse(input);
    if (d.company) return { ok: true, message: 'Check your email.' };
    await registerCustomer(d, await meta());
    return { ok: true, message: 'Thank you. If this email address can have an account, we sent you a link to confirm it. Then you can sign in.' };
  } catch (error) {
    return fail(error);
  }
}

export async function loginAction(input: unknown): Promise<Result> {
  try {
    await requireModule('accounts');
    const d = z.object({ email, password: text(200), next: text(400).optional() }).strict().parse(input);
    await loginCustomer(d.email, d.password, await meta());
    return { ok: true, message: 'Signed in.', redirect: await safeNext(d.next) };
  } catch (error) {
    return fail(error);
  }
}

export async function logoutAction(): Promise<Result> {
  await signOutCustomer();
  return { ok: true, message: 'Signed out.', redirect: '/' };
}

export async function forgotAction(input: unknown): Promise<Result> {
  try {
    await requireModule('accounts');
    const d = z.object({ email }).strict().parse(input);
    await requestPasswordReset(d.email, await meta());
    return { ok: true, message: 'If there is an account with this email address, we sent a link to choose a new password. It works for one hour.' };
  } catch (error) {
    return fail(error);
  }
}

export async function magicLinkAction(input: unknown): Promise<Result> {
  try {
    await requireModule('accounts');
    const d = z.object({ email }).strict().parse(input);
    await requestMagicLink(d.email, await meta());
    return { ok: true, message: 'If there is an account with this email address, we sent a sign-in link. It works for 15 minutes.' };
  } catch (error) {
    return fail(error);
  }
}

export async function resetAction(input: unknown): Promise<Result> {
  try {
    await requireModule('accounts');
    const d = z.object({ token: text(100), password: text(200) }).strict().parse(input);
    await resetPassword(d.token, d.password, await meta());
    return { ok: true, message: 'Your password was changed. You can sign in now.', redirect: '/account/login' };
  } catch (error) {
    return fail(error);
  }
}

/** Used by the confirm buttons on the emailed links. */
export async function confirmLinkAction(kind: 'verify' | 'magic', token: string): Promise<Result> {
  try {
    await requireModule('accounts');
    const t = z.string().min(20).max(100).parse(token);
    if (kind === 'verify') {
      if (!(await verifyEmail(t))) throw new HttpError(410, 'This link has expired or was already used. Sign in and ask for a new one.');
      return { ok: true, message: 'Your email address is confirmed. Earlier orders with this address are now in your account.', redirect: '/account' };
    }
    if (!(await signInWithLink(t, await meta()))) throw new HttpError(410, 'This link has expired or was already used. Ask for a new one.');
    return { ok: true, message: 'Signed in.', redirect: '/account' };
  } catch (error) {
    return fail(error);
  }
}

export async function resendVerifyAction(): Promise<Result> {
  try {
    await resendVerification(await signedIn());
    return { ok: true, message: 'We sent a new confirmation link.' };
  } catch (error) {
    return fail(error);
  }
}

export async function profileAction(input: unknown): Promise<Result> {
  try {
    const d = z.object({ name: text(120), phone: text(40) }).strict().parse(input);
    await updateProfile(await signedIn(), d);
    return { ok: true, message: 'Saved.' };
  } catch (error) {
    return fail(error);
  }
}

export async function passwordAction(input: unknown): Promise<Result> {
  try {
    const d = z.object({ current: text(200), password: text(200) }).strict().parse(input);
    await changePassword(await signedIn(), d.current, d.password);
    return { ok: true, message: 'Your password was changed. Other devices were signed out.' };
  } catch (error) {
    return fail(error);
  }
}

export async function saveAddressAction(input: unknown): Promise<Result> {
  try {
    const d = z.object({ id: text(100).optional(), label: text(40).optional(), isDefault: z.boolean().optional(), address: z.record(z.string().max(20), z.string().max(200)) }).strict().parse(input);
    await saveAddress(await signedIn(), d);
    return { ok: true, message: 'Address saved.' };
  } catch (error) {
    return fail(error);
  }
}

export async function deleteAddressAction(id: string): Promise<Result> {
  try {
    await deleteAddress(await signedIn(), z.string().min(1).max(100).parse(id));
    return { ok: true, message: 'Address deleted.' };
  } catch (error) {
    return fail(error);
  }
}

export async function wishlistAction(productId: string): Promise<Result> {
  try {
    const saved = await toggleWishlist(await signedIn(), z.string().min(1).max(100).parse(productId));
    return { ok: true, saved, message: saved ? 'Saved to your wishlist.' : 'Removed from your wishlist.' };
  } catch (error) {
    return fail(error);
  }
}

export async function deleteAccountAction(input: unknown): Promise<Result> {
  try {
    const d = z.object({ password: text(200) }).strict().parse(input);
    await deleteCustomerAccount(await signedIn(), d.password);
    return { ok: true, message: 'Your account was deleted.', redirect: '/' };
  } catch (error) {
    return fail(error);
  }
}
