/**
 * Offene Fenster (Sheets), das oberste zuletzt. Der Zurück-Knopf der Android-App schließt zuerst das oberste Fenster,
 * bevor er eine Seite zurückgeht.
 */
const stack: Array<() => void> = [];

/** Meldet ein offenes Fenster an; die Rückgabe meldet es wieder ab. */
export function registerOverlay(close: () => void): () => void {
  stack.push(close);
  return () => {
    const i = stack.lastIndexOf(close);
    if (i >= 0) stack.splice(i, 1);
  };
}

/** Schließt das oberste Fenster. `false`, wenn keines offen ist. */
export function closeTopOverlay(): boolean {
  const close = stack.at(-1);
  if (!close) return false;
  close();
  return true;
}
