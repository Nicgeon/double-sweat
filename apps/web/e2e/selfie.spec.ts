import { expect, type Page, test } from '@playwright/test';
import { loginViaUi, makeCouple, newUserContext } from './helpers';

/** Die Checkin-Liste dieser Woche, wie die Oberfläche sie vom Server bekommt. */
const weekCheckins = (page: Page) =>
  page.evaluate(async () => (await fetch('/api/v1/checkins')).json());

/** Lädt ein Bild aus der API und prüft, dass es wirklich ankommt. */
const imageLoads = (page: Page, url: string) =>
  page.evaluate(async (u) => {
    const res = await fetch(u);
    return res.ok && res.headers.get('content-type') === 'image/jpeg';
  }, url);

test('Selfie ist freiwillig: ohne Selfie gibt es kein Selfie', async ({ browser }, testInfo) => {
  const { annaEmail } = await makeCouple();
  const { page } = await newUserContext(browser, testInfo);
  await loginViaUi(page, annaEmail);
  await page.goto('/checkin');
  await expect(page.getByTestId('camera')).toBeVisible();
  // Der Schalter ist standardmäßig aus
  await expect(page.getByRole('button', { name: 'Selfie dazu aufnehmen' })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await page.getByRole('button', { name: 'Foto aufnehmen' }).click();
  await expect(page.getByRole('img', { name: 'Dein Foto' })).toBeVisible();
  await expect(page.getByTestId('selfie-preview')).toHaveCount(0);
  await page.getByRole('button', { name: 'Einchecken' }).click();
  await expect(page.getByRole('heading', { name: 'Eingecheckt.' })).toBeVisible();
  const { checkins } = await weekCheckins(page);
  expect(checkins).toHaveLength(1);
  expect(checkins[0].selfie).toBeNull();
  await page.getByRole('link', { name: 'Zur Übersicht' }).click();
  await expect(page.locator('.ds-photo')).toHaveCount(1);
  await expect(page.locator('.ds-photo .selfie-inset')).toHaveCount(0);
});

test('Selfie-Schalter: erst Rückkamera, dann Frontkamera mit Vorlauf, beide landen im Check-in', async ({
  browser,
}, testInfo) => {
  const { annaEmail, benEmail } = await makeCouple();
  const { page, problems } = await newUserContext(browser, testInfo);
  await loginViaUi(page, annaEmail);
  await page.goto('/checkin');
  await expect(page.getByTestId('camera')).toBeVisible();
  const toggle = page.getByRole('button', { name: 'Selfie dazu aufnehmen' });
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');

  await page.getByRole('button', { name: 'Foto aufnehmen' }).click();
  // Gleich danach die Frontkamera; das Selfie löst nach dem Vorlauf von selbst aus
  await expect(page.getByTestId('selfie-camera')).toBeVisible();
  await expect(page.getByText(/Selfie in \d/)).toBeVisible();
  await expect(page.getByTestId('selfie-preview')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('img', { name: 'Dein Foto' })).toBeVisible();

  await page.getByRole('radio', { name: 'Kraft' }).click();
  await page.getByRole('button', { name: 'Einchecken' }).click();
  await expect(page.getByRole('heading', { name: 'Eingecheckt.' })).toBeVisible();

  const { checkins } = await weekCheckins(page);
  expect(checkins).toHaveLength(1);
  const [only] = checkins;
  expect(only.selfie).toMatchObject({ width: expect.any(Number), height: expect.any(Number) });
  expect(await imageLoads(page, only.selfie.fullUrl)).toBe(true);
  expect(await imageLoads(page, only.selfie.thumbUrl)).toBe(true);

  // Im Feed: kleines Selfie auf der Kachel, im Foto-Fenster antippen tauscht Foto und Selfie
  await page.getByRole('link', { name: 'Zur Übersicht' }).click();
  const inset = page.locator('.ds-photo .selfie-inset');
  await expect(inset).toBeVisible();
  const loaded = await inset.evaluate(
    (img: HTMLImageElement) => img.complete && img.naturalWidth > 0,
  );
  expect(loaded).toBe(true);
  await page.getByRole('button', { name: /Foto ansehen/ }).click();
  const swap = page.getByTestId('selfie-swap');
  await expect(swap).toHaveAccessibleName('Selfie groß zeigen');
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('img', { name: /Foto von Anna/ })).toBeVisible();
  await swap.click();
  await expect(swap).toHaveAccessibleName('Foto groß zeigen');
  await expect(dialog.getByRole('img', { name: /Selfie von Anna/ })).toBeVisible();
  await page.keyboard.press('Escape');

  // Auch der Partner sieht das Selfie
  const ben = await newUserContext(browser, testInfo);
  await loginViaUi(ben.page, benEmail);
  await expect(ben.page.locator('.ds-photo .selfie-inset')).toBeVisible();
  expect(problems).toEqual([]);
});

test('Selfie nachträglich hinzufügen, neu aufnehmen und wieder entfernen', async ({
  browser,
}, testInfo) => {
  const { annaEmail } = await makeCouple();
  const { page } = await newUserContext(browser, testInfo);
  await loginViaUi(page, annaEmail);
  await page.goto('/checkin');
  await expect(page.getByTestId('camera')).toBeVisible();
  await page.getByRole('button', { name: 'Foto aufnehmen' }).click();
  await expect(page.getByRole('img', { name: 'Dein Foto' })).toBeVisible();
  await expect(page.getByText('Ein Selfie zeigt, wie es dir beim Training geht.')).toBeVisible();

  // Selfie hinzufügen: Frontkamera, manuell auslösen (kein Vorlauf)
  await page.getByRole('button', { name: 'Selfie hinzufügen' }).click();
  await expect(page.getByTestId('selfie-camera')).toBeVisible();
  await expect(page.getByText(/Selfie in \d/)).toHaveCount(0);
  await page.getByRole('button', { name: 'Selfie aufnehmen' }).click();
  await expect(page.getByTestId('selfie-preview')).toBeVisible();

  // Wieder entfernen: nach dem Einchecken gibt es keins
  await page.getByRole('button', { name: 'Selfie entfernen' }).click();
  await expect(page.getByTestId('selfie-preview')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Selfie hinzufügen' })).toBeVisible();

  // Noch einmal aufnehmen und neu aufnehmen
  await page.getByRole('button', { name: 'Selfie hinzufügen' }).click();
  await page.getByRole('button', { name: 'Selfie aufnehmen' }).click();
  await expect(page.getByTestId('selfie-preview')).toBeVisible();
  await page.getByRole('button', { name: 'Selfie neu aufnehmen' }).click();
  await expect(page.getByTestId('selfie-camera')).toBeVisible();
  await page.getByRole('button', { name: 'Selfie aufnehmen' }).click();
  await expect(page.getByTestId('selfie-preview')).toBeVisible();

  await page.getByRole('button', { name: 'Einchecken' }).click();
  await expect(page.getByRole('heading', { name: 'Eingecheckt.' })).toBeVisible();
  const { checkins } = await weekCheckins(page);
  expect(checkins[0].selfie).not.toBeNull();
});

test('„Ohne Selfie“ überspringt die Frontkamera, der Check-in klappt trotzdem', async ({
  browser,
}, testInfo) => {
  const { annaEmail } = await makeCouple();
  const { page } = await newUserContext(browser, testInfo);
  await loginViaUi(page, annaEmail);
  await page.goto('/checkin');
  await expect(page.getByTestId('camera')).toBeVisible();
  await page.getByRole('button', { name: 'Selfie dazu aufnehmen' }).click();
  await page.getByRole('button', { name: 'Foto aufnehmen' }).click();
  await expect(page.getByTestId('selfie-camera')).toBeVisible();
  await page.getByRole('button', { name: 'Ohne Selfie' }).click();
  await expect(page.getByRole('img', { name: 'Dein Foto' })).toBeVisible();
  await expect(page.getByTestId('selfie-preview')).toHaveCount(0);
  await page.getByRole('button', { name: 'Einchecken' }).click();
  await expect(page.getByRole('heading', { name: 'Eingecheckt.' })).toBeVisible();
  expect((await weekCheckins(page)).checkins[0].selfie).toBeNull();
});

test('Der Schalter wird gemerkt', async ({ browser }, testInfo) => {
  const { annaEmail } = await makeCouple();
  const { page } = await newUserContext(browser, testInfo);
  await loginViaUi(page, annaEmail);
  await page.goto('/checkin');
  await page.getByRole('button', { name: 'Selfie dazu aufnehmen' }).click();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Selfie dazu aufnehmen' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('Frontkamera nicht verfügbar: Hinweis, der Check-in geht ohne Selfie weiter', async ({
  browser,
}, testInfo) => {
  const { annaEmail } = await makeCouple();
  const { page } = await newUserContext(browser, testInfo);
  await page.addInitScript(() => {
    // Die erste Anfrage (Rückkamera) klappt, die Frontkamera wird verweigert
    const real = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = (constraints) => {
      const video = constraints?.video as MediaTrackConstraints | boolean | undefined;
      const facing =
        typeof video === 'object' ? (video.facingMode as { ideal?: string })?.ideal : '';
      if (facing === 'user') {
        const error = new Error('blockiert');
        error.name = 'NotAllowedError';
        return Promise.reject(error);
      }
      return real(constraints);
    };
  });
  await loginViaUi(page, annaEmail);
  await page.goto('/checkin');
  await expect(page.getByTestId('camera')).toBeVisible();
  await page.getByRole('button', { name: 'Selfie dazu aufnehmen' }).click();
  await page.getByRole('button', { name: 'Foto aufnehmen' }).click();
  await expect(page.getByRole('img', { name: 'Dein Foto' })).toBeVisible();
  await expect(page.getByText('Das Selfie konnte nicht aufgenommen werden.')).toBeVisible();
  await page.getByRole('button', { name: 'Einchecken' }).click();
  await expect(page.getByRole('heading', { name: 'Eingecheckt.' })).toBeVisible();
  expect((await weekCheckins(page)).checkins[0].selfie).toBeNull();
});

test('Ohne Kamera: Selfie über die Fotoauswahl', async ({ browser }, testInfo) => {
  const { annaEmail } = await makeCouple();
  const { context, page } = await newUserContext(browser, testInfo);
  await context.clearPermissions();
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'mediaDevices', { value: undefined, configurable: true });
  });
  await loginViaUi(page, annaEmail);
  await page.goto('/checkin');
  const jpeg = async (color: string) =>
    Buffer.from(
      (await page.evaluate(async (c) => {
        const canvas = document.createElement('canvas');
        canvas.width = 240;
        canvas.height = 320;
        const g = canvas.getContext('2d');
        if (g) {
          g.fillStyle = c;
          g.fillRect(0, 0, 240, 320);
        }
        return canvas.toDataURL('image/jpeg', 0.9).split(',')[1];
      }, color)) ?? '',
      'base64',
    );
  await page.getByTestId('file-input').setInputFiles({
    name: 'foto.jpg',
    mimeType: 'image/jpeg',
    buffer: await jpeg('#4a5b7a'),
  });
  await expect(page.getByRole('img', { name: 'Dein Foto' })).toBeVisible();
  await page.getByTestId('selfie-input').setInputFiles({
    name: 'selfie.jpg',
    mimeType: 'image/jpeg',
    buffer: await jpeg('#f2b13a'),
  });
  await expect(page.getByTestId('selfie-preview')).toBeVisible();
  await page.getByRole('button', { name: 'Einchecken' }).click();
  await expect(page.getByRole('heading', { name: 'Eingecheckt.' })).toBeVisible();
  expect((await weekCheckins(page)).checkins[0].selfie).not.toBeNull();
});

test('Englisch: Beschriftungen der Selfie-Funktion', async ({ browser }, testInfo) => {
  const { annaEmail } = await makeCouple();
  const { page } = await newUserContext(browser, testInfo, undefined, 'en-US');
  await loginViaUi(page, annaEmail);
  // Das Konto wurde über die API auf Deutsch angelegt; die Oberfläche folgt dem Konto
  await page.goto('/more');
  await page.getByRole('radio', { name: 'English' }).click();
  await expect(page.getByText('Language saved.')).toBeVisible();
  await page.goto('/checkin');
  await expect(page.getByTestId('camera')).toBeVisible();
  await page.getByRole('button', { name: 'Add a selfie' }).click();
  await page.getByRole('button', { name: 'Take photo' }).click();
  await expect(page.getByTestId('selfie-camera')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Skip selfie' }).first()).toBeVisible();
  await expect(page.getByTestId('selfie-preview')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('button', { name: 'Retake selfie' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Remove selfie' })).toBeVisible();
});
