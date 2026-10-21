'use server';

import { z } from 'zod';
import { requireArea } from '@/lib/auth/guards';
import { HttpError } from '@/lib/http/errors';
import { getSetting } from '@/lib/settings/store';
import { brandSettings } from '@/lib/theme/brand';
import { paymentSettings } from '@/lib/checkout/settings';
import { baseUrl } from '@/lib/url';
import { siteSettings } from '@/modules/core/settings';
import { getMail } from '@/lib/adapters/mail';
import { emailBrand, renderEmail } from './render';
import { resetTemplate, saveTemplate } from './overrides';
import { EMAIL_TEMPLATES, fill, sampleVarsFor, unknownPlaceholders, type TemplateId } from './templates';

type Result = { ok: true; message: string } | { ok: false; message: string };

const id = z.custom<TemplateId>((v) => typeof v === 'string' && v in EMAIL_TEMPLATES, 'Unknown template.');
const text = (n: number) => z.string().max(n);

async function guard() {
  const staff = await requireArea('settings');
  return { id: staff.id, name: staff.name || staff.email, email: staff.email };
}

async function run(fn: () => Promise<string>): Promise<Result> {
  try {
    return { ok: true, message: await fn() };
  } catch (error) {
    if (error instanceof HttpError) return { ok: false, message: error.message };
    if (error instanceof z.ZodError) return { ok: false, message: error.issues[0]?.message ?? 'Some values are not valid.' };
    console.error('[email templates] action failed', error);
    return { ok: false, message: 'Something went wrong on our side and nothing was changed. Try again.' };
  }
}

export async function saveTemplateAction(templateId: string, subject: string, body: string): Promise<Result> {
  return run(async () => {
    const by = await guard();
    await saveTemplate(id.parse(templateId), text(200).parse(subject), text(5000).parse(body), by);
    return 'Saved. This wording is now used whenever the email is sent.';
  });
}

export async function resetTemplateAction(templateId: string): Promise<Result> {
  return run(async () => {
    const by = await guard();
    await resetTemplate(id.parse(templateId), by);
    return 'Reset to the built-in wording.';
  });
}

/**
 * Renders the branded preview of unsaved text, so the editor can show a live preview before anything is saved.
 * Warns about placeholders it does not recognise instead of refusing, since a preview should still show something.
 */
export async function previewTemplateAction(templateId: string, subject: string, body: string): Promise<{ ok: true; html: string; text: string; warnings: string[] } | { ok: false; message: string }> {
  try {
    const tid = id.parse(templateId);
    const [brand, site, pay, base] = await Promise.all([getSetting(brandSettings), getSetting(siteSettings), getSetting(paymentSettings), baseUrl()]);
    const t = { ...EMAIL_TEMPLATES[tid], subject: text(200).parse(subject) || ' ', body: text(5000).parse(body) || ' ' };
    const rendered = renderEmail(t, sampleVarsFor(tid), emailBrand(brand, site.siteName, base, { address: pay.companyAddress }));
    const warnings = unknownPlaceholders(`${t.subject} ${t.body}`).map((p) => `{${p}} is not a placeholder this email knows, so it will show up as typed.`);
    return { ok: true, html: rendered.html, text: rendered.text, warnings };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Could not render a preview.' };
  }
}

/** Sends the (unsaved) text to the signed-in staff member's own address, filled with sample values. */
export async function sendTestEmailAction(templateId: string, subject: string, body: string): Promise<Result> {
  return run(async () => {
    const by = await guard();
    const tid = id.parse(templateId);
    if (!by.email) throw new HttpError(422, 'Your account has no email address to send the test to.');
    const [brand, site, pay, base] = await Promise.all([getSetting(brandSettings), getSetting(siteSettings), getSetting(paymentSettings), baseUrl()]);
    const t = { ...EMAIL_TEMPLATES[tid], subject: text(200).parse(subject), body: text(5000).parse(body) };
    if (!t.subject.trim() || !t.body.trim()) throw new HttpError(422, 'Write a subject and the email text first.');
    const rendered = renderEmail(t, sampleVarsFor(tid), emailBrand(brand, site.siteName, base, { address: pay.companyAddress }));
    const result = await getMail().send({ to: by.email, subject: `[Test] ${fill(t.subject, sampleVarsFor(tid))}`, html: rendered.html, text: rendered.text });
    if (!result.ok) throw new HttpError(502, `The test email could not be sent: ${result.error ?? 'unknown error'}. Check Settings > Email.`);
    return `A test email was sent to ${by.email} with sample values filled in. Nothing was saved.`;
  });
}
