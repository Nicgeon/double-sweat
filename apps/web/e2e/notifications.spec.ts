import { expect, test } from '@playwright/test';
import { loginViaUi, makeCouple, newUserContext } from './helpers';

test('Postfach: Tagesgruppen, Tipp führt zum Ziel und gilt als gelesen, leerer Zustand erklärt', async ({
  browser,
}, testInfo) => {
  const { ben, annaEmail, benEmail } = await makeCouple();
  // Ben macht etwas, das Anna erfährt: ein Check-in (mit Foto) und ein Anstupser
  await ben.checkin('laufen');
  await ben.call('post', '/nudges');

  const anna = await newUserContext(browser, testInfo);
  await loginViaUi(anna.page, annaEmail);
  await anna.page.goto('/notifications');
  await expect(
    anna.page.getByRole('heading', { name: 'Benachrichtigungen', level: 1 }),
  ).toBeVisible();
  // Alles von heute steht unter "Heute"; ungelesen ist markiert
  const today = anna.page.getByRole('region', { name: 'Heute' });
  await expect(today.getByText('Ben hat eingecheckt.')).toBeVisible();
  await expect(today.getByText(/Ben stupst dich an/)).toBeVisible();
  await expect(today.getByText('Ben ist deinem Team beigetreten.')).toBeVisible();
  await expect(today.getByText(/· neu/).first()).toBeVisible();

  // Der Tipp auf "hat eingecheckt" öffnet das Foto auf der Startseite und markiert die Meldung als gelesen
  await today.getByRole('link', { name: /Ben hat eingecheckt\./ }).click();
  await expect(anna.page).toHaveURL(/\/$/); // der Zusatz ?photo=… verschwindet wieder
  await expect(anna.page.getByRole('dialog')).toContainText('Ben');
  await anna.page.keyboard.press('Escape');
  await anna.page.goto('/notifications');
  await expect(anna.page.getByRole('link', { name: /Ben hat eingecheckt\./ })).not.toContainText(
    'neu',
  );
  // Der Anstupser führt zum Check-in
  await anna.page.getByRole('link', { name: /Ben stupst dich an/ }).click();
  await expect(anna.page).toHaveURL(/\/checkin$/);

  // Ben hat noch nichts bekommen: leerer Zustand sagt, was hierher kommt, und wo man es einstellt
  const benUi = await newUserContext(browser, testInfo);
  await loginViaUi(benUi.page, benEmail);
  await benUi.page.goto('/notifications');
  await expect(benUi.page.getByText('Noch nichts da.')).toBeVisible();
  await expect(
    benUi.page.getByText(/Check-ins, Anstupser, Reaktionen und das Wochenergebnis/),
  ).toBeVisible();
  await benUi.page.getByRole('link', { name: 'Einstellungen für Benachrichtigungen' }).click();
  await expect(benUi.page).toHaveURL(/\/notifications\/settings$/);
  expect(anna.problems).toEqual([]);
  expect(benUi.problems).toEqual([]);
});

test('Einstellungen: Schalter wirken sofort und bleiben, die Uhrzeit der Erinnerung ist änderbar', async ({
  browser,
}, testInfo) => {
  const { anna: annaApi, annaEmail } = await makeCouple();
  const { page, problems } = await newUserContext(browser, testInfo);
  await loginViaUi(page, annaEmail);

  // Vom Profil aus erreichbar; dort steht kein Push-Schalter mehr
  await page.goto('/profile');
  await expect(page.getByRole('switch')).toHaveCount(0);
  await page
    .getByRole('main')
    .getByRole('link', { name: /Benachrichtigungen/ })
    .click();
  await expect(page).toHaveURL(/\/notifications\/settings\?from=profile$/);
  await expect(page.getByRole('heading', { name: 'Benachrichtigungen', level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Erinnerungen' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Von Ben' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Woche und Abmachung' })).toBeVisible();

  // Standard: alles an
  const nudge = page.getByRole('switch', { name: 'Anstupser' });
  await expect(nudge).toHaveAttribute('aria-checked', 'true');
  await nudge.click();
  await expect(page.getByText('Gespeichert.')).toBeVisible();
  await expect(nudge).toHaveAttribute('aria-checked', 'false');
  expect((await annaApi.call('get', '/me')).body.user.notifications).toMatchObject({
    nudge: false,
    reaction: true,
    checkin: true,
  });
  await page.reload();
  await expect(page.getByRole('switch', { name: 'Anstupser' })).toHaveAttribute(
    'aria-checked',
    'false',
  );

  // Erinnerung: aus blendet die Uhrzeit aus, an zeigt sie wieder; die Zeit wird gespeichert
  const reminder = page.getByRole('switch', { name: 'Erinnerung am Abend' });
  await expect(page.getByLabel('Uhrzeit')).toBeVisible();
  await reminder.click();
  await expect(page.getByLabel('Uhrzeit')).toHaveCount(0);
  await reminder.click();
  await page.getByLabel('Uhrzeit').fill('18:30');
  await page.getByLabel('Uhrzeit').blur();
  await expect(page.getByText('Gespeichert.')).toBeVisible();
  const me = (await annaApi.call('get', '/me')).body.user;
  expect(me.reminderTime).toBe('18:30');
  expect(me.notifications.reminder).toBe(true);
  expect(problems).toEqual([]);
});

test('Englisch: Postfach und Einstellungen sind übersetzt, Mitteilungen folgen der Kontosprache', async ({
  browser,
}, testInfo) => {
  const { anna: annaApi, ben, annaEmail } = await makeCouple();
  await annaApi.call('patch', '/me', { locale: 'en' });
  await ben.checkin('kraft');

  const { page, problems } = await newUserContext(browser, testInfo, undefined, 'en-US');
  await loginViaUi(page, annaEmail);
  await page.goto('/notifications');
  await expect(page.getByRole('heading', { name: 'Notifications', level: 1 })).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Today' }).getByText('Ben checked in.'),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Notification settings' })).toBeVisible();

  await page.getByRole('link', { name: 'Notification settings' }).click();
  await expect(page.getByRole('heading', { name: 'Reminders' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'From Ben' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Week and agreement' })).toBeVisible();
  await expect(page.getByRole('switch', { name: 'Evening reminder' })).toBeVisible();
  await expect(page.getByRole('switch', { name: 'Ben checked in' })).toBeVisible();
  await expect(page.getByRole('switch', { name: 'Weekly result' })).toBeVisible();
  expect(problems).toEqual([]);
});

test('Alte und fremde Links: /?photo= mit unbekannter ID öffnet nichts und lässt die Startseite stehen', async ({
  browser,
}, testInfo) => {
  const { annaEmail } = await makeCouple();
  const { page, problems } = await newUserContext(browser, testInfo);
  await loginViaUi(page, annaEmail);
  await page.goto('/?photo=gibtsnicht');
  await expect(page.getByRole('heading', { name: 'Heute', level: 1 })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page).toHaveURL(/\/$/);
  expect(problems).toEqual([]);
});
