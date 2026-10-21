import { consoleMail } from './console';
import { createResendMail } from './resend';
import { createSmtpMail } from './smtp';
import type { MailAdapter } from './types';

export type { MailAdapter, MailMessage, MailResult } from './types';

/** Picks the mail provider from MAIL_PROVIDER. Falls back to printing emails to the server log. */
export function getMail(): MailAdapter {
  const id = (process.env.MAIL_PROVIDER ?? '').trim();
  if (id === 'resend' && process.env.RESEND_API_KEY) {
    return createResendMail(process.env.RESEND_API_KEY, process.env.MAIL_FROM ?? '');
  }
  if (id === 'smtp' && process.env.SMTP_HOST) {
    return createSmtpMail({ host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT ?? 587), secure: process.env.SMTP_SECURE === 'true', user: process.env.SMTP_USER ?? '', pass: process.env.SMTP_PASS ?? '', defaultFrom: process.env.MAIL_FROM ?? '' });
  }
  return consoleMail;
}
