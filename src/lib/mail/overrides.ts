import 'server-only';
import { cache } from 'react';
import { getDb } from '@/lib/db';
import { HttpError } from '@/lib/http/errors';
import { writeAudit } from '@/lib/audit';
import { EMAIL_TEMPLATES, unknownPlaceholders, type EmailTemplate, type TemplateId } from './templates';

/** All saved overrides, one read per request. */
const allOverrides = cache(() => getDb().emailTemplateOverride.findMany());

/** The subject and body actually used for a template: the saved override, or the code default. */
export async function resolvedTemplate(id: TemplateId): Promise<EmailTemplate> {
  const base = EMAIL_TEMPLATES[id];
  const row = (await allOverrides()).find((o) => o.templateId === id);
  return row ? { ...base, subject: row.subject, body: row.body } : base;
}

export interface TemplateView {
  id: TemplateId;
  group: string;
  subject: string;
  body: string;
  cta?: string;
  to: 'customer' | 'owner';
  customised: boolean;
  defaultSubject: string;
  defaultBody: string;
}

const MAX_SUBJECT = 200;
const MAX_BODY = 5000;

function checkText(subject: string, body: string): void {
  const s = subject.trim();
  const b = body.trim();
  if (!s) throw new HttpError(422, 'Write a subject.', 'subject');
  if (s.length > MAX_SUBJECT) throw new HttpError(422, `Keep the subject to ${MAX_SUBJECT} characters or fewer.`, 'subject');
  if (!b) throw new HttpError(422, 'Write the email text.', 'body');
  if (b.length > MAX_BODY) throw new HttpError(422, `Keep the email to ${MAX_BODY} characters or fewer.`, 'body');
  const unknown = unknownPlaceholders(`${s} ${b}`);
  if (unknown.length) throw new HttpError(422, `${unknown.length === 1 ? 'This placeholder is' : 'These placeholders are'} not recognised: ${unknown.map((p) => `{${p}}`).join(', ')}. Only use the placeholders listed below the editor.`, 'body');
}

/** Saves a custom subject and body for a template. Placeholders outside the known list are refused. */
export async function saveTemplate(id: TemplateId, subject: string, body: string, by: { id: string; name: string }): Promise<void> {
  if (!(id in EMAIL_TEMPLATES)) throw new HttpError(404, 'This email template does not exist.');
  checkText(subject, body);
  await getDb().emailTemplateOverride.upsert({ where: { templateId: id }, create: { templateId: id, subject: subject.trim(), body: body.trim(), updatedBy: by.name }, update: { subject: subject.trim(), body: body.trim(), updatedBy: by.name } });
  await writeAudit({ userId: by.id, action: 'email_template.save', entity: 'email_template', entityId: id });
}

/** Removes a saved override so the template goes back to the code default. */
export async function resetTemplate(id: TemplateId, by: { id: string; name: string }): Promise<void> {
  await getDb().emailTemplateOverride.deleteMany({ where: { templateId: id } });
  await writeAudit({ userId: by.id, action: 'email_template.reset', entity: 'email_template', entityId: id });
}
