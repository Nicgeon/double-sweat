/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "native": Build für die Android-App (Server-Adresse, Bearer-Tokens); sonst die Web-App */
  readonly VITE_TARGET?: string;
  /** Nur für Entwicklung und Tests: auch http://-Serveradressen zulassen */
  readonly VITE_ALLOW_HTTP?: string;
  /** App: Serveradresse, auf die diese App-Version eingestellt ist (kommt aus DS_SERVER_URL, siehe scripts/android-build.sh) */
  readonly VITE_DEFAULT_SERVER?: string;
  /** App: "true" = die Serveradresse steht fest und lässt sich nicht ändern (kommt aus DS_SERVER_LOCK) */
  readonly VITE_SERVER_LOCKED?: string;
}
