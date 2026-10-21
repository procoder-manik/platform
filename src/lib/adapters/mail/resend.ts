import type { MailAdapter } from './types';

/** Resend over its HTTP API. Needs RESEND_API_KEY and MAIL_FROM on a verified domain. */
export function createResendMail(apiKey: string, defaultFrom: string): MailAdapter {
  return {
    id: 'resend',
    async send(message) {
      try {
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: message.from ?? defaultFrom,
            to: Array.isArray(message.to) ? message.to : [message.to],
            subject: message.subject,
            html: message.html,
            text: message.text,
            reply_to: message.replyTo,
          }),
        });
        const body = (await response.json().catch(() => ({}))) as { id?: string; message?: string };
        if (!response.ok) return { ok: false, error: body.message ?? `Resend answered ${response.status}.` };
        return { ok: true, id: body.id };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : 'Could not reach Resend.' };
      }
    },
  };
}
