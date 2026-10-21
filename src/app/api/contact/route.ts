import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/lib/db';
import { getMail } from '@/lib/adapters/mail';
import { rateLimit } from '@/lib/adapters/ratelimit';
import { getSetting } from '@/lib/data';
import { siteSettings } from '@/modules/core/settings';

export const dynamic = 'force-dynamic';

const schema = z.object({
  name: z.string().trim().min(1, 'Enter your name.').max(120),
  email: z.email('Enter a valid email address.').max(254),
  phone: z.string().trim().max(40).optional().default(''),
  message: z.string().trim().min(5, 'Write a short message.').max(5000),
  company: z.string().max(200).optional().default(''),
  source: z.string().max(60).optional().default(''),
});

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

/**
 * Contact form block: honeypot, rate limit, validation, then an email to the owner.
 * The Forms module (Phase 8) adds stored entries, autoresponders and webhooks.
 */
export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const limit = await rateLimit(`contact:${ip}`, { max: 5, windowMs: 10 * 60_000 });
  if (!limit.ok) return NextResponse.json({ ok: false, message: 'Too many messages from this connection. Try again in a few minutes.' }, { status: 429 });

  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    const errors = Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message]));
    return NextResponse.json({ ok: false, message: 'Some fields need attention.', errors }, { status: 422 });
  }
  const data = parsed.data;
  // Bots fill the hidden field. Pretend it worked so they learn nothing.
  if (data.company) return NextResponse.json({ ok: true });

  const site = await getSetting(siteSettings);
  const to = process.env.NOTIFY_EMAIL || site.contactEmail;
  const subject = `New message from ${data.name}`;
  const text = `Name: ${data.name}\nEmail: ${data.email}\nPhone: ${data.phone || '-'}\n\n${data.message}`;
  const result = to
    ? await getMail().send({ to, subject, text, replyTo: data.email, html: `<p><strong>Name:</strong> ${esc(data.name)}<br><strong>Email:</strong> ${esc(data.email)}<br><strong>Phone:</strong> ${esc(data.phone || '-')}</p><p>${esc(data.message).replace(/\n/g, '<br>')}</p>` })
    : { ok: false, error: 'No notify address set (NOTIFY_EMAIL or Site and contact email).' };
  await getDb().emailLog.create({ data: { to: to || '-', template: 'contact.owner', subject, ok: result.ok, error: result.ok ? null : (result.error ?? null), entity: 'contact', entityId: data.source || null } }).catch(() => undefined);

  if (!result.ok) {
    console.error('[contact] owner email failed', result.error);
    return NextResponse.json({ ok: false, message: 'Your message could not be sent right now. Please email us directly.' }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}
