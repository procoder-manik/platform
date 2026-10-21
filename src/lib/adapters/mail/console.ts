import type { MailAdapter } from './types';

/** Development provider: prints the email to the server log instead of sending it. */
export const consoleMail: MailAdapter = {
  id: 'console',
  async send(message) {
    console.info('[mail:console]', { to: message.to, subject: message.subject, text: message.text.slice(0, 500) });
    return { ok: true, id: `console-${Date.now()}` };
  },
};
