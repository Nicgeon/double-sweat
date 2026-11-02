import { expect, test } from '@playwright/test';
import {
  loginViaUi,
  makeCouple,
  newUserContext,
  PASSWORD,
  SETUP_TOKEN,
  uniqueEmail,
} from './helpers';

const ENGLISH = 'en-US';

/** Profil des angemeldeten Kontos, wie die Oberfläche es vom Server bekommt. */
const profile = (page: import('@playwright/test').Page) =>
  page.evaluate(async () => (await fetch('/api/v1/me')).json());

test('Englischer Browser: Konto anlegen, Oberfläche und Konto sind englisch', async ({
  browser,
}, testInfo) => {
  const { page, problems } = await newUserContext(browser, testInfo, undefined, ENGLISH);
  await page.goto('/register');
  await expect(page.getByRole('heading', { name: 'Create a team.' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await page.getByLabel('Display name').fill('Anna');
  await page.getByLabel('Email').fill(uniqueEmail('anna'));
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByLabel('Setup token').fill(SETUP_TOKEN);
  await page.getByRole('button', { name: 'Create team' }).click();

  await expect(page.getByRole('heading', { name: 'Today', level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Invite', exact: true })).toBeVisible();
  const nav = page.getByRole('navigation', { name: 'Main navigation' }).first();
  for (const label of ['Today', 'History', 'Agreement', 'Profile'])
    await expect(nav.getByRole('link', { name: label })).toBeVisible();
  // Check-in ist keine Tab, sondern eine Schaltfläche über der Leiste (Desktop: oben in der Seitenleiste)
  await expect(page.getByRole('link', { name: 'Check in' }).first()).toBeVisible();
  // Das Konto hat die Sprache des Browsers bekommen
  expect((await profile(page)).user.locale).toBe('en');
  await expect(page.locator('.ds-wlane:not(.ds-wlane--empty)')).toContainText('Anna');

  // Seiten mit Datum und Wochenzahl
  await page.goto('/history');
  await expect(page.getByRole('heading', { name: 'History', level: 1 })).toBeVisible();
  await expect(page.getByText('No completed week yet.')).toBeVisible();
  expect(problems).toEqual([]);
});

test('Sprache wechseln: sofort sichtbar, am Konto gespeichert, nach dem Neuladen noch da', async ({
  browser,
}, testInfo) => {
  const { annaEmail } = await makeCouple();
  const { page } = await newUserContext(browser, testInfo);
  await loginViaUi(page, annaEmail);
  await page.goto('/more');
  await expect(page.getByRole('heading', { name: 'Profil', level: 1 })).toBeVisible();

  await page.getByRole('radio', { name: 'English' }).click();
  await expect(page.getByRole('heading', { name: 'Profile', level: 1 })).toBeVisible();
  await expect(page.getByText('Language saved.')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  expect((await profile(page)).user.locale).toBe('en');

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Profile', level: 1 })).toBeVisible();
  await page.goto('/bet');
  await expect(page.getByRole('heading', { name: 'Agreement', level: 1 })).toBeVisible();
  await expect(
    page.getByText(/Whoever misses their weekly goal owes the other their own stake\./),
  ).toBeVisible();

  await page.goto('/more');
  await page.getByRole('radio', { name: 'Deutsch' }).click();
  await expect(page.getByRole('heading', { name: 'Profil', level: 1 })).toBeVisible();
  expect((await profile(page)).user.locale).toBe('de');
});

test('Vor der Anmeldung: Sprachwahl auf der Anmeldeseite, Fehlermeldungen des Servers folgen ihr', async ({
  browser,
}, testInfo) => {
  const { page } = await newUserContext(browser, testInfo);
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Willkommen zurück.' })).toBeVisible();
  await page.getByRole('button', { name: 'English' }).click();
  await expect(page.getByRole('heading', { name: 'Welcome back.' })).toBeVisible();

  await page.getByLabel('Email').fill('niemand@example.org');
  await page.getByLabel('Password').fill('falsches passwort!!');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('alert')).toContainText('Email or password is wrong');

  // Die Wahl bleibt beim Neuladen erhalten
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Welcome back.' })).toBeVisible();
  await page.getByRole('button', { name: 'Deutsch' }).click();
  await page.getByLabel('E-Mail').fill('niemand@example.org');
  await page.getByLabel('Passwort').fill('falsches passwort!!');
  await page.getByRole('button', { name: 'Anmelden' }).click();
  await expect(page.getByRole('alert')).toContainText('E-Mail oder Passwort ist falsch');
});

test('Paar mit zwei Sprachen: Mitteilungen kommen in der Sprache des Empfängers', async ({
  browser,
}, testInfo) => {
  const { annaEmail, benEmail } = await makeCouple();
  // Ben liest Englisch, Anna Deutsch
  const benPage = await newUserContext(browser, testInfo, undefined, ENGLISH);
  await loginViaUi(benPage.page, benEmail);
  await benPage.page.goto('/more');
  await benPage.page.getByRole('radio', { name: 'English' }).click();
  await expect(benPage.page.getByText('Language saved.')).toBeVisible();

  const annaPage = await newUserContext(browser, testInfo);
  await loginViaUi(annaPage.page, annaEmail);
  await annaPage.page.getByRole('button', { name: 'Ben anstupsen' }).click();
  await expect(annaPage.page.getByText('Ben wurde angestupst.')).toBeVisible();

  await benPage.page.goto('/');
  await expect(
    benPage.page.getByRole('link', { name: /Notifications(, 1 new| New: 1)/ }),
  ).toBeVisible();
  await benPage.page.getByRole('link', { name: /Notifications/ }).click();
  await expect(
    benPage.page.getByRole('heading', { name: 'Notifications', level: 1 }),
  ).toBeVisible();
  await expect(benPage.page.getByText('Anna is nudging you: time to work out!')).toBeVisible();

  // Dieselbe Mitteilung erscheint nach einem Sprachwechsel in der neuen Sprache
  await benPage.page.goto('/more');
  await benPage.page.getByRole('radio', { name: 'Deutsch' }).click();
  await benPage.page.goto('/notifications');
  await expect(benPage.page.getByText('Anna stupst dich an: Zeit fürs Training!')).toBeVisible();
});
