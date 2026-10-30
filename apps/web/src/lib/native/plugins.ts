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
  /** Erklärung unter dem Namen in der Auswahl (z. B. wohin die Nachrichten laufen) */
  hint?: string;
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

/** Firebase Cloud Messaging für Geräte ohne UnifiedPush. Nur im Build mit FCM vorhanden (sonst "nicht verfügbar"). */
export interface FcmPlugin {
  /** Gibt es FCM in diesem Build und die Google Play-Dienste auf dem Gerät? */
  isAvailable(): Promise<{ available: boolean }>;
  /** Holt das Token und erzeugt das Schlüsselpaar für die Ende-zu-Ende-Verschlüsselung (endpoint = FCM-Token). */
  register(): Promise<PushRegistration>;
  unregister(): Promise<void>;
  current(): Promise<{ registration: PushRegistration | null }>;
}

export const Fcm = registerPlugin<FcmPlugin>('Fcm', {
  web: () => import('./fcm.web.ts').then((m) => new m.FcmWeb()),
});

/** Startbildschirm-Widgets (Kotlin). Die Oberfläche schreibt den Stand (JSON), das Widget zeigt ihn an. */
export interface WidgetPlugin {
  update(options: { snapshot: string }): Promise<void>;
  clear(): Promise<void>;
}

export const Widget = registerPlugin<WidgetPlugin>('Widget', {
  web: () => import('./widget.web.ts').then((m) => new m.WidgetWeb()),
});

/** Selfie über die Kamera-App des Geräts mit Wunsch nach der Frontkamera (Capacitor kann die Seite nicht wählen). */
export interface SelfieCameraPlugin {
  take(): Promise<{ webPath: string | null }>;
}

export const SelfieCamera = registerPlugin<SelfieCameraPlugin>('SelfieCamera', {
  web: () => import('./selfie-camera.web.ts').then((m) => new m.SelfieCameraWeb()),
});
