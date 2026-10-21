import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { cache } from 'react';
import type { Order, Prisma } from '@/generated/prisma/client';
import { getDb } from '@/lib/db';
import { writeAudit } from '@/lib/audit';
import { HttpError } from '@/lib/http/errors';
import { rateLimit } from '@/lib/adapters/ratelimit';
import { hashPassword, verifyPassword } from '@/lib/auth/password';
import { sendTemplate } from '@/lib/mail/send';
import type { TemplateId } from '@/lib/mail/templates';
import { baseUrl } from '@/lib/url';
import { checkAddress } from '@/lib/store/logic';
import { cleanEmail, isEmail, passwordProblem } from './logic';

export const CUSTOMER_COOKIE = 'cs';
const SESSION_DAYS = 30;
const MAX_ADDRESSES = 10;

const isUnique = (e: unknown) => typeof e === 'object' && e !== null && (e as { code?: string }).code === 'P2002';
const sha = (raw: string) => createHash('sha256').update(raw).digest('hex');

export interface Customer {
  id: string;
  email: string;
  name: string | null;
  phone: string | null;
  verified: boolean;
  /** The session token, so a password change can keep this device signed in. */
  sessionToken: string;
}

// ---------- the signed-in customer ----------

/** The signed-in customer, or null. The cookie holds only a random token; every request checks its Session row. */
export const getCustomer = cache(async (): Promise<Customer | null> => {
  const token = (await cookies()).get(CUSTOMER_COOKIE)?.value;
  if (!token || token.length < 20 || token.length > 80) return null;
  const row = await getDb().session.findUnique({ where: { sessionToken: token }, include: { user: true } });
  if (!row || row.expires < new Date() || row.user.kind !== 'CUSTOMER' || row.user.blocked) return null;
  return { id: row.user.id, email: row.user.email, name: row.user.name, phone: row.user.phone, verified: row.user.emailVerified !== null, sessionToken: token };
});

async function startSession(userId: string, meta: { ip?: string | null; userAgent?: string | null }): Promise<void> {
  const row = await getDb().session.create({ data: { sessionToken: randomBytes(32).toString('base64url'), userId, expires: new Date(Date.now() + SESSION_DAYS * 86_400_000), ip: meta.ip ?? null, userAgent: meta.userAgent?.slice(0, 300) ?? null } });
  (await cookies()).set(CUSTOMER_COOKIE, row.sessionToken, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: SESSION_DAYS * 86_400 });
  await getDb().user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } });
}

export async function signOutCustomer(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(CUSTOMER_COOKIE)?.value;
  if (token) await getDb().session.deleteMany({ where: { sessionToken: token } });
  jar.delete(CUSTOMER_COOKIE);
}

// ---------- one-time links ----------

type TokenKind = 'verify' | 'reset' | 'login';
const TTL: Record<TokenKind, number> = { verify: 3 * 86_400_000, reset: 3_600_000, login: 15 * 60_000 };

/** A one-time link token. Only its hash is stored, so a copy of the database cannot be used to sign in. */
async function issueToken(kind: TokenKind, email: string): Promise<string> {
  const db = getDb();
  const identifier = `${kind}:${email}`;
  await db.verificationToken.deleteMany({ where: { identifier } });
  const raw = randomBytes(32).toString('base64url');
  await db.verificationToken.create({ data: { identifier, token: sha(raw), expires: new Date(Date.now() + TTL[kind]) } });
  return raw;
}

/** Uses a token once. Returns the email it was issued for, or null when it is wrong, used or expired. */
async function consumeToken(kind: TokenKind, raw: string): Promise<string | null> {
  if (raw.length < 20 || raw.length > 80) return null;
  const db = getDb();
  const row = await db.verificationToken.findUnique({ where: { token: sha(raw) } });
  if (!row || !row.identifier.startsWith(`${kind}:`)) return null;
  const gone = await db.verificationToken.deleteMany({ where: { token: row.token } });
  if (gone.count === 0 || row.expires < new Date()) return null;
  return row.identifier.slice(kind.length + 1);
}

async function mail(template: TemplateId, to: string, name: string | null, link: string, manageLink = ''): Promise<void> {
  await sendTemplate(template, to, { name: name || 'there', link, manage_link: manageLink || link }, { entity: 'account', entityId: to });
}

const absolute = async (path: string) => `${await baseUrl()}${path}`;

// ---------- registering and signing in ----------

export interface Meta {
  ip?: string | null;
  userAgent?: string | null;
}

/**
 * Creates an account. The answer is the same whether or not the email is already known, so the form cannot be
 * used to find out who has an account. A new address gets a confirmation email; a known one gets a notice.
 */
export async function registerCustomer(input: { name: string; email: string; password: string }, meta: Meta): Promise<void> {
  const email = cleanEmail(input.email);
  const name = input.name.trim().slice(0, 120);
  if (!name) throw new HttpError(422, 'Enter your name.', 'name');
  if (!isEmail(email)) throw new HttpError(422, 'Enter a valid email address.', 'email');
  const problem = passwordProblem(input.password, email);
  if (problem) throw new HttpError(422, problem, 'password');
  if (!(await rateLimit(`register:ip:${meta.ip ?? 'unknown'}`, { max: 10, windowMs: 3_600_000 })).ok) throw new HttpError(429, 'Too many attempts from this connection. Please try again later.');

  const db = getDb();
  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    if (existing.kind === 'CUSTOMER' && !existing.blocked) await mail('account.exists', email, existing.name, await absolute('/account/login'), await absolute('/account/forgot'));
    return;
  }
  try {
    const user = await db.user.create({ data: { email, name, kind: 'CUSTOMER', passwordHash: await hashPassword(input.password) } });
    await mail('account.verify', email, user.name, await absolute(`/account/verify/${await issueToken('verify', email)}`));
  } catch (error) {
    if (!isUnique(error)) throw error;
  }
}

/** Password sign-in. One message for every failure, and limits per email and per connection. */
export async function loginCustomer(emailRaw: string, password: string, meta: Meta): Promise<void> {
  const email = cleanEmail(emailRaw);
  const [byEmail, byIp] = await Promise.all([rateLimit(`csignin:email:${email}`, { max: 5, windowMs: 15 * 60_000 }), rateLimit(`csignin:ip:${meta.ip ?? 'unknown'}`, { max: 30, windowMs: 15 * 60_000 })]);
  if (!byEmail.ok || !byIp.ok) throw new HttpError(429, 'Too many sign-in attempts. Please wait 15 minutes and try again.');
  const user = isEmail(email) ? await getDb().user.findUnique({ where: { email } }) : null;
  const valid = !!user?.passwordHash && (await verifyPassword(user.passwordHash, password));
  if (!user || !valid || user.kind !== 'CUSTOMER' || user.blocked) {
    await writeAudit({ action: 'customer.signin.failed', entity: 'user', entityId: user?.id, ip: meta.ip ?? undefined, diff: { email } });
    throw new HttpError(401, 'The email or password is not right.', 'login');
  }
  await startSession(user.id, meta);
  await writeAudit({ userId: user.id, action: 'customer.signin', entity: 'user', entityId: user.id, ip: meta.ip ?? undefined });
}

/** Asks for a password reset email. Always looks the same from outside. */
export async function requestPasswordReset(emailRaw: string, meta: Meta): Promise<void> {
  const email = cleanEmail(emailRaw);
  if (!isEmail(email)) return;
  if (!(await rateLimit(`reset:email:${email}`, { max: 3, windowMs: 3_600_000 })).ok || !(await rateLimit(`reset:ip:${meta.ip ?? 'unknown'}`, { max: 10, windowMs: 3_600_000 })).ok) throw new HttpError(429, 'Too many requests. Please try again later.');
  const user = await getDb().user.findUnique({ where: { email } });
  if (!user || user.kind !== 'CUSTOMER' || user.blocked) return;
  await mail('account.reset', email, user.name, await absolute(`/account/reset/${await issueToken('reset', email)}`));
}

export async function resetPassword(raw: string, password: string, meta: Meta): Promise<void> {
  const db = getDb();
  const peek = raw.length >= 20 ? await db.verificationToken.findUnique({ where: { token: sha(raw) } }) : null;
  const email = peek?.identifier.startsWith('reset:') ? peek.identifier.slice(6) : '';
  const problem = passwordProblem(password, email);
  if (problem) throw new HttpError(422, problem, 'password');
  const used = await consumeToken('reset', raw);
  if (!used) throw new HttpError(410, 'This link has expired or was already used. Ask for a new one.', 'token');
  const user = await db.user.findUnique({ where: { email: used } });
  if (!user || user.kind !== 'CUSTOMER' || user.blocked) throw new HttpError(410, 'This link has expired or was already used. Ask for a new one.', 'token');
  await db.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(password), emailVerified: user.emailVerified ?? new Date() } });
  await db.session.deleteMany({ where: { userId: user.id } });
  await claimGuestData(user.id, user.email);
  await mail('account.changed', user.email, user.name, await absolute('/account/login'), await absolute('/account/forgot'));
  await writeAudit({ userId: user.id, action: 'customer.password_reset', entity: 'user', entityId: user.id, ip: meta.ip ?? undefined });
}

export async function requestMagicLink(emailRaw: string, meta: Meta): Promise<void> {
  const email = cleanEmail(emailRaw);
  if (!isEmail(email)) return;
  if (!(await rateLimit(`magic:email:${email}`, { max: 5, windowMs: 3_600_000 })).ok || !(await rateLimit(`magic:ip:${meta.ip ?? 'unknown'}`, { max: 15, windowMs: 3_600_000 })).ok) throw new HttpError(429, 'Too many requests. Please try again later.');
  const user = await getDb().user.findUnique({ where: { email } });
  if (!user || user.kind !== 'CUSTOMER' || user.blocked) return;
  await mail('account.magic', email, user.name, await absolute(`/account/magic/${await issueToken('login', email)}`));
}

/** Signs in with an emailed link. Following it also proves the address is theirs. */
export async function signInWithLink(raw: string, meta: Meta): Promise<boolean> {
  const email = await consumeToken('login', raw);
  if (!email) return false;
  const db = getDb();
  const user = await db.user.findUnique({ where: { email } });
  if (!user || user.kind !== 'CUSTOMER' || user.blocked) return false;
  if (!user.emailVerified) await db.user.update({ where: { id: user.id }, data: { emailVerified: new Date() } });
  await claimGuestData(user.id, user.email);
  await startSession(user.id, meta);
  await writeAudit({ userId: user.id, action: 'customer.signin_link', entity: 'user', entityId: user.id, ip: meta.ip ?? undefined });
  return true;
}

export async function verifyEmail(raw: string): Promise<boolean> {
  const email = await consumeToken('verify', raw);
  if (!email) return false;
  const db = getDb();
  const user = await db.user.findUnique({ where: { email } });
  if (!user || user.kind !== 'CUSTOMER') return false;
  if (!user.emailVerified) await db.user.update({ where: { id: user.id }, data: { emailVerified: new Date() } });
  await claimGuestData(user.id, user.email);
  return true;
}

export async function resendVerification(customer: Customer): Promise<void> {
  if (customer.verified) return;
  if (!(await rateLimit(`verify:${customer.id}`, { max: 3, windowMs: 3_600_000 })).ok) throw new HttpError(429, 'Too many requests. Please try again later.');
  await mail('account.verify', customer.email, customer.name, await absolute(`/account/verify/${await issueToken('verify', customer.email)}`));
}

/** Gives orders and subscriptions placed as a guest with this verified address to the account. */
export async function claimGuestData(userId: string, email: string): Promise<{ orders: number; subscriptions: number }> {
  const db = getDb();
  const [orders, subscriptions] = await Promise.all([db.order.updateMany({ where: { email, userId: null }, data: { userId } }), db.subscription.updateMany({ where: { email, userId: null }, data: { userId } })]);
  return { orders: orders.count, subscriptions: subscriptions.count };
}

// ---------- profile and password ----------

export async function updateProfile(customer: Customer, input: { name: string; phone: string }): Promise<void> {
  const name = input.name.trim().slice(0, 120);
  if (!name) throw new HttpError(422, 'Enter your name.', 'name');
  const phone = input.phone.trim().slice(0, 40);
  if (phone && phone.replace(/\D/g, '').length < 6) throw new HttpError(422, 'Enter a phone number with at least 6 digits, or leave it empty.', 'phone');
  await getDb().user.update({ where: { id: customer.id }, data: { name, phone: phone || null } });
}

export async function changePassword(customer: Customer, current: string, next: string): Promise<void> {
  if (!(await rateLimit(`chpw:${customer.id}`, { max: 5, windowMs: 15 * 60_000 })).ok) throw new HttpError(429, 'Too many attempts. Please wait a few minutes.');
  const db = getDb();
  const user = await db.user.findUnique({ where: { id: customer.id } });
  if (!user?.passwordHash || !(await verifyPassword(user.passwordHash, current))) throw new HttpError(422, 'Your current password is not right.', 'current');
  const problem = passwordProblem(next, user.email);
  if (problem) throw new HttpError(422, problem, 'password');
  await db.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(next) } });
  await db.session.deleteMany({ where: { userId: user.id, sessionToken: { not: customer.sessionToken } } });
  await mail('account.changed', user.email, user.name, await absolute('/account'), await absolute('/account/forgot'));
  await writeAudit({ userId: user.id, action: 'customer.password_change', entity: 'user', entityId: user.id });
}

// ---------- addresses ----------

export async function listAddresses(userId: string) {
  return getDb().address.findMany({ where: { userId }, orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }] });
}

export async function saveAddress(customer: Customer, input: { id?: string; label?: string; isDefault?: boolean; address: unknown }): Promise<void> {
  const checked = checkAddress(input.address);
  if (!checked.ok) throw new HttpError(422, Object.values(checked.errors)[0] as string, Object.keys(checked.errors)[0]);
  const a = checked.address;
  const db = getDb();
  await db.$transaction(async (tx) => {
    const count = await tx.address.count({ where: { userId: customer.id } });
    const mine = input.id ? await tx.address.findFirst({ where: { id: input.id, userId: customer.id } }) : null;
    if (input.id && !mine) throw new HttpError(404, 'This address no longer exists.');
    if (!mine && count >= MAX_ADDRESSES) throw new HttpError(422, `You can save up to ${MAX_ADDRESSES} addresses. Delete one first.`);
    const makeDefault = Boolean(input.isDefault) || (!mine && count === 0);
    if (makeDefault) await tx.address.updateMany({ where: { userId: customer.id }, data: { isDefault: false } });
    const data = { label: input.label?.trim().slice(0, 40) || null, ...a, isDefault: makeDefault || (mine?.isDefault ?? false) };
    if (mine) await tx.address.update({ where: { id: mine.id }, data });
    else await tx.address.create({ data: { userId: customer.id, ...data } });
  });
}

export async function deleteAddress(customer: Customer, id: string): Promise<void> {
  const db = getDb();
  const mine = await db.address.findFirst({ where: { id, userId: customer.id } });
  if (!mine) return;
  await db.address.delete({ where: { id } });
  if (mine.isDefault) {
    const next = await db.address.findFirst({ where: { userId: customer.id }, orderBy: { createdAt: 'asc' } });
    if (next) await db.address.update({ where: { id: next.id }, data: { isDefault: true } });
  }
}

// ---------- wishlist ----------

/** Adds or removes a product. Returns whether it is saved now. */
export async function toggleWishlist(customer: Customer, productId: string): Promise<boolean> {
  const db = getDb();
  const existing = await db.wishlistItem.findUnique({ where: { userId_productId: { userId: customer.id, productId } } });
  if (existing) {
    await db.wishlistItem.delete({ where: { id: existing.id } });
    return false;
  }
  const product = await db.storeProduct.findFirst({ where: { id: productId, status: 'PUBLISHED' }, select: { id: true } });
  if (!product) throw new HttpError(404, 'This product is not available.');
  if ((await db.wishlistItem.count({ where: { userId: customer.id } })) >= 200) throw new HttpError(422, 'Your wishlist is full. Remove something first.');
  try {
    await db.wishlistItem.create({ data: { userId: customer.id, productId } });
  } catch (error) {
    if (!isUnique(error)) throw error;
  }
  return true;
}

// ---------- your data ----------

type OrderRow = Pick<Order, 'number' | 'status' | 'currency' | 'total' | 'createdAt' | 'invoiceNumber'>;

/** Everything held about a customer, as a plain object for download. */
export async function exportCustomerData(customer: Customer) {
  const db = getDb();
  const [user, addresses, wishlist, orders, subscriptions, referral] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { id: customer.id }, select: { email: true, name: true, phone: true, createdAt: true, emailVerified: true, lastLoginAt: true } }),
    db.address.findMany({ where: { userId: customer.id }, select: { label: true, name: true, line1: true, line2: true, city: true, region: true, postal: true, country: true, phone: true, isDefault: true } }),
    db.wishlistItem.findMany({ where: { userId: customer.id }, include: { product: { select: { name: true, slug: true } } } }),
    db.order.findMany({ where: { userId: customer.id }, orderBy: { createdAt: 'desc' }, include: { items: { select: { title: true, quantity: true, unitPrice: true } } } }),
    db.subscription.findMany({ where: { userId: customer.id }, select: { number: true, title: true, status: true, period: true, currentPeriodEnd: true } }),
    db.referralCode.findUnique({ where: { email: customer.email }, select: { code: true } }),
  ]);
  return {
    exportedAt: new Date().toISOString(),
    account: user,
    addresses,
    wishlist: wishlist.map((w) => ({ product: w.product.name, slug: w.product.slug, savedAt: w.createdAt })),
    orders: (orders as (OrderRow & { items: { title: string; quantity: number; unitPrice: number }[] })[]).map((o) => ({ number: o.number, status: o.status, currency: o.currency, total: o.total, invoiceNumber: o.invoiceNumber, placedAt: o.createdAt, items: o.items })),
    subscriptions,
    referralCode: referral?.code ?? null,
  };
}

/**
 * Deletes the account after the password is confirmed. Saved addresses, wishlist and sign-ins go. Orders and
 * subscriptions stay (invoices must be kept) but no longer belong to an account.
 */
export async function deleteCustomerAccount(customer: Customer, password: string): Promise<void> {
  if (!(await rateLimit(`delacct:${customer.id}`, { max: 5, windowMs: 15 * 60_000 })).ok) throw new HttpError(429, 'Too many attempts. Please wait a few minutes.');
  const db = getDb();
  const user = await db.user.findUnique({ where: { id: customer.id } });
  if (!user?.passwordHash || !(await verifyPassword(user.passwordHash, password))) throw new HttpError(422, 'Your password is not right.', 'password');
  await writeAudit({ action: 'customer.delete', entity: 'user', entityId: user.id, diff: { email: user.email } as Prisma.InputJsonValue });
  await db.user.delete({ where: { id: user.id } });
  await signOutCustomer();
}

// ---------- what the account page shows ----------

export async function accountSummary(customer: Customer) {
  const db = getDb();
  const [orders, subs, referral, affiliate, wishlist] = await Promise.all([
    db.order.findMany({ where: { userId: customer.id }, orderBy: { createdAt: 'desc' }, take: 100, include: { items: { select: { id: true, title: true, kind: true, snapshot: true } }, payments: { select: { status: true } } } }),
    db.subscription.findMany({ where: { userId: customer.id }, orderBy: { currentPeriodEnd: 'asc' } }),
    customer.verified ? db.referralCode.findUnique({ where: { email: customer.email } }) : null,
    customer.verified ? db.affiliate.findUnique({ where: { email: customer.email }, select: { token: true, status: true, code: true } }) : null,
    db.wishlistItem.count({ where: { userId: customer.id } }),
  ]);
  return { orders, subs, referral, affiliate, wishlist };
}
