import { api, unwrap } from '#lib/api/client.ts';

/** Serie des Teams (Wochen in Folge, in denen beide ihr Ziel erreicht haben). */
class StreakStore {
  team = $state(0);

  async load(): Promise<void> {
    try {
      this.team = unwrap(
        await api.GET('/api/v1/history', { params: { query: { limit: 1 } } }),
      ).streaks.team.current;
    } catch {
      /* Anzeige ist nicht kritisch */
    }
  }
}

export const streakStore = new StreakStore();
