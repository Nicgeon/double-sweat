import type { AppContext } from '../../context.js';
import type { MailMessage } from './mailer.js';

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Sendet eine Mail mit Wiederholungen im Hintergrund. Bewusst ohne persistente Warteschlange:
 * Klartext-Links sollen nicht in der Datenbank liegen. Nach einem Neustart fordert man sie neu an.
 * Fehler werden ohne Adresse und ohne Token geloggt.
 */
export function sendMailInBackground(ctx: AppContext, kind: string, message: MailMessage): void {
  if (!ctx.mailer.enabled) return;
  ctx.defer(async () => {
    const delays = ctx.mailRetryDelaysMs;
    for (let attempt = 0; ; attempt++) {
      try {
        await ctx.mailer.send(message);
        return;
      } catch {
        if (attempt >= delays.length) {
          ctx.log.error('mail_send_failed', { mail: kind, attempts: attempt + 1 });
          return;
        }
        await sleep(delays[attempt] ?? 0);
      }
    }
  });
}

export const linkTo = (ctx: AppContext, path: string, token: string) =>
  `${ctx.config.publicOrigin}/${path}/${token}`;
