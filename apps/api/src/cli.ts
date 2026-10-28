import { eq } from 'drizzle-orm';
import { ConfigError, loadConfig } from './config.js';
import { createContext } from './context.js';
import { backupDatabase, openDatabase } from './db/client.js';
import { users } from './db/schema.js';
import { normalizeEmail } from './modules/auth/service.js';
import { createEmailToken } from './modules/mail/tokens.js';
import { createTeamInvite, createTeamTx } from './modules/teams/service.js';

const USAGE = `Double Sweat CLI

Verwendung: cli <Befehl> [Argumente]

  reset-password <email>   Einmal-Link zum Zurücksetzen des Passworts ausgeben (30 Minuten gültig)
  create-team [name]       Leeres Team anlegen und eine Einladung ausgeben (umgeht SIGNUP_MODE)
  create-invite <teamId>   Neue Einladung für ein Team mit freiem Platz ausgeben
  mail-test <adresse>      Testmail über SMTP_URL senden
  backup <zieldatei>       Konsistente Kopie der Datenbank erstellen (Fotos separat sichern)
`;

// Geheimnisse (Links, Codes) gehen auf stdout, Hinweise auf stderr. So bleibt die Ausgabe skriptbar.
const out = (line: string) => process.stdout.write(`${line}\n`);
const info = (line: string) => process.stderr.write(`${line}\n`);

async function run(argv: string[]): Promise<number> {
  const [command, ...args] = argv;
  if (!command || command === 'help' || command === '--help') {
    info(USAGE);
    return command ? 0 : 1;
  }

  const config = loadConfig();
  const db = openDatabase(config.dbPath);
  const ctx = createContext({ config, db });
  try {
    switch (command) {
      case 'reset-password': {
        const email = args[0];
        if (!email) throw new Error('E-Mail-Adresse fehlt');
        const user = db
          .select()
          .from(users)
          .where(eq(users.email, normalizeEmail(email)))
          .get();
        if (!user) throw new Error('Kein Konto mit dieser Adresse');
        const token = createEmailToken(db, ctx.clock.now(), user.id, 'reset');
        info('Reset-Link (30 Minuten gültig, nur einmal verwendbar):');
        out(`${config.publicOrigin}/reset/${token}`);
        return 0;
      }
      case 'create-team': {
        const now = ctx.clock.now();
        const team = db.transaction((tx) => createTeamTx(tx, args[0] ?? 'Unser Team', now), {
          behavior: 'immediate',
        });
        const invite = createTeamInvite(ctx, team.id, null);
        info(`Team ${team.id} angelegt. Einladung (7 Tage gültig, einmal verwendbar):`);
        out(invite.joinUrl);
        return 0;
      }
      case 'create-invite': {
        const teamId = args[0];
        if (!teamId) throw new Error('Team-ID fehlt');
        const invite = createTeamInvite(ctx, teamId, null);
        info('Einladung (7 Tage gültig, einmal verwendbar):');
        out(invite.joinUrl);
        return 0;
      }
      case 'mail-test': {
        const to = args[0];
        if (!to) throw new Error('Empfängeradresse fehlt');
        if (!ctx.mailer.enabled) throw new Error('SMTP_URL ist nicht gesetzt');
        await ctx.mailer.send({
          to,
          subject: 'Double Sweat: Testmail',
          text: 'Der Mailversand funktioniert.',
        });
        info('Testmail gesendet.');
        return 0;
      }
      case 'backup': {
        const target = args[0];
        if (!target) throw new Error('Zieldatei fehlt');
        backupDatabase(db, target);
        info(`Datenbank-Backup geschrieben: ${target}`);
        return 0;
      }
      default:
        info(`Unbekannter Befehl: ${command}\n\n${USAGE}`);
        return 1;
    }
  } finally {
    db.$client.close();
  }
}

run(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (error) => {
    info(
      error instanceof ConfigError || error instanceof Error
        ? `Fehler: ${error.message}`
        : 'Unbekannter Fehler',
    );
    process.exit(1);
  },
);
