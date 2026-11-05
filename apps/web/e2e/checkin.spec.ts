import { expect, type Page, test } from '@playwright/test';
import { loginViaUi, makeCouple, newUserContext } from './helpers';

/** Fotografiert mit der Fake-Kamera (die Zeit im Bild ändert sich sekündlich, doppelte Fotos lehnt der Server ab). */
async function shoot(page: Page) {
  await expect(page.getByTestId('camera')).toBeVisible();
  await page.waitForTimeout(1100);
  await page.getByRole('button', { name: 'Foto aufnehmen' }).click();
  await expect(page.getByRole('img', { name: 'Dein Foto' })).toBeVisible();
}

test('Messbares Ziel: von „Heute“ in drei Tipps eingecheckt, ohne Ladeseite und ohne Scrollen', async ({
  browser,
}, testInfo) => {
  const { annaEmail } = await makeCouple();
  const { page, problems } = await newUserContext(browser, testInfo);
  await loginViaUi(page, annaEmail);
  await expect(page.getByRole('heading', { name: 'Heute', level: 1 })).toBeVisible();

  // Tipp 1: „Einchecken“ auf Heute. Die Kamera ist sofort da, ohne „Lädt …“ dazwischen.
  await page.getByRole('link', { name: 'Einchecken' }).first().click();
  await expect(page.getByTestId('camera')).toBeVisible();
  await expect(page.getByText('Lädt')).toHaveCount(0);

  // Tipp 2: Auslöser
  await page.waitForTimeout(1100);
  await page.getByRole('button', { name: 'Foto aufnehmen' }).click();
  await expect(page.getByRole('img', { name: 'Dein Foto' })).toBeVisible();

  // Die Vorschau passt auf den Schirm: „Einchecken“ liegt ganz im sichtbaren Bereich, ohne Scrollen
  const submit = page.getByRole('button', { name: 'Einchecken' });
  await expect(submit).toBeInViewport({ ratio: 1 });
  const size = page.viewportSize();
  const box = await submit.boundingBox();
  expect(size).not.toBeNull();
  expect(box).not.toBeNull();
  expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(size?.height ?? 0);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  // Der Vorgang hat keine Tab-Leiste, die Aktion liegt unten (Auf dem Desktop bleibt die Seitenleiste)
  if ((size?.width ?? 0) < 1024) await expect(page.getByRole('navigation')).toHaveCount(0);

  // Tipp 3: Einchecken
  await submit.click();
  await expect(page.getByRole('heading', { name: 'Eingecheckt.' })).toBeVisible();
  expect(problems).toEqual([]);
});

test('Vorschau: Training vorbelegt mit der letzten Wahl, Notiz eingeklappt, Hinweis in der Aktionsleiste', async ({
  browser,
}, testInfo) => {
  const { annaEmail } = await makeCouple();
  const { page, problems } = await newUserContext(browser, testInfo);
  await loginViaUi(page, annaEmail);
  await page.goto('/checkin');
  await shoot(page);

  // Beim ersten Mal ist nichts gewählt; der Hinweis nennt den Partner
  await expect(page.getByRole('radio', { checked: true })).toHaveCount(0);
  await expect(page.getByText('Ben sieht dein Foto sofort.')).toBeVisible();
  // Die Notiz ist eingeklappt, bis man sie braucht (und danach im Fokus)
  await expect(page.getByLabel('Notiz (optional)')).toHaveCount(0);
  await page.getByRole('button', { name: /Notiz hinzufügen/ }).click();
  await expect(page.getByLabel('Notiz (optional)')).toBeFocused();

  await page.getByRole('radio', { name: 'Schwimmen' }).click();
  await expect(page.getByRole('radio', { name: 'Schwimmen' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await page.getByRole('button', { name: 'Einchecken' }).click();
  await expect(page.getByRole('heading', { name: 'Eingecheckt.' })).toBeVisible();

  // Der nächste Check-in startet mit „Schwimmen“; die zweite Aufnahme am Tag erklärt, dass der Tag nur einmal zählt
  await page.getByRole('button', { name: 'Noch ein Check-in' }).click();
  await shoot(page);
  await expect(page.getByRole('radio', { name: 'Schwimmen' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect(page.getByText('Für das Wochenziel zählt der Tag nur einmal.')).toBeVisible();
  await expect(page.getByLabel('Notiz (optional)')).toHaveCount(0);
  // Auch nach dem Neuladen bleibt die Wahl erhalten (gemerkt im Gerät)
  await page.reload();
  await shoot(page);
  await expect(page.getByRole('radio', { name: 'Schwimmen' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  expect(problems).toEqual([]);
});

/** Den Check-in verlassen: mobil mit dem Pfeil der Kopfzeile, am Desktop über die Seitenleiste (dort gibt es keinen Pfeil). */
async function leave(page: Page, back: string, home: string) {
  if ((page.viewportSize()?.width ?? 0) >= 1024) {
    await page.getByRole('navigation').getByRole('link', { name: home }).click();
  } else {
    await page.getByRole('link', { name: back }).first().click();
  }
}

test('Verwerfen: mit Foto fragt „Zurück“ nach, ohne Foto schließt die Kamera sofort', async ({
  browser,
}, testInfo) => {
  const { annaEmail } = await makeCouple();
  const { page, problems } = await newUserContext(browser, testInfo);
  await loginViaUi(page, annaEmail);
  await expect(page.getByRole('heading', { name: 'Heute', level: 1 })).toBeVisible();

  // Ohne Foto: Schließen geht ohne Nachfrage
  await page.getByRole('link', { name: 'Einchecken' }).first().click();
  await expect(page.getByTestId('camera')).toBeVisible();
  await page.getByRole('button', { name: 'Schließen' }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('dialog')).toHaveCount(0);

  // Mit Foto: Zurück fragt nach; „Weiter bearbeiten“ bleibt in der Vorschau
  await page.getByRole('link', { name: 'Einchecken' }).first().click();
  await shoot(page);
  await leave(page, 'Zurück', 'Heute');
  const dialog = page.getByRole('dialog', { name: 'Foto verwerfen?' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Weiter bearbeiten' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page).toHaveURL(/\/checkin$/);
  await expect(page.getByRole('img', { name: 'Dein Foto' })).toBeVisible();

  // Der Zurück-Knopf des Browsers (und von Android) wird genauso abgefangen
  await page.goBack();
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Weiter bearbeiten' }).click();

  // „Verwerfen“ verlässt die Seite, es entsteht kein Check-in
  await leave(page, 'Zurück', 'Heute');
  await dialog.getByRole('button', { name: 'Verwerfen' }).click();
  await expect(page).toHaveURL(/\/$/);
  const checkins = await page.evaluate(async () => (await fetch('/api/v1/checkins')).json());
  expect(checkins.checkins).toHaveLength(0);
  expect(problems).toEqual([]);
});

test('Nach dem Einchecken: „Fertig“ ist der Hauptknopf, „Noch ein Check-in“ nur ein Textknopf', async ({
  browser,
}, testInfo) => {
  const { annaEmail } = await makeCouple();
  const { page, problems } = await newUserContext(browser, testInfo);
  await loginViaUi(page, annaEmail);
  await page.goto('/checkin');
  await shoot(page);
  await page.getByRole('radio', { name: 'Yoga' }).click();
  await page.getByRole('button', { name: 'Einchecken' }).click();
  await expect(page.getByRole('heading', { name: 'Eingecheckt.' })).toBeVisible();
  // Nach dem Senden fragt nichts mehr nach, auch wenn das Foto noch im Speicher liegt
  await expect(page.getByRole('link', { name: 'Fertig' })).toHaveClass(/ds-btn--primary/);
  await expect(page.getByRole('button', { name: 'Noch ein Check-in' })).toHaveClass(
    /ds-btn--ghost/,
  );
  await page.getByRole('link', { name: 'Fertig' }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(problems).toEqual([]);
});

test('Tageslimit: statt der Kamera erklärt die Seite, dass es für heute reicht', async ({
  browser,
}, testInfo) => {
  const { annaEmail } = await makeCouple();
  const { page, problems } = await newUserContext(browser, testInfo);
  // Der Server meldet für Anna das Limit erreicht (fünf Fotos in der Oberfläche aufzunehmen wäre unnötig langsam)
  await page.route('**/api/v1/dashboard', async (route) => {
    const res = await route.fetch();
    const body = await res.json();
    for (const m of body.members) if (m.isMe) m.checkinsToday = body.maxCheckinsPerDay;
    await route.fulfill({ response: res, json: body });
  });
  await loginViaUi(page, annaEmail);
  await page.goto('/checkin');
  await expect(page.getByText('Für heute reicht es')).toBeVisible();
  await expect(page.getByTestId('camera')).toHaveCount(0);
  await page.getByRole('link', { name: 'Zur Übersicht' }).click();
  await expect(page).toHaveURL(/\/$/);
  expect(problems).toEqual([]);
});

test('Englisch: Vorschau, Hinweis und Rückfrage sind übersetzt', async ({ browser }, testInfo) => {
  const { anna, annaEmail } = await makeCouple();
  await anna.call('patch', '/me', { locale: 'en' });
  const { page, problems } = await newUserContext(browser, testInfo, undefined, 'en-US');
  await loginViaUi(page, annaEmail);
  await page.goto('/checkin');
  await expect(page.getByTestId('camera')).toBeVisible();
  await page.waitForTimeout(1100);
  await page.getByRole('button', { name: 'Take photo' }).click();
  await expect(page.getByRole('img', { name: 'Your photo' })).toBeVisible();
  await expect(page.getByText('Ben sees your photo right away.')).toBeVisible();
  await expect(page.getByRole('button', { name: /Add a note/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'New photo' })).toBeVisible();
  await leave(page, 'Back', 'Today');
  const dialog = page.getByRole('dialog', { name: 'Discard photo?' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Keep editing' }).click();
  await page.getByRole('button', { name: 'Check in' }).click();
  await expect(page.getByRole('heading', { name: 'Checked in.' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Done' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Another check-in' })).toBeVisible();
  expect(problems).toEqual([]);
});

test('Bearbeiten: falsche Sportart und Notiz nachträglich ändern, der Partner sieht den neuen Stand', async ({
  browser,
}, testInfo) => {
  const { anna, annaEmail, benEmail } = await makeCouple();
  await anna.checkin('laufen');
  const { page, problems } = await newUserContext(browser, testInfo);
  await loginViaUi(page, annaEmail);
  await expect(page.getByRole('heading', { name: 'Heute', level: 1 })).toBeVisible();
  await expect(page.locator('.ds-photo')).toContainText('Laufen');

  await page.getByRole('button', { name: /Foto ansehen/ }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Laufen');
  await dialog.getByRole('button', { name: 'Bearbeiten' }).click();
  // Die aktuelle Sportart ist vorgewählt
  await expect(dialog.getByRole('radio', { name: 'Laufen' })).toHaveAttribute(
    'aria-checked',
    'true',
  );

  // Abbrechen verwirft die Änderung
  await dialog.getByRole('radio', { name: 'Yoga' }).click();
  await dialog.getByRole('button', { name: 'Abbrechen' }).click();
  await expect(dialog).toContainText('Laufen');
  await expect(dialog.getByRole('radio')).toHaveCount(0);

  // Speichern: neue Sportart und Notiz stehen gleich im Fenster, auf der Kachel und nach dem Neuladen
  await dialog.getByRole('button', { name: 'Bearbeiten' }).click();
  await dialog.getByRole('radio', { name: 'Rad' }).click();
  await dialog.getByLabel('Notiz (optional)').fill('Mit dem Rad ins Büro');
  await dialog.getByRole('button', { name: 'Speichern' }).click();
  await expect(dialog.getByText('Gespeichert.')).toBeVisible();
  await expect(dialog).toContainText('Rad');
  await expect(dialog).toContainText('Mit dem Rad ins Büro');
  await expect(dialog).not.toContainText('Laufen');
  await page.keyboard.press('Escape');
  await expect(page.locator('.ds-photo')).toContainText('Rad');
  await page.reload();
  await expect(page.locator('.ds-photo')).toContainText('Rad');
  await expect(page.locator('.ds-photo')).not.toContainText('Laufen');

  // Die Notiz lässt sich auch wieder entfernen
  await page.getByRole('button', { name: /Foto ansehen/ }).click();
  await dialog.getByRole('button', { name: 'Bearbeiten' }).click();
  await dialog.getByLabel('Notiz (optional)').fill('');
  await dialog.getByRole('button', { name: 'Speichern' }).click();
  await expect(dialog.getByText('Gespeichert.')).toBeVisible();
  await expect(dialog).not.toContainText('Mit dem Rad ins Büro');
  await page.keyboard.press('Escape');

  // Ben sieht den neuen Stand und kann Annas Check-in nicht bearbeiten, nur darauf reagieren
  const ben = await newUserContext(browser, testInfo);
  await loginViaUi(ben.page, benEmail);
  await expect(ben.page.locator('.ds-photo')).toContainText('Rad');
  await ben.page.getByRole('button', { name: /Foto ansehen/ }).click();
  const benDialog = ben.page.getByRole('dialog');
  await expect(benDialog.getByRole('group', { name: /reagieren/ })).toBeVisible();
  await expect(benDialog.getByRole('button', { name: 'Bearbeiten' })).toHaveCount(0);
  expect(problems).toEqual([]);
  expect(ben.problems).toEqual([]);
});

test('Englisch: Bearbeiten im Foto-Fenster ist übersetzt', async ({ browser }, testInfo) => {
  const { anna, annaEmail } = await makeCouple();
  await anna.call('patch', '/me', { locale: 'en' });
  await anna.checkin('kraft');
  const { page, problems } = await newUserContext(browser, testInfo, undefined, 'en-US');
  await loginViaUi(page, annaEmail);
  await page.getByRole('button', { name: /View photo/ }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Edit' }).click();
  await dialog.getByRole('radio', { name: 'Yoga' }).click();
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog.getByText('Saved.')).toBeVisible();
  await expect(dialog).toContainText('Yoga');
  expect(problems).toEqual([]);
});
