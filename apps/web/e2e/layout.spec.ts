import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { loginViaUi, makeCouple, newUserContext } from './helpers';

const LIGHT_BG = 'rgb(242, 244, 248)';
const DARK_BG = 'rgb(11, 16, 32)';

async function bg(page: Page) {
  return page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor);
}

test('Navigation: mobil Tab-Leiste, Desktop Seitenleiste', async ({ browser }, testInfo) => {
  const { annaEmail } = await makeCouple();
  const { page } = await newUserContext(browser, testInfo);
  await loginViaUi(page, annaEmail);
  await expect(page.getByRole('heading', { name: 'Heute', level: 1 })).toBeVisible();
  if (testInfo.project.name === 'mobil') {
    await expect(page.locator('.ds-nav--bottom')).toBeVisible();
    await expect(page.locator('.ds-nav--side')).toBeHidden();
    const box = await page.locator('.ds-nav--bottom').boundingBox();
    expect(box?.y ?? 0).toBeGreaterThan(700);
  } else {
    await expect(page.locator('.ds-nav--side')).toBeVisible();
    await expect(page.locator('.ds-nav--bottom')).toBeHidden();
    await expect(page.locator('.cols')).toBeVisible();
  }
  // Keine horizontale Scrollleiste
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  await page.screenshot({
    path: `e2e/screenshots/start-${testInfo.project.name}-light.png`,
    fullPage: true,
  });
});

test('Dunkelmodus: folgt dem System und lässt sich umstellen', async ({ browser }, testInfo) => {
  const { annaEmail } = await makeCouple();
  const { page, problems } = await newUserContext(browser, testInfo);
  await page.emulateMedia({ colorScheme: 'dark' });
  await loginViaUi(page, annaEmail);
  await expect(page.getByRole('heading', { name: 'Heute', level: 1 })).toBeVisible();
  expect(await bg(page)).toBe(DARK_BG);
  await page.screenshot({
    path: `e2e/screenshots/start-${testInfo.project.name}-dark.png`,
    fullPage: true,
  });

  // Manuell auf Hell stellen, auch wenn das System dunkel ist; die Wahl bleibt nach dem Neuladen
  await page.goto('/more');
  await page.getByRole('radio', { name: 'Hell' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  expect(await bg(page)).toBe(LIGHT_BG);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByRole('radio', { name: 'System' }).click();
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.+/);
  expect(await bg(page)).toBe(DARK_BG);
  expect(problems).toEqual([]);
});

test('Schriften kommen vom eigenen Server', async ({ browser }, testInfo) => {
  const { annaEmail } = await makeCouple();
  const { page } = await newUserContext(browser, testInfo);
  const external: string[] = [];
  page.on('request', (r) => {
    if (!r.url().startsWith('http://127.0.0.1')) external.push(r.url());
  });
  await loginViaUi(page, annaEmail);
  await expect(page.getByRole('heading', { name: 'Heute', level: 1 })).toBeVisible();
  const fonts = await page.evaluate(async () => {
    await document.fonts.ready;
    return [...document.fonts]
      .filter((f) => f.status === 'loaded')
      .map((f) => f.family.replaceAll('"', ''));
  });
  expect(fonts).toEqual(expect.arrayContaining(['Archivo', 'Atkinson Hyperlegible Next']));
  expect(external).toEqual([]);
});

for (const scheme of ['light', 'dark'] as const) {
  test(`Barrierefreiheit (axe) in ${scheme}`, async ({ browser }, testInfo) => {
    const { annaEmail } = await makeCouple();
    const { page } = await newUserContext(browser, testInfo);
    await page.emulateMedia({ colorScheme: scheme });
    const scan = async (name: string) => {
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      const found = results.violations.map(
        (v) =>
          `${v.id} (${v.impact}): ${v.nodes
            .map((n) => n.target.join(' '))
            .slice(0, 3)
            .join(' | ')}`,
      );
      expect(found, `${name} in ${scheme}`).toEqual([]);
    };
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Willkommen zurück.' })).toBeVisible();
    await scan('Anmeldung');
    await loginViaUi(page, annaEmail);
    await expect(page.getByRole('heading', { name: 'Heute', level: 1 })).toBeVisible();
    await scan('Start');
    for (const [path, title] of [
      ['/history', 'Verlauf'],
      ['/bet', 'Abmachung'],
      ['/more', 'Profil'],
      ['/notifications', 'Benachrichtigungen'],
    ] as const) {
      await page.goto(path);
      await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible();
      await scan(title);
    }
    await page.goto('/more');
    await page.getByRole('button', { name: 'Passwort ändern' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    // Einblenden abwarten (axe misst sonst den Kontrast bei halber Deckkraft)
    await expect(page.locator('.ds-sheet__panel')).toHaveCSS('opacity', '1');
    await scan('Sheet');
  });
}
