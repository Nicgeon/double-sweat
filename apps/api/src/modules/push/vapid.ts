import { eq } from 'drizzle-orm';
import webpush from 'web-push';
import type { AppContext } from '../../context.js';
import { instanceSecrets } from '../../db/schema.js';

export interface VapidKeys {
  publicKey: string;
  privateKey: string;
}

/**
 * VAPID-Schlüssel dieser Instanz. Sie werden beim ersten Bedarf erzeugt und in der Datenbank abgelegt
 * (Datei mit Rechten 0600). Der private Schlüssel verlässt den Server nie.
 */
export function getVapidKeys(ctx: AppContext): VapidKeys {
  const read = () => {
    const rows = ctx.db.select().from(instanceSecrets).all();
    const publicKey = rows.find((r) => r.name === 'vapid_public')?.value;
    const privateKey = rows.find((r) => r.name === 'vapid_private')?.value;
    return publicKey && privateKey ? { publicKey, privateKey } : null;
  };
  const existing = read();
  if (existing) return existing;
  const fresh = webpush.generateVAPIDKeys();
  ctx.db.transaction(
    (tx) => {
      tx.insert(instanceSecrets)
        .values({ name: 'vapid_public', value: fresh.publicKey })
        .onConflictDoNothing()
        .run();
      tx.insert(instanceSecrets)
        .values({ name: 'vapid_private', value: fresh.privateKey })
        .onConflictDoNothing()
        .run();
    },
    { behavior: 'immediate' },
  );
  return read() ?? fresh;
}

export const deleteVapidKeys = (ctx: AppContext) =>
  ctx.db.delete(instanceSecrets).where(eq(instanceSecrets.name, 'vapid_private')).run();
