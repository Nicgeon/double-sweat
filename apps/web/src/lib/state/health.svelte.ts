import { NATIVE } from '#lib/native/flag.ts';
import { type HealthAvailability, HealthConnect, type HealthSession } from '#lib/native/plugins.ts';

const PREF = 'ds_health';
const USED = 'ds_health_used';
/** So viele bereits übernommene Einträge merkt sich das Gerät (ältere liegen ohnehin außerhalb der 24 Stunden). */
const USED_MAX = 50;

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* nicht kritisch */
  }
}

/** Gelesen werden nur Trainings, und nur, wenn man es eingeschaltet und Health Connect es erlaubt hat. */
class HealthStore {
  /** Die Wahl in der App ("Trainings als Vorschlag"), unabhängig von der Erlaubnis in Health Connect. */
  enabled = $state(read(PREF) === '1');
  availability = $state<HealthAvailability | null>(null);
  granted = $state(false);
  /** Alle gefundenen Trainings der letzten 24 Stunden (auch schon übernommene). */
  sessions = $state<HealthSession[]>([]);
  loaded = $state(false);
  failed = $state(false);
  private used = $state<string[]>(readUsed());

  /** Vorschläge sind aktiv: in der App, eingeschaltet und erlaubt. */
  get active(): boolean {
    return NATIVE && this.enabled && this.granted;
  }

  /** Noch nicht übernommene Trainings, das jüngste zuerst. */
  get suggestions(): HealthSession[] {
    return this.active ? this.sessions.filter((s) => !this.used.includes(s.id)) : [];
  }

  /** Fragt Verfügbarkeit und Erlaubnis ab und lädt, wenn aktiv, die Trainings. */
  async refresh(): Promise<void> {
    if (!NATIVE) return;
    this.failed = false;
    try {
      const status = await HealthConnect.status();
      this.availability = status.availability;
      this.granted = status.granted;
      if (this.enabled && status.availability === 'available' && status.granted) {
        const res = await HealthConnect.recentSessions();
        this.granted = res.granted;
        this.sessions = res.sessions;
      } else {
        this.sessions = [];
      }
    } catch {
      this.failed = true;
      this.sessions = [];
    } finally {
      this.loaded = true;
    }
  }

  /** Einschalten: fragt die Erlaubnis bei Health Connect ab. Gibt zurück, ob es nun an ist. */
  async enable(): Promise<boolean> {
    if (!NATIVE) return false;
    try {
      const status = await HealthConnect.status();
      this.availability = status.availability;
      if (status.availability !== 'available') return false;
      const granted = status.granted || (await HealthConnect.requestPermission()).granted;
      this.granted = granted;
      this.enabled = granted;
      write(PREF, granted ? '1' : null);
      await this.refresh();
      return granted;
    } catch {
      this.failed = true;
      return false;
    }
  }

  /** Ausschalten: es wird nichts mehr gelesen. Die Erlaubnis bleibt in Health Connect, bis man sie dort entzieht. */
  disable(): void {
    this.enabled = false;
    this.sessions = [];
    write(PREF, null);
  }

  /** Ein Training wurde mit einem Check-in übernommen und wird nicht noch einmal vorgeschlagen. */
  markUsed(id: string): void {
    this.used = [id, ...this.used.filter((x) => x !== id)].slice(0, USED_MAX);
    write(USED, JSON.stringify(this.used));
  }
}

function readUsed(): string[] {
  try {
    const parsed = JSON.parse(read(USED) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export const healthStore = new HealthStore();
