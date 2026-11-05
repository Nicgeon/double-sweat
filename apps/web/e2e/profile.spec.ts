import { expect, type Page, test } from '@playwright/test';
import { loginViaUi, makeCouple, newUserContext } from './helpers';

/** Der Eintrag der Hauptnavigation (Tab-Leiste oder Seitenleiste), der gerade als aktuell gilt. */
const current = (page: Page) =>
  page.getByRole('navigation').first().locator('[aria-current="page"]');

test('Profil: eine Liste mit Kopf, jede Zeile öffnet eine Unterseite, Zurück führt zur Liste', async ({
  browser,
}, testInfo) => {
  const { annaEmail } = await makeCouple();
  const { page, problems } = await newUserContext(browser, testInfo);
  await loginViaUi(page, annaEmail);
  await page.goto('/profile');
  await expect(page.getByRole('heading', { name: 'Profil', level: 1 })).toBeVisible();
  await expect(current(page)).toContainText('Profil');

  // Kopf mit Name und E-Mail, darunter keine Formulare, keine Schalter, nur Zeilen
  const main = page.getByRole('main');
  await expect(main.getByRole('heading', { name: 'Anna' })).toBeVisible();
  await expect(main.getByText(annaEmail)).toBeVisible();
  await expect(main.getByRole('textbox')).toHaveCount(0);
  await expect(main.getByRole('switch')).toHaveCount(0);

  // Die Zeilen sagen in einer Zeile, wie es steht
  await expect(main.getByRole('link', { name: /^Konto/ })).toContainText('Name, E-Mail, Passwort');
  await expect(main.getByRole('link', { name: /^Benachrichtigungen/ })).toContainText(
    'Erinnerung um 19:00 Uhr',
  );
  await expect(main.getByRole('link', { name: /^Darstellung/ })).toContainText(
    'Glut · Deutsch · System',
  );
  await expect(main.getByRole('link', { name: /^Team/ })).toContainText('Mit Ben');
  await expect(main.getByRole('link', { name: /^Geräte und Sitzungen/ })).toBeVisible();
  await expect(main.getByRole('link', { name: /^Daten und Löschen/ })).toBeVisible();

  // Jede Unterseite hat eine Überschrift, der Tab „Profil“ bleibt aktiv, Zurück führt zur Liste
  for (const [row, title, url] of [
    [/^Konto/, 'Konto', /\/profile\/account$/],
    [/^Darstellung/, 'Darstellung', /\/profile\/appearance$/],
    [/^Team/, 'Team', /\/profile\/team$/],
    [/^Geräte und Sitzungen/, 'Geräte und Sitzungen', /\/profile\/devices$/],
    [/^Daten und Löschen/, 'Daten und Löschen', /\/profile\/data$/],
  ] as const) {
    await main.getByRole('link', { name: row }).click();
    await expect(page).toHaveURL(url);
    await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible();
    await expect(current(page)).toContainText('Profil');
    await page.goBack();
    await expect(page.getByRole('heading', { name: 'Profil', level: 1 })).toBeVisible();
  }
  expect(problems).toEqual([]);
});

test('Alter Link /more führt zum Profil', async ({ browser }, testInfo) => {
  const { annaEmail } = await makeCouple();
  const { page, problems } = await newUserContext(browser, testInfo);
  await loginViaUi(page, annaEmail);
  await page.goto('/more');
  await expect(page).toHaveURL(/\/profile$/);
  await expect(page.getByRole('heading', { name: 'Profil', level: 1 })).toBeVisible();
  expect(problems).toEqual([]);
});

test('Konto: Name ändern wird gespeichert und steht gleich im Kopf des Profils', async ({
  browser,
}, testInfo) => {
  const { annaEmail, anna } = await makeCouple();
  const { page, problems } = await newUserContext(browser, testInfo);
  await loginViaUi(page, annaEmail);
  await page.goto('/profile/account');
  await expect(page.getByLabel('Anzeigename')).toHaveValue('Anna');
  await page.getByLabel('Anzeigename').fill('Anna M.');
  await page.getByRole('button', { name: 'Speichern' }).click();
  await expect(page.getByText('Gespeichert.')).toBeVisible();
  expect((await anna.call('get', '/me')).body.user.displayName).toBe('Anna M.');
  await page.goto('/profile');
  await expect(page.getByRole('main').getByRole('heading', { name: 'Anna M.' })).toBeVisible();
  // E-Mail und Passwort ändern öffnen ein Fenster mit Passwortabfrage
  await page.goto('/profile/account');
  await page.getByRole('button', { name: 'E-Mail ändern' }).click();
  await expect(page.getByRole('dialog', { name: 'E-Mail ändern' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(problems).toEqual([]);
});

test('Daten und Löschen: Export vorn, Unwiderrufliches abgesetzt in eigener Gruppe', async ({
  browser,
}, testInfo) => {
  const { annaEmail } = await makeCouple();
  const { page, problems } = await newUserContext(browser, testInfo);
  await loginViaUi(page, annaEmail);
  await page.goto('/profile/data');
  const danger = page.getByRole('region', { name: 'Unwiderruflich' });
  await expect(danger.getByRole('button', { name: 'Team auflösen' })).toBeVisible();
  await expect(danger.getByRole('button', { name: 'Konto löschen' })).toBeVisible();
  // Der Export liegt nicht in der gefährlichen Gruppe
  await expect(page.getByRole('button', { name: 'Meine Daten exportieren' })).toBeVisible();
  await expect(danger.getByRole('button', { name: 'Meine Daten exportieren' })).toHaveCount(0);
  // Abbrechen löscht nichts
  await danger.getByRole('button', { name: 'Konto löschen' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page).toHaveURL(/\/profile\/data$/);
  expect(problems).toEqual([]);
});

test('Team und Geräte: Mitglieder mit Zeitzone, eigenes Gerät gekennzeichnet', async ({
  browser,
}, testInfo) => {
  const { annaEmail } = await makeCouple();
  const { page, problems } = await newUserContext(browser, testInfo);
  await loginViaUi(page, annaEmail);
  await page.goto('/profile/team');
  const members = page.getByRole('main').getByRole('listitem');
  await expect(members).toHaveCount(2);
  await expect(members.filter({ hasText: 'Ben' })).toContainText('Europe/Berlin');
  // Das Team ist voll: keine Einladung mehr
  await expect(page.getByRole('button', { name: 'Partner einladen' })).toHaveCount(0);

  await page.goto('/profile/devices');
  await expect(page.getByText('(dieses Gerät)')).toBeVisible();
  // Kein roher User-Agent-Text
  await expect(page.getByRole('main')).not.toContainText('Mozilla/5.0');
  expect(problems).toEqual([]);
});

test('Benachrichtigungen vom Profil aus: Tab „Profil“ bleibt aktiv, Zurück führt ins Profil', async ({
  browser,
}, testInfo) => {
  const { annaEmail } = await makeCouple();
  const { page, problems } = await newUserContext(browser, testInfo);
  await loginViaUi(page, annaEmail);
  await page.goto('/profile');
  await page
    .getByRole('main')
    .getByRole('link', { name: /^Benachrichtigungen/ })
    .click();
  await expect(page).toHaveURL(/\/notifications\/settings\?from=profile$/);
  await expect(current(page)).toContainText('Profil');
  await page.goBack();
  await expect(page).toHaveURL(/\/profile$/);

  // Aus dem Postfach gehört dieselbe Seite zum Postfach
  await page.goto('/notifications/settings');
  await expect(current(page)).toContainText('Heute');
  expect(problems).toEqual([]);
});

test('Englisch: Profil und Unterseiten sind übersetzt', async ({ browser }, testInfo) => {
  const { anna, annaEmail } = await makeCouple();
  await anna.call('patch', '/me', { locale: 'en' });
  const { page, problems } = await newUserContext(browser, testInfo, undefined, 'en-US');
  await loginViaUi(page, annaEmail);
  await page.goto('/profile');
  await expect(page.getByRole('heading', { name: 'Profile', level: 1 })).toBeVisible();
  const main = page.getByRole('main');
  await expect(main.getByRole('link', { name: /^Account/ })).toContainText('Name, email, password');
  await expect(main.getByRole('link', { name: /^Notifications/ })).toContainText(
    'Reminder at 19:00',
  );
  await expect(main.getByRole('link', { name: /^Appearance/ })).toContainText(
    'Ember · English · System',
  );
  await expect(main.getByRole('link', { name: /^Team/ })).toContainText('With Ben');
  await expect(main.getByRole('link', { name: /^Data and deletion/ })).toBeVisible();
  await main.getByRole('link', { name: /^Data and deletion/ }).click();
  await expect(page.getByRole('region', { name: 'Irreversible' })).toBeVisible();
  expect(problems).toEqual([]);
});
