import {
  api,
  type Health,
  type PartnerColor,
  setCsrfToken,
  setUnauthorizedHandler,
  type Team,
  type User,
  unwrap,
} from '#lib/api/client.ts';
import { i18n } from '#lib/i18n/index.svelte.ts';
import {
  clearAll,
  clearTokens,
  currentAuth,
  loadAuth,
  setServer,
  setTokens,
} from '#lib/native/auth-store.ts';
import { NATIVE } from '#lib/native/flag.ts';
import { type Compatibility, compatibility, type ServerInfo } from '#lib/native/server-url.ts';
import { disablePush } from '#lib/util/push.ts';
import { clearWidget } from '#lib/util/widget.ts';
import { goto } from '$app/navigation';
import { todayStore } from './today.svelte.ts';

/** Anmeldezustand der Web-App (Cookie-Sitzung). Das CSRF-Token liegt nur im Speicher. */
class Session {
  ready = $state(false);
  user = $state<User | null>(null);
  team = $state<Team | null>(null);
  health = $state<Health | null>(null);
  mailEnabled = $state(false);
  unread = $state(0);
  unreachable = $state(false);
  /** App und Server passen nicht zusammen (andere API-Version): dann läuft nichts verlässlich, die App sagt es offen. */
  versionProblem = $state<Compatibility>(null);
  /** App: gespeicherte Serveradresse (null = noch keine eingerichtet) */
  serverUrl = $state<string | null>(null);

  /** Server prüfen und, falls eine Sitzung besteht, Profil laden. */
  async init(): Promise<void> {
    if (NATIVE) {
      this.serverUrl = (await loadAuth()).server;
      if (!this.serverUrl) {
        this.ready = true;
        return;
      }
    }
    try {
      this.health = unwrap(await api.GET('/api/v1/health'));
      this.versionProblem = compatibility(this.health);
      i18n.useServerDefault(this.health.defaultLocale);
      this.unreachable = false;
    } catch {
      this.unreachable = true;
    }
    await this.refresh();
    this.ready = true;
  }

  /** Profil und Team neu laden. Liefert false, wenn niemand angemeldet ist. */
  async refresh(): Promise<boolean> {
    if (NATIVE) {
      const { access, refresh } = currentAuth();
      if (!access && !refresh) {
        this.user = null;
        this.team = null;
        return false;
      }
    }
    try {
      const me = unwrap(await api.GET('/api/v1/me'));
      this.user = me.user;
      i18n.set(me.user.locale);
      this.team = me.team ?? null;
      this.mailEnabled = me.features.mail;
      setCsrfToken(me.csrfToken ?? null);
      return true;
    } catch (e) {
      this.user = null;
      this.team = null;
      setCsrfToken(null);
      if ((e as { status?: number }).status === 0) this.unreachable = true;
      return false;
    }
  }

  adopt(result: { user: User; team?: Team | null; csrfToken?: string }): void {
    this.user = result.user;
    i18n.set(result.user.locale);
    this.team = result.team ?? null;
    setCsrfToken(result.csrfToken ?? null);
    this.unreachable = false;
  }

  /** Übernimmt das Ergebnis von Anmeldung oder Registrierung (App: inklusive Tokens). */
  private async adoptAuth(result: {
    user: User;
    team?: Team | null;
    csrfToken?: string;
    tokens?: {
      accessToken: string;
      refreshToken: string;
      expiresIn: number;
      refreshExpiresAt: number;
    };
  }): Promise<void> {
    if (NATIVE && result.tokens) await setTokens(result.tokens);
    this.adopt(result);
  }

  async login(email: string, password: string): Promise<void> {
    if (NATIVE) {
      await this.adoptAuth(
        unwrap(
          await api.POST('/api/v1/auth/token', {
            body: { email, password, deviceLabel: 'Android-App' },
          }),
        ),
      );
      return;
    }
    this.adopt(unwrap(await api.POST('/api/v1/auth/login', { body: { email, password } })));
  }

  async register(input: {
    email: string;
    password: string;
    displayName: string;
    timezone: string;
    color: PartnerColor;
    inviteCode?: string;
    teamName?: string;
    setupToken?: string;
  }): Promise<void> {
    const withLocale = { ...input, locale: i18n.current };
    const body = NATIVE
      ? { ...withLocale, client: 'app' as const, deviceLabel: 'Android-App' }
      : withLocale;
    await this.adoptAuth(unwrap(await api.POST('/api/v1/auth/register', { body })));
  }

  async logout(): Promise<void> {
    // App: Dieses Gerät soll nach dem Abmelden keine Nachrichten dieses Kontos mehr bekommen
    if (NATIVE) await disablePush().catch(() => {});
    try {
      await api.POST('/api/v1/auth/logout');
    } finally {
      if (NATIVE) await clearTokens();
      this.clear();
    }
  }

  /** App: Server einrichten (nach erfolgreicher Prüfung der Adresse). */
  async useServer(origin: string, info: ServerInfo): Promise<void> {
    await setServer(origin);
    this.serverUrl = origin;
    this.health = { app: 'double-sweat', ...info } as Health;
    this.clear();
  }

  /** App: Server wechseln. Meldet am bisherigen Server ab (soweit erreichbar) und vergisst alles. */
  async forgetServer(): Promise<void> {
    try {
      await api.POST('/api/v1/auth/logout');
    } catch {
      /* Server nicht erreichbar: Tokens verfallen von selbst */
    }
    await clearAll();
    this.serverUrl = null;
    this.health = null;
    this.clear();
  }

  clear(): void {
    void clearWidget();
    todayStore.clear();
    this.user = null;
    this.team = null;
    this.unread = 0;
    setCsrfToken(null);
  }

  async refreshUnread(): Promise<void> {
    try {
      const res = unwrap(
        await api.GET('/api/v1/notifications', { params: { query: { unread: 'true', limit: 1 } } }),
      );
      this.unread = res.unreadCount;
    } catch {
      /* Anzeige ist nicht kritisch */
    }
  }

  get partner() {
    return this.team?.members.find((m) => !m.isMe) ?? null;
  }
  get me() {
    return this.team?.members.find((m) => m.isMe) ?? null;
  }
}

export const session = new Session();

// Abgelaufene Sitzung: zurück zur Anmeldung
setUnauthorizedHandler(() => {
  if (session.user) {
    session.clear();
    void goto('/login?expired=1');
  }
});
