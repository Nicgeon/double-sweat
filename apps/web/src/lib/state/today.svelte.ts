import { api, type Dashboard, unwrap } from '#lib/api/client.ts';

/**
 * Stand von heute (Dashboard), von der Heute-Seite, der schwebenden Check-in-Schaltfläche und dem Abzeichen
 * der Abmachung gemeinsam genutzt. So braucht keine Stelle ihre eigene Abfrage.
 */
class TodayStore {
  dashboard = $state<Dashboard | null>(null);
  /** Der erste Abruf ist durch (auch wenn er scheiterte): erst dann entscheidet sich, ob der Einsatz-Dialog kommt. */
  settled = $state(false);
  private inflight: Promise<void> | null = null;

  /** Holt den Stand; gleichzeitige Aufrufe teilen sich eine Anfrage. */
  load(): Promise<void> {
    this.inflight ??= (async () => {
      try {
        this.dashboard = unwrap(await api.GET('/api/v1/dashboard'));
      } finally {
        this.settled = true;
        this.inflight = null;
      }
    })();
    return this.inflight;
  }

  /** Nach einer Aktion mit frischem Stand ersetzen, ohne erneut zu fragen. */
  set(dashboard: Dashboard): void {
    this.dashboard = dashboard;
  }

  clear(): void {
    this.dashboard = null;
    this.settled = false;
  }

  get me() {
    return this.dashboard?.members.find((m) => m.isMe);
  }

  get partner() {
    return this.dashboard?.members.find((m) => !m.isMe);
  }

  /** Noch ein Check-in heute möglich? Erst wenn der Stand geladen ist. */
  get canCheckin(): boolean {
    const me = this.me;
    return !!this.dashboard && !!me && me.checkinsToday < this.dashboard.maxCheckinsPerDay;
  }

  /** Heute schon eingecheckt (dann ist die Schaltfläche nur noch zweitrangig). */
  get checkedInToday(): boolean {
    return (this.me?.checkinsToday ?? 0) > 0;
  }

  /** Einlösungen, die auf dich warten (Einsatz einlösen, Belohnung erhalten): Abzeichen der Abmachung. */
  get openCount(): number {
    const d = this.dashboard;
    return d ? d.debts.owed + d.rewards.earned : 0;
  }
}

export const todayStore = new TodayStore();
