import 'server-only';
import { getDb } from '@/lib/db';
import { getMail } from '@/lib/adapters/mail';
import { getSetting } from '@/lib/settings/store';
import { baseUrl } from '@/lib/url';
import { brandSettings } from '@/lib/theme/brand';
import { siteSettings } from '@/modules/core/settings';
import { paymentSettings } from '@/lib/checkout/settings';
import { emailBrand, renderEmail } from './render';
import { resolvedTemplate } from './overrides';
import type { Placeholder, TemplateId } from './templates';

/** The address owner alerts go to: payments setting, then NOTIFY_EMAIL, then the contact email. */
export async function ownerEmail(): Promise<string> {
  const [payments, site] = await Promise.all([getSetting(paymentSettings), getSetting(siteSettings)]);
  return payments.ownerEmail || process.env.NOTIFY_EMAIL || site.contactEmail || '';
}

/**
 * Sends a template and logs the result against the record it belongs to. Never throws: a mail failure
 * must not undo a payment. Returns true when the provider accepted the message.
 */
export async function sendTemplate(id: TemplateId, to: string, vars: Partial<Record<Placeholder, string>>, ref: { entity: string; entityId: string }): Promise<boolean> {
  let subject = id as string;
  try {
    if (!to) return false;
    const [template, brand, site, payments, base] = await Promise.all([resolvedTemplate(id), getSetting(brandSettings), getSetting(siteSettings), getSetting(paymentSettings), baseUrl()]);
    const rendered = renderEmail(template, vars, emailBrand(brand, site.siteName, base, { address: payments.companyAddress }));
    subject = rendered.subject;
    const result = await getMail().send({ to, subject: rendered.subject, html: rendered.html, text: rendered.text });
    await getDb().emailLog.create({ data: { to, template: id, subject, ok: result.ok, error: result.ok ? null : (result.error ?? null), entity: ref.entity, entityId: ref.entityId } });
    if (!result.ok) console.error(`[mail] ${id} to ${to} failed:`, result.error);
    return result.ok;
  } catch (error) {
    console.error(`[mail] ${id} failed`, error);
    await getDb().emailLog.create({ data: { to, template: id, subject, ok: false, error: error instanceof Error ? error.message : 'Unknown error', entity: ref.entity, entityId: ref.entityId } }).catch(() => undefined);
    return false;
  }
}
