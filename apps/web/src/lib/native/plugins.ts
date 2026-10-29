import { registerPlugin } from '@capacitor/core';

/** Verschlüsselter Schlüssel-Wert-Speicher (Android Keystore). Im Browser (nur Tests) localStorage. */
export interface SecureStorePlugin {
  get(options: { key: string }): Promise<{ value: string | null }>;
  set(options: { key: string; value: string }): Promise<void>;
  remove(options: { key: string }): Promise<void>;
}

export const SecureStore = registerPlugin<SecureStorePlugin>('SecureStore', {
  web: () => import('./secure-store.web.ts').then((m) => new m.SecureStoreWeb()),
});

export interface PushDistributor {
  id: string;
  label: string;
}

export interface PushRegistration {
  /** Adresse, an die der Server Nachrichten schickt (Endpunkt des Verteilers) */
  endpoint: string;
  /** Schlüssel für die Verschlüsselung nach RFC 8291 (Base64url); fehlen, wenn der Verteiler keine liefert */
  p256dh?: string;
  auth?: string;
}

/** UnifiedPush-Anbindung (Kotlin, Connector 3.x). Im Browser nicht verfügbar. */
export interface UnifiedPushPlugin {
  getDistributors(): Promise<{ distributors: PushDistributor[]; current: string | null }>;
  /** Registriert bei einem Verteiler; die Antwort kommt als Endpunkt. */
  register(options: { distributor?: string }): Promise<PushRegistration>;
  unregister(): Promise<void>;
  /** Zuletzt vom Verteiler gemeldeter Endpunkt, falls registriert */
  current(): Promise<{ registration: PushRegistration | null }>;
  /** Fragt die Erlaubnis für Benachrichtigungen ab (Android 13+) */
  requestNotificationPermission(): Promise<{ granted: boolean }>;
}

export const UnifiedPush = registerPlugin<UnifiedPushPlugin>('UnifiedPush', {
  web: () => import('./unified-push.web.ts').then((m) => new m.UnifiedPushWeb()),
});

/** Kennzeichen des Builds (Debug oder Release), aus BuildConfig. */
export interface BuildInfoPlugin {
  info(): Promise<{ debug: boolean; version: string }>;
}
export const BuildInfo = registerPlugin<BuildInfoPlugin>('BuildInfo', {
  web: () => import('./build-info.web.ts').then((m) => new m.BuildInfoWeb()),
});
