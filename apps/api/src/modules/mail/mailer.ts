import nodemailer from 'nodemailer';
import type { Config } from '../../config.js';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface Mailer {
  readonly enabled: boolean;
  send(message: MailMessage): Promise<void>;
}

export const disabledMailer: Mailer = {
  enabled: false,
  async send() {
    throw new Error('Mailversand ist nicht konfiguriert (SMTP_URL fehlt)');
  },
};

export function createMailer(config: Config): Mailer {
  if (!config.smtp) return disabledMailer;
  const { url, from, requireTls } = config.smtp;
  const parsed = new URL(url);
  const secure = parsed.protocol === 'smtps:';
  const transport = nodemailer.createTransport({
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : secure ? 465 : 587,
    secure,
    requireTLS: requireTls,
    auth: parsed.username
      ? { user: decodeURIComponent(parsed.username), pass: decodeURIComponent(parsed.password) }
      : undefined,
    tls: { minVersion: 'TLSv1.2', rejectUnauthorized: true },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
    disableFileAccess: true,
    disableUrlAccess: true,
  });
  return {
    enabled: true,
    async send(message) {
      await transport.sendMail({
        from,
        to: message.to,
        subject: message.subject,
        text: message.text,
      });
    },
  };
}

/** Mailer für Tests: sammelt Nachrichten im Speicher. */
export interface MemoryMailer extends Mailer {
  sent: MailMessage[];
  failNext: number;
}

export function createMemoryMailer(): MemoryMailer {
  const mailer: MemoryMailer = {
    enabled: true,
    sent: [],
    failNext: 0,
    async send(message) {
      if (mailer.failNext > 0) {
        mailer.failNext--;
        throw new Error('simulierter SMTP-Fehler');
      }
      mailer.sent.push(message);
    },
  };
  return mailer;
}
