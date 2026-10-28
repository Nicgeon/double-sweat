import {
  api,
  type Health,
  setCsrfToken,
  setUnauthorizedHandler,
  type Team,
  type User,
  unwrap,
} from '#lib/api/client.ts';
import { goto } from '$app/navigation';

/** Anmeldezustand der Web-App (Cookie-Sitzung). Das CSRF-Token liegt nur im Speicher. */
class Session {
  ready = $state(false);
  user = $state<User | null>(null);
  team = $state<Team | null>(null);
  health = $state<Health | null>(null);
  mailEnabled = $state(false);
  unread = $state(0);
  unreachable = $state(false);

  /** Server prüfen und, falls eine Sitzung besteht, Profil laden. */
  async init(): Promise<void> {
    try {
      this.health = unwrap(await api.GET('/api/v1/health'));
      this.unreachable = false;
    } catch {
      this.unreachable = true;
    }
    await this.refresh();
    this.ready = true;
  }

  /** Profil und Team neu laden. Liefert false, wenn niemand angemeldet ist. */
  async refresh(): Promise<boolean> {
    try {
      const me = unwrap(await api.GET('/api/v1/me'));
      this.user = me.user;
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
    this.team = result.team ?? null;
    setCsrfToken(result.csrfToken ?? null);
    this.unreachable = false;
  }

  async login(email: string, password: string): Promise<void> {
    this.adopt(unwrap(await api.POST('/api/v1/auth/login', { body: { email, password } })));
  }

  async logout(): Promise<void> {
    try {
      await api.POST('/api/v1/auth/logout');
    } finally {
      this.clear();
    }
  }

  clear(): void {
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
