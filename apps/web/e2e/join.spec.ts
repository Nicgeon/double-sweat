import { expect, test } from '@playwright/test';
import { Api, loginViaUi, makeCouple, newUserContext, PASSWORD, uniqueEmail } from './helpers';

/** Konto ohne Team: gegründet und das Team wieder aufgelöst. */
async function teamlessUser() {
  const api = await Api.create();
  const u = await api.founder('Clara');
  const res = await api.call('delete', '/team', { password: PASSWORD });
  expect(res.status).toBe(200);
  return { email: u.email as string };
}

test.describe('Beitritt per Link ohne Anmelde-Schleife', () => {
  test('neuer Nutzer ohne Konto', async ({ browser }, testInfo) => {
    const anna = await Api.create();
    await anna.founder('Anna');
    const { joinUrl } = await anna.invite();
    const { page, problems } = await newUserContext(browser, testInfo);
    await page.goto(new URL(joinUrl).pathname);
    await expect(page.getByRole('heading', { name: 'Anna lädt dich ein.' })).toBeVisible();
    await expect(page).toHaveURL(/\/join\//);
    await page.getByLabel('Anzeigename').fill('Ben');
    await page.getByLabel('E-Mail').fill(uniqueEmail('ben'));
    await page.getByLabel('Passwort').fill(PASSWORD);
    await page.getByRole('button', { name: 'Beitreten' }).click();
    await expect(page.getByRole('heading', { name: 'Heute', level: 1 })).toBeVisible();
    expect(problems).toEqual([]);
  });

  test('bestehender, ausgeloggter Nutzer: Anmeldung führt zurück zur Einladung', async ({
    browser,
  }, testInfo) => {
    const anna = await Api.create();
    await anna.founder('Anna');
    const { joinUrl } = await anna.invite();
    const { email } = await teamlessUser();
    const { page, problems } = await newUserContext(browser, testInfo);
    await page.goto(new URL(joinUrl).pathname);
    await page.getByRole('link', { name: 'Ich habe schon ein Konto' }).click();
    await expect(page).toHaveURL(/\/login\?next=%2Fjoin%2F/);
    await page.getByLabel('E-Mail').fill(email);
    await page.getByLabel('Passwort').fill(PASSWORD);
    await page.getByRole('button', { name: 'Anmelden' }).click();
    // zurück bei der Einladung, jetzt angemeldet: kein zweites Anmeldeformular
    await expect(page).toHaveURL(/\/join\//);
    await expect(page.getByText(/Du bist als Clara angemeldet/)).toBeVisible();
    await expect(page.getByLabel('E-Mail')).toHaveCount(0);
    await page.getByRole('button', { name: 'Beitreten' }).click();
    await expect(page.getByRole('heading', { name: 'Heute', level: 1 })).toBeVisible();
    await expect(page.locator('.ds-wlane:not(.ds-wlane--empty)')).toHaveCount(2);
    expect(problems).toEqual([]);
  });

  test('angemeldeter Nutzer ohne Team tritt direkt bei', async ({ browser }, testInfo) => {
    const anna = await Api.create();
    await anna.founder('Anna');
    const { joinUrl } = await anna.invite();
    const { email } = await teamlessUser();
    const { page } = await newUserContext(browser, testInfo);
    await loginViaUi(page, email);
    // ohne Team zeigt die App den Beitritt; der Link funktioniert trotzdem direkt
    await page.goto(new URL(joinUrl).pathname);
    await expect(page.getByText(/Du bist als Clara angemeldet/)).toBeVisible();
    await page.getByRole('button', { name: 'Beitreten' }).click();
    await expect(page.getByRole('heading', { name: 'Heute', level: 1 })).toBeVisible();
  });

  test('angemeldeter Nutzer, der schon in einem Team ist', async ({ browser }, testInfo) => {
    const { benEmail } = await makeCouple();
    const other = await Api.create();
    await other.founder('Dora');
    const { joinUrl } = await other.invite();
    const { page } = await newUserContext(browser, testInfo);
    await loginViaUi(page, benEmail);
    await expect(page.getByRole('heading', { name: 'Heute', level: 1 })).toBeVisible();
    await page.goto(new URL(joinUrl).pathname);
    await expect(page.getByText('Du bist schon in einem Team')).toBeVisible();
  });

  test('abgelaufener oder erfundener Link', async ({ browser }, testInfo) => {
    const { page } = await newUserContext(browser, testInfo);
    await page.goto('/join/AAAA-BBBB-CCCC-DDDD');
    await expect(page.getByRole('heading', { name: 'Dieser Link gilt nicht mehr.' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Zur Anmeldung' })).toBeVisible();
  });

  test('ein Einladungslink funktioniert nur einmal', async ({ browser }, testInfo) => {
    const { inviteCode } = await makeCouple();
    const { page } = await newUserContext(browser, testInfo);
    await page.goto(`/join/${inviteCode}`);
    await expect(page.getByRole('heading', { name: 'Dieser Link gilt nicht mehr.' })).toBeVisible();
  });
});
