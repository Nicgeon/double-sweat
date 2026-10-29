/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "native": Build für die Android-App (Server-Adresse, Bearer-Tokens); sonst die Web-App */
  readonly VITE_TARGET?: string;
  /** Nur für Entwicklung und Tests: auch http://-Serveradressen zulassen */
  readonly VITE_ALLOW_HTTP?: string;
}
