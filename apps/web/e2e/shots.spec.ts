import { expect, test } from '@playwright/test';
import { loginViaUi, makeCouple, newUserContext } from './helpers';
import { seedSettledWeek } from './seed';

// Bildschirmfotos aller Hauptseiten zur Sichtprüfung: SHOTS=1 pnpm test:e2e e2e/shots.spec.ts
test.skip(!process.env.SHOTS, 'nur auf Anfrage');

test('Bildschirmfotos', async ({ browser }, testInfo) => {
  const { anna, ben, annaEmail } = await makeCouple();
  const a = (await anna.call('get', '/me')).body;
  const b = (await ben.call('get', '/me')).body;
  seedSettledWeek({
    teamId: a.team.id,
    weekStart: '2026-10-19',
    members: [
      { id: a.user.id, goalDays: 3, doneDays: 3, met: true },
      { id: b.user.id, goalDays: 2, doneDays: 1, met: false },
    ],
    debt: { debtorId: b.user.id, creditorId: a.user.id, betText: 'Kinoabend zahlen' },
  });
  await anna.call('put', '/goals/next', { days: 4 });
  const { page } = await newUserContext(browser, testInfo);
  await loginViaUi(page, annaEmail);
  const name = testInfo.project.name;
  const shot = async (file: string) =>
    page.screenshot({ path: `e2e/screenshots/${file}-${name}.png`, fullPage: true });
  await page.goto('/checkin');
  await expect(page.getByTestId('camera')).toBeVisible();
  await page.waitForTimeout(600);
  await shot('camera');
  await page.getByRole('button', { name: 'Foto aufnehmen' }).click();
  await page.getByRole('radio', { name: 'Laufen' }).click();
  await shot('review');
  await page.getByRole('button', { name: 'Einchecken' }).click();
  await expect(page.getByRole('heading', { name: 'Eingecheckt.' })).toBeVisible();
  await shot('done');
  await page.goto('/');
  await expect(page.locator('.ds-photo')).toHaveCount(1);
  await shot('start-mit-foto');
  for (const [path, file] of [
    ['/history', 'verlauf'],
    ['/bet', 'einsatz'],
    ['/more', 'mehr'],
  ] as const) {
    await page.goto(path);
    await page.waitForTimeout(400);
    await shot(file);
  }
});
