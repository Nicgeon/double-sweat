import { expect, test } from '@playwright/test';
import { loginViaUi, makeCouple, newUserContext } from './helpers';

test('Unerwarteter Fehler beim Anzeigen: gestaltete Fehlerseite mit Neu laden statt "500 Internal Error"', async ({
  browser,
}, testInfo) => {
  const { annaEmail } = await makeCouple();
  const { page } = await newUserContext(browser, testInfo);
  await loginViaUi(page, annaEmail);
  await expect(page.getByRole('heading', { name: 'Heute', level: 1 })).toBeVisible();

  // Ein Server mit älterem Antwortformat (ohne "mine") bringt die Seite zum Absturz
  await page.route('**/api/v1/bets', (route) =>
    route.fulfill({ json: { current: null, upcoming: null } }),
  );
  await page.goto('/bet');
  await expect(page.getByRole('heading', { name: 'Da ist etwas schiefgelaufen.' })).toBeVisible();
  await expect(page.getByText('Internal Error')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Neu laden' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Zur Startseite' })).toBeVisible();
  // Die technische Angabe steht aufklappbar da, damit sich der Fehler melden lässt
  await page.getByText('Technische Angabe').click();
  await expect(page.locator('.error-detail')).toContainText(/current|undefined/);

  // Nach dem Beheben der Ursache bringt "Zur Startseite" zurück in die App
  await page.unroute('**/api/v1/bets');
  await page.getByRole('link', { name: 'Zur Startseite' }).click();
  await expect(page.getByRole('heading', { name: 'Heute', level: 1 })).toBeVisible();
});

test('Nicht vorhandene Seite: eigener Hinweis statt Standardseite', async ({
  browser,
}, testInfo) => {
  const { annaEmail } = await makeCouple();
  const { page } = await newUserContext(browser, testInfo);
  await loginViaUi(page, annaEmail);
  await page.goto('/gibt-es-nicht');
  await expect(page.getByRole('heading', { name: 'Diese Seite gibt es nicht.' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Zur Startseite' })).toBeVisible();
});

test('Server und App mit verschiedenen API-Versionen: klare Meldung statt Absturz', async ({
  browser,
}, testInfo) => {
  const { annaEmail } = await makeCouple();
  const { page } = await newUserContext(browser, testInfo);
  await loginViaUi(page, annaEmail);
  await expect(page.getByRole('heading', { name: 'Heute', level: 1 })).toBeVisible();

  // Der Server meldet eine ältere API als die App erwartet
  await page.route('**/api/v1/health', async (route) => {
    const res = await route.fetch();
    const health = await res.json();
    await route.fulfill({ response: res, json: { ...health, apiVersion: 1, minClientApi: 1 } });
  });
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'App und Server passen nicht zusammen.' }),
  ).toBeVisible();
  await expect(page.getByText('Der Server ist älter als die App')).toBeVisible();
  await expect(page.getByText(/App: API 2, Server: API 1/)).toBeVisible();

  // Der Server ist neuer als die App
  await page.unroute('**/api/v1/health');
  await page.route('**/api/v1/health', async (route) => {
    const res = await route.fetch();
    const health = await res.json();
    await route.fulfill({ response: res, json: { ...health, apiVersion: 9, minClientApi: 9 } });
  });
  await page.reload();
  await expect(page.getByText('Die App ist älter als der Server')).toBeVisible();

  // Passt es wieder, geht es mit "Erneut versuchen" weiter
  await page.unroute('**/api/v1/health');
  await page.getByRole('button', { name: 'Erneut versuchen' }).click();
  await expect(page.getByRole('heading', { name: 'Heute', level: 1 })).toBeVisible();
});
