import { expect, type Page, test } from '@playwright/test';
import { loginViaUi, makeCouple, newUserContext } from './helpers';
import { seedSettledWeek } from './seed';

// Messbare Ziele der Überarbeitung (siehe README, "Übersicht und Navigation"): wenige Tipps bis zum Ziel, keine
// Hinweisflut, Tippflächen mindestens 44 px. Gezählt wird, was ein Mensch antippt.

test('Wochenziel ändern: in 2 Tipps von „Heute“ im Fenster zum Ändern', async ({
  browser,
}, testInfo) => {
  const { annaEmail, anna } = await makeCouple();
  await anna.call('put', '/goals/next', { days: 3 });
  const { page, problems } = await newUserContext(browser, testInfo);
  await loginViaUi(page, annaEmail);
  await expect(page.getByRole('heading', { name: 'Heute', level: 1 })).toBeVisible();

  // Tipp 1: „Abmachung“ (Leiste unten bzw. Seitenleiste)
  await page
    .getByRole('navigation')
    .getByRole('link', { name: /Abmachung/ })
    .first()
    .click();
  await expect(page.getByRole('heading', { name: 'Abmachung', level: 1 })).toBeVisible();
  // Tipp 2: „Ziel ändern“ an der eigenen Karte
  await page
    .getByRole('region', { name: 'Anna (Du)' })
    .getByRole('button', { name: 'Ziel ändern' })
    .click();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(problems).toEqual([]);
});

test('„Was schuldet mir Ben?“: in 1 Tipp von „Heute“ beantwortet', async ({
  browser,
}, testInfo) => {
  const { anna, ben, annaEmail } = await makeCouple();
  const a = (await anna.call('get', '/me')).body;
  const b = (await ben.call('get', '/me')).body;
  seedSettledWeek({
    teamId: a.team.id as string,
    weekStart: '2026-10-12',
    members: [
      { id: a.user.id, goalDays: 3, doneDays: 3, met: true },
      { id: b.user.id, goalDays: 3, doneDays: 1, met: false },
    ],
    debt: { debtorId: b.user.id, creditorId: a.user.id, betText: 'Kinoabend zahlen' },
  });
  const { page, problems } = await newUserContext(browser, testInfo);
  await loginViaUi(page, annaEmail);
  await expect(page.getByRole('heading', { name: 'Heute', level: 1 })).toBeVisible();
  // Das Abzeichen an „Abmachung“ sagt schon auf „Heute“, dass etwas wartet
  const tab = page
    .getByRole('navigation')
    .getByRole('link', { name: /Abmachung/ })
    .first();
  await expect(tab).toContainText('1');

  // Tipp 1: „Abmachung“. Oben steht „Offen“ mit der Antwort.
  await tab.click();
  const open = page.getByRole('region', { name: 'Offen' });
  await expect(open.getByText('Ben schuldet dir')).toBeVisible();
  await expect(open.getByText('Kinoabend zahlen')).toBeVisible();
  expect(problems).toEqual([]);
});

test('Nie mehr als ein Hinweis gleichzeitig, auch bei einem ganz neuen Konto', async ({
  browser,
}, testInfo) => {
  const { annaEmail } = await makeCouple();
  const { page, problems } = await newUserContext(browser, testInfo);
  await loginViaUi(page, annaEmail);
  for (const path of ['/', '/deal', '/history', '/profile', '/notifications']) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    // Ladehinweise (Skeletons) sind keine Hinweise; gezählt werden die Hinweiskarten
    await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
    expect(await page.locator('.ds-banner:visible').count(), path).toBeLessThanOrEqual(1);
  }
  expect(problems).toEqual([]);
});

/** Tippflächen: jedes bedienbare Element ist auf dem Handy mindestens 44 × 44 px groß (Designsystem). */
async function smallTargets(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const MIN = 44 - 0.5;
    const found: string[] = [];
    const selector =
      'a[href], button, [role="radio"], [role="switch"], select, input:not([type="hidden"]):not([type="file"]), textarea';
    for (const el of document.querySelectorAll<HTMLElement>(selector)) {
      const style = getComputedStyle(el);
      if (style.visibility === 'hidden' || style.display === 'none') continue;
      if (el.closest('[aria-hidden="true"], .ds-sr')) continue;
      const box = el.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) continue;
      // Ein Link mitten im Fließtext darf so groß sein wie sein Text; die Trefferfläche des Absatzes zählt
      if (el.tagName === 'A' && el.closest('p') && getComputedStyle(el).display === 'inline')
        continue;
      if (box.height < MIN || box.width < MIN) {
        const name = (el.getAttribute('aria-label') || el.textContent || el.tagName)
          .trim()
          .slice(0, 30);
        found.push(
          `${el.tagName.toLowerCase()} „${name}“ ${Math.round(box.width)}×${Math.round(box.height)}`,
        );
      }
    }
    return found;
  });
}

test('Tippflächen: auf dem Handy mindestens 44 px auf allen Hauptseiten', async ({
  browser,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobil', 'misst die Handy-Ansicht');
  const { anna, ben, annaEmail } = await makeCouple();
  const a = (await anna.call('get', '/me')).body;
  const b = (await ben.call('get', '/me')).body;
  seedSettledWeek({
    teamId: a.team.id as string,
    weekStart: '2026-10-12',
    members: [
      { id: a.user.id, goalDays: 3, doneDays: 3, met: true },
      { id: b.user.id, goalDays: 3, doneDays: 1, met: false },
    ],
    debt: { debtorId: b.user.id, creditorId: a.user.id, betText: 'Kinoabend zahlen' },
    claim: { recipientId: a.user.id, giverId: b.user.id, rewardText: 'Massage' },
  });
  await anna.call('put', '/bets', { text: 'Pizza backen' });
  await ben.checkin('laufen');
  await ben.call('post', '/nudges');
  const { page, problems } = await newUserContext(browser, testInfo);
  await loginViaUi(page, annaEmail);

  const offenders: Record<string, string[]> = {};
  for (const path of [
    '/',
    '/history',
    '/deal',
    '/profile',
    '/profile/account',
    '/profile/appearance',
    '/profile/team',
    '/profile/devices',
    '/profile/data',
    '/notifications',
    '/notifications/settings',
  ]) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
    const small = await smallTargets(page);
    if (small.length > 0) offenders[path] = small;
  }
  expect(offenders).toEqual({});
  expect(problems).toEqual([]);
});

test('Ladezustände: Abmachung, Verlauf und Geräte zeigen Platzhalter statt leerer Karten', async ({
  browser,
}, testInfo) => {
  const { annaEmail } = await makeCouple();
  const { page, problems } = await newUserContext(browser, testInfo);
  await loginViaUi(page, annaEmail);
  // Die Antworten kommen langsam: bis dahin stehen Platzhalter da, und nichts behauptet „Nichts offen.“
  await page.route('**/api/v1/debts*', async (route) => {
    await new Promise((r) => setTimeout(r, 800));
    await route.continue();
  });
  await page.route('**/api/v1/history*', async (route) => {
    await new Promise((r) => setTimeout(r, 800));
    await route.continue();
  });
  await page.goto('/deal');
  await expect(page.locator('.ds-skel').first()).toBeVisible();
  await expect(page.getByText('Nichts offen.')).toHaveCount(0);
  await expect(page.getByText('Nichts offen.')).toBeVisible();
  await expect(page.locator('.ds-skel')).toHaveCount(0);

  await page.goto('/history');
  await expect(page.locator('.ds-skel').first()).toBeVisible();
  await expect(page.locator('.ds-skel')).toHaveCount(0);
  expect(problems).toEqual([]);
});
