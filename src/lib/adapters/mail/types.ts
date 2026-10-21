export interface MailMessage {
  to: string | string[];
  subject: string;
  html: string;
  text: string;
  from?: string;
  replyTo?: string;
}

export interface MailResult {
  ok: boolean;
  id?: string;
  error?: string;
}

export interface MailAdapter {
  readonly id: string;
  send(message: MailMessage): Promise<MailResult>;
}
