'use server';

import { headers } from 'next/headers';
import { z } from 'zod';
import { rateLimit } from '@/lib/adapters/ratelimit';
import { HttpError } from '@/lib/http/errors';
import { requireModule } from '@/lib/modules/server';
import { applyAsAffiliate } from './engine';

export type ApplyResult = { ok: true; status: 'pending' | 'active'; message: string } | { ok: false; message: string; errors: Record<string, string> };

const schema = z
  .object({
    name: z.string().trim().min(1, 'Enter your name.').max(120),
    email: z.email('Enter a valid email address.').max(254),
    website: z.string().trim().max(300).optional(),
    payoutDetails: z.string().trim().max(600).optional(),
    agree: z.boolean().optional(),
    company: z.string().max(100).optional(),
  })
  .strict();

/** The public application form. A hidden field catches bots; applications are rate limited by connection. */
export async function applyAffiliateAction(input: unknown): Promise<ApplyResult> {
  try {
    await requireModule('affiliates');
    const data = schema.parse(input);
    if (data.company) return { ok: true, status: 'pending', message: 'Thank you.' };
    const ip = (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
    if (!(await rateLimit(`affiliate:${ip}`, { max: 5, windowMs: 3_600_000 })).ok) throw new HttpError(429, 'Too many applications from this connection. Please try again later.');
    const r = await applyAsAffiliate({ name: data.name, email: data.email, website: data.website, payoutDetails: data.payoutDetails });
    return { ok: true, status: r.status, message: r.status === 'active' ? 'You are in. We emailed you your link and your private dashboard address.' : 'Thank you. We will look at your application and email you when it is approved.' };
  } catch (error) {
    if (error instanceof HttpError) return { ok: false, message: error.message, errors: error.code !== 'error' ? { [error.code]: error.message } : {} };
    if (error instanceof z.ZodError) return { ok: false, message: 'Some fields need attention.', errors: Object.fromEntries(error.issues.map((i) => [String(i.path[0] ?? 'form'), i.message])) };
    console.error('[affiliates] application failed', error);
    return { ok: false, message: 'Something went wrong on our side. Please try again.', errors: {} };
  }
}
