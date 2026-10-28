import type { AppContext } from '../context.js';
import { settleDueWeeks } from '../modules/settlement/service.js';

/** Wochenabschluss. Läuft bei jedem Tick und holt verpasste Wochen nach (z. B. nach einem Neustart). */
export function settleWeeksJob(ctx: AppContext): void {
  const settled = settleDueWeeks(ctx);
  if (settled.length === 0) return;
  ctx.log.info('weeks_settled', {
    weeks: settled.length,
    missed: settled.filter((s) => s.met === false).length,
    debts: settled.filter((s) => s.debtId !== null).length,
  });
}
