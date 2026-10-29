import type { BuildInfoPlugin } from './plugins.ts';

export class BuildInfoWeb implements BuildInfoPlugin {
  async info() {
    return { debug: true, version: 'web' };
  }
}
