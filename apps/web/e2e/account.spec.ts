import { expect, test } from '@playwright/test';
import { loginViaUi, makeCouple, newUserContext, PASSWORD } from './helpers';
import { seedSettledWeek } from './seed';

test('Verlauf und Einsatz: abgerechnete Wochen, Schuld einlösen', async ({ browser }, testInfo) => {
  const { anna, ben, annaEmail, benEmail } = await makeCouple();
  const a = (await anna.call('get', '/me')).body;
  const b = (await ben.call('get', '/me')).body;
  const teamId = a.team.id as string;
  // Woche 1: Anna schafft es, Ben nicht; Ben schuldet Anna den Einsatz. Woche 2: beide geschafft.
  seedSettledWeek({
    teamId,
    weekStart: '2026-10-12',
    members: [
      { id: a.user.id, goalDays: 3, doneDays: 3, met: true },
      { id: b.user.id, goalDays: 3, doneDays: 1, met: false },
    ],
    debt: { debtorId: b.user.id, creditorId: a.user.id, betText: 'Kinoabend zahlen' },
    // Anna hat ihr Ziel erreicht: Ben schuldet ihr außerdem die versprochene Belohnung
    claim: { recipientId: a.user.id, giverId: b.user.id, rewardText: 'Massage' },
  });
  seedSettledWeek({
    teamId,
    weekStart: '2026-10-19',
    members: [
      { id: a.user.id, goalDays: 3, doneDays: 3, met: true },
      { id: b.user.id, goalDays: 2, doneDays: 2, met: true },
    ],
  });

  const annaUi = await newUserContext(browser, testInfo);
  await loginViaUi(annaUi.page, annaEmail);
  await annaUi.page.goto('/history');
  await expect(annaUi.page.getByRole('heading', { name: 'Verlauf', level: 1 })).toBeVisible();
  await expect(annaUi.page.getByText('KW 43')).toBeVisible();
  await expect(annaUi.page.getByText('Beide geschafft')).toBeVisible();
  await expect(annaUi.page.getByText('Nicht erreicht')).toBeVisible();
  await expect(annaUi.page.getByText('Ben schuldet den Einsatz')).toBeVisible();
  await expect(annaUi.page.locator('.ds-streak')).toContainText('1');

  // "Offen" führt Einsätze und Belohnungen in einer Liste. Anna ist Gläubigerin und löst ein; Ben sieht nur den Status
  await annaUi.page.goto('/deal');
  const annaOpen = annaUi.page.getByRole('region', { name: 'Offen' });
  await expect(annaOpen.getByText('Ben schuldet dir')).toBeVisible();
  await expect(annaOpen.getByText('Einsatz · KW 42')).toBeVisible();
  await expect(annaOpen.getByText('Ben hat dir versprochen')).toBeVisible();
  await expect(annaOpen.getByText('Massage')).toBeVisible();
  await expect(annaOpen.getByText('Belohnung · KW 42')).toBeVisible();
  const benUi = await newUserContext(browser, testInfo);
  await loginViaUi(benUi.page, benEmail);
  await benUi.page.goto('/deal');
  const benOpen = benUi.page.getByRole('region', { name: 'Offen' });
  await expect(benOpen.getByText('Du schuldest Anna')).toBeVisible();
  await expect(benOpen.getByText('Du hast Anna versprochen')).toBeVisible();
  await expect(benOpen.getByText('Anna bestätigt')).toHaveCount(2);
  await expect(benUi.page.getByRole('button', { name: 'Eingelöst' })).toHaveCount(0);
  await expect(benUi.page.getByRole('button', { name: 'Erhalten' })).toHaveCount(0);

  await annaOpen.getByRole('button', { name: 'Eingelöst' }).click();
  await annaOpen.getByRole('button', { name: 'Erhalten' }).click();
  await expect(annaOpen.getByText('Nichts offen.')).toBeVisible();
  // Erledigtes lässt sich einblenden
  await annaUi.page.getByRole('button', { name: 'Erledigte anzeigen' }).click();
  const annaDone = annaUi.page.getByRole('region', { name: 'Erledigt' });
  await expect(annaDone.getByText('Ben schuldet dir')).toBeVisible();
  await expect(annaDone.getByText('Ben hat dir versprochen')).toBeVisible();
  await expect(annaDone.locator('.ds-debt .ds-chip--done')).toHaveCount(2);
  await expect(annaDone.locator('.ds-debt .ds-chip--done').first()).toContainText(
    /Eingelöst|Erhalten/,
  );
  expect(annaUi.problems).toEqual([]);
});

test('Passwort ändern meldet andere Geräte ab', async ({ browser }, testInfo) => {
  const { annaEmail } = await makeCouple();
  const first = await newUserContext(browser, testInfo);
  await loginViaUi(first.page, annaEmail);
  const second = await newUserContext(browser, testInfo);
  await loginViaUi(second.page, annaEmail);
  await second.page.goto('/more');
  await expect(second.page.getByText('(dieses Gerät)')).toBeVisible();
  await second.page.getByRole('button', { name: 'Passwort ändern' }).click();
  await second.page.getByLabel('Aktuelles Passwort').fill(PASSWORD);
  await second.page.getByLabel('Neues Passwort').fill('ein noch längeres passwort');
  await second.page.getByRole('dialog').getByRole('button', { name: 'Passwort ändern' }).click();
  await expect(second.page.getByText(/Passwort geändert/)).toBeVisible();
  // die erste Sitzung ist beendet: geschützte Seite führt zur Anmeldung
  await first.page.goto('/more');
  await expect(first.page).toHaveURL(/\/login/);
});

test('Datenexport lädt ein ZIP, Passwort wird abgefragt', async ({ browser }, testInfo) => {
  const { annaEmail } = await makeCouple();
  const { page } = await newUserContext(browser, testInfo);
  await loginViaUi(page, annaEmail);
  await page.goto('/more');
  await page.getByRole('button', { name: 'Meine Daten exportieren' }).click();
  await page.getByLabel('Dein Passwort').fill('falsch falsch falsch');
  await page.getByRole('button', { name: 'Export starten' }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toBeVisible();
  await page.getByLabel('Dein Passwort').fill(PASSWORD);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export starten' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^double-sweat-export-\d{4}-\d{2}-\d{2}\.zip$/);
});

test('Team auflösen und Konto löschen verlangen das Passwort', async ({ browser }, testInfo) => {
  const { annaEmail, benEmail } = await makeCouple();
  const anna = await newUserContext(browser, testInfo);
  await loginViaUi(anna.page, annaEmail);
  await anna.page.goto('/more');
  await anna.page.getByRole('button', { name: 'Team auflösen' }).first().click();
  await anna.page.getByLabel('Dein Passwort').fill(PASSWORD);
  await anna.page.getByRole('dialog').getByRole('button', { name: 'Team auflösen' }).click();
  // ohne Team zeigt die App den Beitritt
  await expect(
    anna.page.getByRole('heading', { name: 'Du bist noch in keinem Team.' }),
  ).toBeVisible();

  const ben = await newUserContext(browser, testInfo);
  await loginViaUi(ben.page, benEmail);
  await expect(
    ben.page.getByRole('heading', { name: 'Du bist noch in keinem Team.' }),
  ).toBeVisible();
  await expect(ben.page.getByRole('link', { name: /Benachrichtigungen/ })).toHaveCount(0);
});

test('Konto löschen entfernt die Sitzung', async ({ browser }, testInfo) => {
  const { annaEmail } = await makeCouple();
  const { page } = await newUserContext(browser, testInfo);
  await loginViaUi(page, annaEmail);
  await page.goto('/more');
  await page.getByRole('button', { name: 'Konto löschen' }).click();
  await page.getByLabel('Dein Passwort').fill(PASSWORD);
  await page.getByRole('dialog').getByRole('button', { name: 'Konto löschen' }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.getByLabel('E-Mail').fill(annaEmail);
  await page.getByLabel('Passwort').fill(PASSWORD);
  await page.getByRole('button', { name: 'Anmelden' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
});
