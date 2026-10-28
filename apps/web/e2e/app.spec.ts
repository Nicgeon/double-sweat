import { expect, test } from '@playwright/test';
import {
  loginViaUi,
  makeCouple,
  newUserContext,
  PASSWORD,
  SETUP_TOKEN,
  uniqueEmail,
} from './helpers';

test('Team gründen, abmelden und wieder anmelden', async ({ browser }, testInfo) => {
  const { page, problems } = await newUserContext(browser, testInfo);
  const email = uniqueEmail('anna');
  await page.goto('/register');
  await page.getByLabel('Anzeigename').fill('Anna');
  await page.getByLabel('E-Mail').fill(email);
  await page.getByLabel('Passwort').fill(PASSWORD);
  await page.getByLabel('Setup-Token').fill(SETUP_TOKEN);
  await page.getByRole('radio', { name: 'Orchidee' }).click();
  await page.getByRole('button', { name: 'Team gründen' }).click();

  await expect(page.getByRole('heading', { name: 'Diese Woche', level: 1 })).toBeVisible();
  await expect(page.getByText('Dein Partner fehlt noch')).toBeVisible();
  await expect(page.locator('.ds-lane')).toHaveCount(1);
  await expect(page.locator('.ds-lane.ds-c-orchid')).toBeVisible();

  // Sitzung überlebt ein Neuladen (Cookie), Abmelden führt zur Anmeldung
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Diese Woche', level: 1 })).toBeVisible();
  await page.goto('/more');
  await page.getByRole('button', { name: 'Abmelden' }).click();
  await expect(page.getByRole('heading', { name: 'Willkommen zurück.' })).toBeVisible();

  // Geschützte Seiten leiten mit Rücksprung zur Anmeldung
  await page.goto('/bet');
  await expect(page).toHaveURL(/\/login\?next=%2Fbet/);
  await page.getByLabel('E-Mail').fill(email);
  await page.getByLabel('Passwort').fill('falsches passwort!!');
  await page.getByRole('button', { name: 'Anmelden' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await page.getByLabel('Passwort').fill(PASSWORD);
  await page.getByRole('button', { name: 'Anmelden' }).click();
  await expect(page.getByRole('heading', { name: 'Einsatz', level: 1 })).toBeVisible();
  expect(problems).toEqual([]);
});

test('Registrierung ohne gültiges Setup-Token wird abgelehnt', async ({ browser }, testInfo) => {
  const { page } = await newUserContext(browser, testInfo);
  await page.goto('/register');
  await page.getByLabel('Anzeigename').fill('Mallory');
  await page.getByLabel('E-Mail').fill(uniqueEmail('mallory'));
  await page.getByLabel('Passwort').fill(PASSWORD);
  await page.getByLabel('Setup-Token').fill('falsch');
  await page.getByRole('button', { name: 'Team gründen' }).click();
  await expect(page.getByRole('alert')).toContainText('Setup-Token');
});

test('Einladungslink erzeugen, Partner tritt bei, Farben bleiben verschieden', async ({
  browser,
}, testInfo) => {
  const anna = await newUserContext(browser, testInfo);
  await anna.page.goto('/register');
  await anna.page.getByLabel('Anzeigename').fill('Anna');
  await anna.page.getByLabel('E-Mail').fill(uniqueEmail('anna'));
  await anna.page.getByLabel('Passwort').fill(PASSWORD);
  await anna.page.getByLabel('Setup-Token').fill(SETUP_TOKEN);
  await anna.page.getByRole('radio', { name: 'Flut' }).click();
  await anna.page.getByRole('button', { name: 'Team gründen' }).click();
  await anna.page.getByRole('button', { name: 'Einladen' }).click();
  const link = (await anna.page.getByTestId('invite-link').textContent())?.trim() ?? '';
  expect(link).toMatch(/\/join\/[0-9A-Z-]+$/);
  await anna.page.keyboard.press('Escape');
  await expect(anna.page.getByRole('dialog')).toHaveCount(0);

  const ben = await newUserContext(browser, testInfo);
  await ben.page.goto(new URL(link).pathname);
  await expect(ben.page.getByRole('heading', { name: 'Anna lädt dich ein.' })).toBeVisible();
  // Die Farbe der einladenden Person ist gesperrt, die Standardfarbe weicht aus
  await expect(ben.page.getByRole('radio', { name: 'Flut, vergeben von Anna' })).toBeDisabled();
  await expect(ben.page.getByRole('radio', { name: 'Glut' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await ben.page.getByLabel('Anzeigename').fill('Ben');
  await ben.page.getByLabel('E-Mail').fill(uniqueEmail('ben'));
  await ben.page.getByLabel('Passwort').fill(PASSWORD);
  await ben.page.getByRole('button', { name: 'Beitreten' }).click();
  await expect(ben.page.getByRole('heading', { name: 'Diese Woche', level: 1 })).toBeVisible();
  await expect(ben.page.locator('.ds-lane')).toHaveCount(2);
  // Eigene Bahn zuerst, Platz 2 ist ein Quadrat
  await expect(ben.page.locator('.ds-lane').first()).toContainText('Ben (Du)');
  await expect(ben.page.locator('.ds-lane').first()).toHaveClass(/ds-p2/);
  await expect(ben.page.locator('.ds-lane').nth(1)).toHaveClass(/ds-p1/);

  await anna.page.reload();
  await expect(anna.page.locator('.ds-lane')).toHaveCount(2);
  await expect(anna.page.getByText('Dein Partner fehlt noch')).toHaveCount(0);
  expect(anna.problems).toEqual([]);
  expect(ben.problems).toEqual([]);
});

test('Check-in mit Fake-Kamera, Foto im Feed, zweiter Check-in am Tag nicht möglich', async ({
  browser,
}, testInfo) => {
  const { annaEmail } = await makeCouple();
  const { page, problems } = await newUserContext(browser, testInfo);
  await loginViaUi(page, annaEmail);
  await expect(page.getByRole('heading', { name: 'Diese Woche', level: 1 })).toBeVisible();
  await page.getByRole('link', { name: 'Check-in' }).first().click();

  await expect(page.getByTestId('camera')).toBeVisible();
  await page.getByRole('button', { name: 'Foto aufnehmen' }).click();
  await expect(page.getByRole('img', { name: 'Dein Foto' })).toBeVisible();
  await page.getByRole('radio', { name: 'Laufen' }).click();
  await page.getByLabel('Notiz (optional)').fill('Schöne Runde');
  await page.getByRole('button', { name: 'Einchecken' }).click();
  await expect(page.getByRole('heading', { name: 'Eingecheckt.' })).toBeVisible();
  await expect(page.getByText('Ben sieht dein Foto.')).toBeVisible();

  await page.getByRole('link', { name: 'Zur Übersicht' }).click();
  await expect(page.locator('.ds-photo')).toHaveCount(1);
  await expect(page.locator('.ds-photo img')).toBeVisible();
  await expect(page.locator('.ds-photo')).toContainText('Laufen');
  const loaded = await page
    .locator('.ds-photo img')
    .evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0);
  expect(loaded).toBe(true);
  await expect(page.locator('.ds-lane').first().locator('.ds-lane__done')).toHaveText('1');

  // Foto ansehen
  await page.getByRole('button', { name: /Foto ansehen/ }).click();
  await expect(page.getByRole('dialog')).toContainText('Schöne Runde');
  await page.keyboard.press('Escape');

  // Ein Check-in pro Tag
  await page.goto('/checkin');
  await expect(page.getByText('Du hast heute schon eingecheckt')).toBeVisible();
  expect(problems).toEqual([]);
});

test('Check-in ohne Kamera: Foto auswählen als Fallback', async ({ browser }, testInfo) => {
  const { annaEmail } = await makeCouple();
  const { context, page } = await newUserContext(browser, testInfo);
  await context.clearPermissions();
  await page.addInitScript(() => {
    // Kamera nicht verfügbar
    Object.defineProperty(navigator, 'mediaDevices', { value: undefined, configurable: true });
  });
  await loginViaUi(page, annaEmail);
  await expect(page.getByRole('heading', { name: 'Diese Woche', level: 1 })).toBeVisible();
  await page.goto('/checkin');
  await expect(page.getByText('Die Kamera ist hier nicht verfügbar')).toBeVisible();
  const jpeg = await page.evaluate(async () => {
    const c = document.createElement('canvas');
    c.width = 320;
    c.height = 240;
    const g = c.getContext('2d');
    if (g) {
      g.fillStyle = '#4a5b7a';
      g.fillRect(0, 0, 320, 240);
      g.fillStyle = '#f2b13a';
      g.fillRect(40, 40, 100, 100);
    }
    return c.toDataURL('image/jpeg', 0.9).split(',')[1];
  });
  await page.getByTestId('file-input').setInputFiles({
    name: 'foto.jpg',
    mimeType: 'image/jpeg',
    buffer: Buffer.from(jpeg ?? '', 'base64'),
  });
  await expect(page.getByRole('img', { name: 'Dein Foto' })).toBeVisible();
  await page.getByRole('button', { name: 'Einchecken' }).click();
  await expect(page.getByRole('heading', { name: 'Eingecheckt.' })).toBeVisible();
});

test('Ziel und Einsatz festlegen', async ({ browser }, testInfo) => {
  const { annaEmail } = await makeCouple();
  const { page, problems } = await newUserContext(browser, testInfo);
  await loginViaUi(page, annaEmail);
  await expect(page.getByRole('heading', { name: 'Diese Woche', level: 1 })).toBeVisible();
  await expect(page.getByText('Setze dein Wochenziel')).toBeVisible();
  await page.goto('/bet');
  const plus = page.getByRole('button', { name: 'Einen Tag mehr' });
  await plus.click();
  await plus.click();
  await page.getByRole('button', { name: 'Ziel speichern' }).click();
  await expect(page.getByText(/Dein Ziel von \d Tagen gilt ab/)).toBeVisible();

  await page.getByRole('button', { name: 'Ändern' }).click();
  await page.getByLabel('Was steht auf dem Spiel?').fill('Wer verliert, kocht am Sonntag');
  await page.getByRole('button', { name: 'Speichern', exact: true }).click();
  await expect(page.getByText('Wer verliert, kocht am Sonntag')).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(problems).toEqual([]);
});

test('Anstupsen: einmal pro Stunde, Partner sieht es im Postfach', async ({
  browser,
}, testInfo) => {
  const { annaEmail, benEmail } = await makeCouple();
  const anna = await newUserContext(browser, testInfo);
  await loginViaUi(anna.page, annaEmail);
  await anna.page.getByRole('button', { name: 'Ben anstupsen' }).click();
  await expect(anna.page.getByText('Ben wurde angestupst.')).toBeVisible();
  await anna.page.getByRole('button', { name: 'Ben anstupsen' }).click();
  await expect(anna.page.getByText(/Du kannst Ben in \d+ Min\. wieder anstupsen/)).toBeVisible();

  const ben = await newUserContext(browser, testInfo);
  await loginViaUi(ben.page, benEmail);
  await expect(ben.page.getByRole('link', { name: /Benachrichtigungen, 1 neu/ })).toBeVisible();
  await ben.page.getByRole('link', { name: /Benachrichtigungen/ }).click();
  await expect(ben.page.getByText(/Anna stupst dich an/)).toBeVisible();
  await ben.page.getByRole('button', { name: 'Alle gelesen' }).click();
  await expect(ben.page.getByRole('button', { name: 'Alle gelesen' })).toHaveCount(0);
});

test('Farbe wählen: wirkt sofort, die des Partners ist gesperrt', async ({ browser }, testInfo) => {
  const { annaEmail, benEmail } = await makeCouple();
  const anna = await newUserContext(browser, testInfo);
  await loginViaUi(anna.page, annaEmail);
  await anna.page.goto('/more');
  await anna.page.getByRole('radio', { name: 'Orchidee' }).click();
  await expect(anna.page.getByText('Farbe gespeichert.')).toBeVisible();
  await expect(anna.page.getByRole('radio', { name: 'Flut, vergeben von Ben' })).toBeDisabled();

  const ben = await newUserContext(browser, testInfo);
  await loginViaUi(ben.page, benEmail);
  await ben.page.goto('/more');
  await expect(ben.page.getByRole('radio', { name: 'Orchidee, vergeben von Anna' })).toBeDisabled();
  await ben.page.goto('/');
  await expect(ben.page.locator('.ds-lane.ds-c-orchid')).toContainText('Anna');
});
