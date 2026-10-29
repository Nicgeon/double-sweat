import type { WidgetPlugin } from './plugins.ts';

/** Im Browser gibt es keine Widgets. */
export class WidgetWeb implements WidgetPlugin {
  async update() {}
  async clear() {}
}
