import type { MailAdapter } from './types';

/**
 * Plain SMTP, for providers without a dedicated adapter (a hosting provider's mail server, a business Gmail
 * account via an app password, Mailgun, SES's SMTP endpoint). Needs SMTP_HOST and SMTP_PORT; SMTP_USER and
 * SMTP_PASS when the server needs a login; SMTP_SECURE=true for implicit TLS (normally port 465).
 */
export function createSmtpMail(config: { host: string; port: number; secure: boolean; user: string; pass: string; defaultFrom: string }): MailAdapter {
  return {
    id: 'smtp',
    async send(message) {
      try {
        const nodemailer = await import('nodemailer');
        const transport = nodemailer.createTransport({ host: config.host, port: config.port, secure: config.secure, auth: config.user ? { user: config.user, pass: config.pass } : undefined });
        const info = await transport.sendMail({ from: message.from ?? config.defaultFrom, to: message.to, subject: message.subject, html: message.html, text: message.text, replyTo: message.replyTo });
        return { ok: true, id: info.messageId };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : 'Could not reach the SMTP server.' };
      }
    },
  };
}
