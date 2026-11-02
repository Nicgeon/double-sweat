import { expect, test } from '@playwright/test';
import { loginViaUi, makeCouple, newUserContext } from './helpers';
import { backdateTeam } from './seed';

test('Ab der ersten vollen Woche kommt man ohne Einsatz nicht in die App', async ({
  browser,
}, testInfo) => {
  const { anna, annaEmail, benEmail } = await makeCouple();
  const teamId = (await anna.call('get', '/me')).body.team.id as string;

  // In der Beitrittswoche lässt sich die App kennenlernen: kein Dialog
  const a = await newUserContext(browser, testInfo);
  await loginViaUi(a.page, annaEmail);
  await expect(a.page.getByRole('heading', { name: 'Heute', level: 1 })).toBeVisible();
  await expect(a.page.getByRole('dialog')).toHaveCount(0);

  // Die erste volle Woche läuft: ohne Einsatz geht es nicht weiter
  backdateTeam(teamId, 2);
  await a.page.reload();
  const gate = a.page.getByRole('dialog', { name: 'Dein Einsatz für diese Woche' });
  await expect(gate).toBeVisible();
  await expect(a.page.getByRole('navigation', { name: 'Hauptnavigation' })).toHaveCount(0);
  // Auch über die Adresse kommt man nicht daran vorbei
  await a.page.goto('/bet');
  await expect(gate).toBeVisible();
  await gate.getByLabel('Was schuldest du Ben?').fill('Kinoabend zahlen');
  await gate.getByRole('button', { name: 'Einsatz festlegen' }).click();
  await expect(a.page.getByRole('heading', { name: 'Abmachung', level: 1 })).toBeVisible();
  await expect(a.page.getByRole('dialog')).toHaveCount(0);
  await expect(a.page.getByText('Kinoabend zahlen').first()).toBeVisible();

  // Ben muss seinen eigenen festlegen und sieht Annas zur Orientierung
  const b = await newUserContext(browser, testInfo);
  await loginViaUi(b.page, benEmail);
  const benGate = b.page.getByRole('dialog', { name: 'Dein Einsatz für diese Woche' });
  await expect(benGate).toBeVisible();
  await expect(benGate.getByText('Anna hat festgelegt: „Kinoabend zahlen“')).toBeVisible();
  await benGate.getByLabel('Was schuldest du Anna?').fill('Pizza backen');
  await benGate.getByRole('button', { name: 'Einsatz festlegen' }).click();
  await expect(b.page.getByRole('heading', { name: 'Heute', level: 1 })).toBeVisible();

  // Jeder sieht den Einsatz des anderen auf der Abmachung-Seite
  await b.page.goto('/bet');
  await expect(b.page.getByText('Einsatz von Anna')).toBeVisible();
  await expect(b.page.getByText('Kinoabend zahlen')).toBeVisible();
  expect(a.problems).toEqual([]);
  expect(b.problems).toEqual([]);
});
