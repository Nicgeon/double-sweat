import type { User } from '../db/schema.js';

export type AuthContext =
  | { kind: 'cookie'; user: User; sessionId: string; csrfToken: string }
  | { kind: 'bearer'; user: User; familyId: string };

export type AppEnv = {
  Variables: {
    auth: AuthContext | null;
  };
};
