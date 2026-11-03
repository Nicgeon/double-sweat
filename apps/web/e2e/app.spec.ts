import { expect, test } from '@playwright/test';
import {
  loginViaUi,
  makeCouple,
  newUserContext,
  PASSWORD,
  SETUP_TOKEN,
  uniqueEmail,
} from './helpers';

test('Team gründen, abmelden und wieder anmelden', async ({ browser }, testInfo) => {
  const { page, problems } = await newUserContext(browser, testInfo);
  const email = uniqueEmail('anna');
  await page.goto('/register');
  await page.getByLabel('Anzeigename').fill('Anna');
  await page.getByLabel('E-Mail').fill(email);
  await page.getByLabel('Passwort').fill(PASSWORD);
  await page.getByLabel('Setup-Token').fill(SETUP_TOKEN);
  await page.getByRole('radio', { name: 'Orchidee' }).click();
  await page.getByRole('button', { name: 'Team gründen' }).click();

  await expect(page.getByRole('heading', { name: 'Heute', level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Einladen', exact: true })).toBeVisible();
  await expect(page.locator('.ds-wlane:not(.ds-wlane--empty)')).toHaveCount(1);
  await expect(page.locator('.ds-wlane.ds-c-orchid')).toBeVisible();

  // Sitzung überlebt ein Neuladen (Cookie), Abmelden führt zur Anmeldung
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Heute', level: 1 })).toBeVisible();
  await page.goto('/more');
  // AGPL-3.0 §13: Link zum Quelltext in der Oberfläche
  await expect(
    page.getByRole('link', { name: /Quellcode und Lizenz \(AGPL-3\.0\)/ }),
  ).toHaveAttribute('href', 'https://github.com/Nicgeon/double-sweat');
  await page.getByRole('button', { name: 'Abmelden' }).click();
  await expect(page.getByRole('heading', { name: 'Willkommen zurück.' })).toBeVisible();

  // Geschützte Seiten leiten mit Rücksprung zur Anmeldung
  await page.goto('/bet');
  await expect(page).toHaveURL(/\/login\?next=%2Fbet/);
  await page.getByLabel('E-Mail').fill(email);
  await page.getByLabel('Passwort').fill('falsches passwort!!');
  await page.getByRole('button', { name: 'Anmelden' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await page.getByLabel('Passwort').fill(PASSWORD);
  await page.getByRole('button', { name: 'Anmelden' }).click();
  await expect(page.getByRole('heading', { name: 'Abmachung', level: 1 })).toBeVisible();
  expect(problems).toEqual([]);
});

test('Registrierung ohne gültiges Setup-Token wird abgelehnt', async ({ browser }, testInfo) => {
  const { page } = await newUserContext(browser, testInfo);
  await page.goto('/register');
  await page.getByLabel('Anzeigename').fill('Mallory');
  await page.getByLabel('E-Mail').fill(uniqueEmail('mallory'));
  await page.getByLabel('Passwort').fill(PASSWORD);
  await page.getByLabel('Setup-Token').fill('falsch');
  await page.getByRole('button', { name: 'Team gründen' }).click();
  await expect(page.getByRole('alert')).toContainText('Setup-Token');
});

test('Einladungslink erzeugen, Partner tritt bei, Farben bleiben verschieden', async ({
  browser,
}, testInfo) => {
  const anna = await newUserContext(browser, testInfo);
  await anna.page.goto('/register');
  await anna.page.getByLabel('Anzeigename').fill('Anna');
  await anna.page.getByLabel('E-Mail').fill(uniqueEmail('anna'));
  await anna.page.getByLabel('Passwort').fill(PASSWORD);
  await anna.page.getByLabel('Setup-Token').fill(SETUP_TOKEN);
  await anna.page.getByRole('radio', { name: 'Flut' }).click();
  await anna.page.getByRole('button', { name: 'Team gründen' }).click();
  await anna.page.getByRole('button', { name: 'Einladen' }).click();
  const link = (await anna.page.getByTestId('invite-link').textContent())?.trim() ?? '';
  expect(link).toMatch(/\/join\/[0-9A-Z-]+$/);
  await anna.page.keyboard.press('Escape');
  await expect(anna.page.getByRole('dialog')).toHaveCount(0);

  const ben = await newUserContext(browser, testInfo);
  await ben.page.goto(new URL(link).pathname);
  await expect(ben.page.getByRole('heading', { name: 'Anna lädt dich ein.' })).toBeVisible();
  // Die Farbe der einladenden Person ist gesperrt, die Standardfarbe weicht aus
  await expect(ben.page.getByRole('radio', { name: 'Flut, vergeben von Anna' })).toBeDisabled();
  await expect(ben.page.getByRole('radio', { name: 'Glut' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await ben.page.getByLabel('Anzeigename').fill('Ben');
  await ben.page.getByLabel('E-Mail').fill(uniqueEmail('ben'));
  await ben.page.getByLabel('Passwort').fill(PASSWORD);
  await ben.page.getByRole('button', { name: 'Beitreten' }).click();
  await expect(ben.page.getByRole('heading', { name: 'Heute', level: 1 })).toBeVisible();
  await expect(ben.page.locator('.ds-wlane:not(.ds-wlane--empty)')).toHaveCount(2);
  // Eigene Bahn zuerst, Platz 2 ist ein Quadrat
  await expect(ben.page.locator('.ds-wlane:not(.ds-wlane--empty)').first()).toContainText(
    'Ben (Du)',
  );
  await expect(ben.page.locator('.ds-wlane:not(.ds-wlane--empty)').first()).toHaveClass(/ds-p2/);
  await expect(ben.page.locator('.ds-wlane:not(.ds-wlane--empty)').nth(1)).toHaveClass(/ds-p1/);

  await anna.page.reload();
  await expect(anna.page.locator('.ds-wlane:not(.ds-wlane--empty)')).toHaveCount(2);
  await expect(anna.page.getByRole('button', { name: 'Einladen', exact: true })).toHaveCount(0);
  expect(anna.problems).toEqual([]);
  expect(ben.problems).toEqual([]);
});

test('Check-in mit Fake-Kamera, Foto im Feed, mehrere Check-ins am Tag zählen als ein Tag', async ({
  browser,
}, testInfo) => {
  const { annaEmail } = await makeCouple();
  const { page, problems } = await newUserContext(browser, testInfo);
  await loginViaUi(page, annaEmail);
  await expect(page.getByRole('heading', { name: 'Heute', level: 1 })).toBeVisible();
  await page.getByRole('link', { name: 'Einchecken' }).first().click();

  await expect(page.getByTestId('camera')).toBeVisible();
  await page.getByRole('button', { name: 'Foto aufnehmen' }).click();
  await expect(page.getByRole('img', { name: 'Dein Foto' })).toBeVisible();
  await page.getByRole('radio', { name: 'Laufen' }).click();
  await page.getByLabel('Notiz (optional)').fill('Schöne Runde');
  await page.getByRole('button', { name: 'Einchecken' }).click();
  await expect(page.getByRole('heading', { name: 'Eingecheckt.' })).toBeVisible();
  await expect(page.getByText('Ben sieht dein Foto.')).toBeVisible();

  await page.getByRole('link', { name: 'Zur Übersicht' }).click();
  await expect(page.locator('.ds-photo')).toHaveCount(1);
  await expect(page.locator('.ds-photo img')).toBeVisible();
  await expect(page.locator('.ds-photo')).toContainText('Laufen');
  const loaded = await page
    .locator('.ds-photo img')
    .evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0);
  expect(loaded).toBe(true);
  await expect(page.locator('.ds-wlane:not(.ds-wlane--empty)').first()).toContainText('1 Tag');

  // Foto ansehen
  await page.getByRole('button', { name: /Foto ansehen/ }).click();
  await expect(page.getByRole('dialog')).toContainText('Schöne Runde');
  await page.keyboard.press('Escape');

  // Zweites Workout am selben Tag: erlaubt, der Tag zählt für das Ziel aber nur einmal
  await page.goto('/checkin');
  await expect(page.getByTestId('camera')).toBeVisible();
  // Die Fake-Kamera blendet die Uhrzeit sekundengenau ein; zwei Fotos in derselben Sekunde wären identisch
  // und würde der Server als doppeltes Foto ablehnen.
  await page.waitForTimeout(1500);
  await page.getByRole('button', { name: 'Foto aufnehmen' }).click();
  await expect(page.getByText('Das ist dein 2. Check-in heute')).toBeVisible();
  await page.getByRole('radio', { name: 'Yoga' }).click();
  await page.getByRole('button', { name: 'Einchecken' }).click();
  await expect(page.getByRole('heading', { name: 'Eingecheckt.' })).toBeVisible();
  await expect(page.getByText('Das war dein 2. Check-in heute')).toBeVisible();
  await page.getByRole('link', { name: 'Zur Übersicht' }).click();
  await expect(page.locator('.ds-photo')).toHaveCount(2);
  await expect(page.locator('.ds-wlane:not(.ds-wlane--empty)').first()).toContainText('1 Tag');
  expect(problems).toEqual([]);
});

test('Check-in ohne Kamera: Foto auswählen als Fallback', async ({ browser }, testInfo) => {
  const { annaEmail } = await makeCouple();
  const { context, page } = await newUserContext(browser, testInfo);
  await context.clearPermissions();
  await page.addInitScript(() => {
    // Kamera nicht verfügbar
    Object.defineProperty(navigator, 'mediaDevices', { value: undefined, configurable: true });
  });
  await loginViaUi(page, annaEmail);
  await expect(page.getByRole('heading', { name: 'Heute', level: 1 })).toBeVisible();
  await page.goto('/checkin');
  await expect(page.getByText('Die Kamera ist hier nicht verfügbar')).toBeVisible();
  const jpeg = await page.evaluate(async () => {
    const c = document.createElement('canvas');
    c.width = 320;
    c.height = 240;
    const g = c.getContext('2d');
    if (g) {
      g.fillStyle = '#4a5b7a';
      g.fillRect(0, 0, 320, 240);
      g.fillStyle = '#f2b13a';
      g.fillRect(40, 40, 100, 100);
    }
    return c.toDataURL('image/jpeg', 0.9).split(',')[1];
  });
  await page.getByTestId('file-input').setInputFiles({
    name: 'foto.jpg',
    mimeType: 'image/jpeg',
    buffer: Buffer.from(jpeg ?? '', 'base64'),
  });
  await expect(page.getByRole('img', { name: 'Dein Foto' })).toBeVisible();
  await page.getByRole('button', { name: 'Einchecken' }).click();
  await expect(page.getByRole('heading', { name: 'Eingecheckt.' })).toBeVisible();
});

test('Ziel und Einsatz festlegen', async ({ browser }, testInfo) => {
  const { annaEmail } = await makeCouple();
  const { page, problems } = await newUserContext(browser, testInfo);
  await loginViaUi(page, annaEmail);
  await expect(page.getByRole('heading', { name: 'Heute', level: 1 })).toBeVisible();
  await expect(page.getByText('Wochenziel setzen', { exact: true })).toBeVisible();
  // Auch der Einsatz steht in der Starthilfe (in der Beitrittswoche noch ohne Pflicht)
  await expect(page.getByText('Deinen Einsatz festlegen', { exact: true })).toBeVisible();
  await page.goto('/bet');
  const plus = page.getByRole('button', { name: 'Einen Tag mehr' });
  await plus.click();
  await plus.click();
  await page.getByRole('button', { name: 'Ziel speichern' }).click();
  // Das erste Ziel gilt sofort (Beitrittswoche wird nicht gewertet)
  await expect(page.getByText(/Dein Ziel von \d Tagen gilt ab sofort/)).toBeVisible();
  await page.goto('/');
  await expect(page.getByText('Wochenziel setzen', { exact: true })).toHaveCount(0);
  await expect(page.locator('.ds-wlane:not(.ds-wlane--empty)').first()).toContainText('von 5');
  await page.goto('/bet');

  // Dein Einsatz: jede Person legt ihren eigenen fest, er gilt ab dieser Woche
  await expect(page.getByText('Lege deinen Einsatz fest')).toBeVisible();
  await page.getByRole('button', { name: 'Einsatz festlegen' }).click();
  await page
    .getByLabel('Was schuldest du Ben, wenn du dein Ziel verfehlst?')
    .fill('Wer verliert, kocht am Sonntag');
  await expect(page.getByLabel('Gilt ab')).toHaveValue(/^\d{4}-\d{2}-\d{2}$/);
  await page.getByRole('button', { name: 'Speichern', exact: true }).click();
  await expect(page.getByText('Gespeichert. Ben wurde benachrichtigt.')).toBeVisible();
  await expect(page.getByText('Wer verliert, kocht am Sonntag').first()).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('Lege deinen Einsatz fest')).toHaveCount(0);

  // Heute zeigt ihn gleich
  await page.goto('/');
  await expect(page.getByText('Wer verliert, kocht am Sonntag')).toBeVisible();

  // Der Einsatz bleibt editierbar und lässt sich für kommende Wochen vorab festlegen
  await page.goto('/bet');
  await page.getByRole('button', { name: 'Ändern' }).first().click();
  await page
    .getByLabel('Was schuldest du Ben, wenn du dein Ziel verfehlst?')
    .fill('Kaffee ausgeben');
  await page.getByRole('button', { name: 'Speichern', exact: true }).click();
  await expect(page.getByText('Kaffee ausgeben').first()).toBeVisible();

  await page.getByRole('button', { name: 'Für später festlegen' }).click();
  await page.getByLabel('Was schuldest du Ben, wenn du dein Ziel verfehlst?').fill('Kino zahlen');
  await page.getByRole('button', { name: 'Speichern', exact: true }).click();
  await expect(page.getByText(/KW \d+, ab .*/)).toBeVisible();
  await expect(page.getByText('Kino zahlen')).toBeVisible();
  await expect(page.getByText('Kaffee ausgeben').first()).toBeVisible(); // der laufende bleibt

  // ... und wieder zurücknehmen
  await page.getByRole('button', { name: 'Zurücknehmen' }).click();
  await expect(page.getByText('Kino zahlen')).toHaveCount(0);
  expect(problems).toEqual([]);
});

test('Anstupsen: einmal pro Stunde, Partner sieht es im Postfach', async ({
  browser,
}, testInfo) => {
  const { annaEmail, benEmail } = await makeCouple();
  const anna = await newUserContext(browser, testInfo);
  await loginViaUi(anna.page, annaEmail);
  await anna.page.getByRole('button', { name: 'Ben anstupsen' }).click();
  await expect(anna.page.getByText('Ben wurde angestupst.')).toBeVisible();
  await anna.page.getByRole('button', { name: 'Ben anstupsen' }).click();
  await expect(anna.page.getByText(/Du kannst Ben in \d+ Min\. wieder anstupsen/)).toBeVisible();

  const ben = await newUserContext(browser, testInfo);
  await loginViaUi(ben.page, benEmail);
  await expect(
    ben.page.getByRole('link', { name: /Benachrichtigungen(, 1 neu| Neu: 1)/ }),
  ).toBeVisible();
  await ben.page.getByRole('link', { name: /Benachrichtigungen/ }).click();
  await expect(ben.page.getByText(/Anna stupst dich an/)).toBeVisible();
  await ben.page.getByRole('button', { name: 'Alle gelesen' }).click();
  await expect(ben.page.getByRole('button', { name: 'Alle gelesen' })).toHaveCount(0);
});

test('Farbe wählen: wirkt sofort, die des Partners ist gesperrt', async ({ browser }, testInfo) => {
  const { annaEmail, benEmail } = await makeCouple();
  const anna = await newUserContext(browser, testInfo);
  await loginViaUi(anna.page, annaEmail);
  await anna.page.goto('/more');
  await anna.page.getByRole('radio', { name: 'Orchidee' }).click();
  await expect(anna.page.getByText('Farbe gespeichert.')).toBeVisible();
  await expect(anna.page.getByRole('radio', { name: 'Flut, vergeben von Ben' })).toBeDisabled();

  const ben = await newUserContext(browser, testInfo);
  await loginViaUi(ben.page, benEmail);
  await ben.page.goto('/more');
  await expect(ben.page.getByRole('radio', { name: 'Orchidee, vergeben von Anna' })).toBeDisabled();
  await ben.page.goto('/');
  await expect(ben.page.locator('.ds-wlane.ds-c-orchid')).toContainText('Anna');
});

test('Belohnung versprechen: Partner sieht sie und bekommt eine Mitteilung', async ({
  browser,
}, testInfo) => {
  const { annaEmail, benEmail } = await makeCouple();
  const anna = await newUserContext(browser, testInfo);
  await loginViaUi(anna.page, annaEmail);
  await anna.page.goto('/bet');
  const card = anna.page.locator('#belohnung');
  await expect(card).toContainText('Du für Ben: Noch nichts versprochen.');
  await card.getByRole('button', { name: 'Ändern' }).click();
  await anna.page
    .getByLabel('Was bekommt Ben, wenn das Wochenziel klappt?')
    .fill('Anna kocht am Sonntag');
  await anna.page.getByRole('button', { name: 'Speichern', exact: true }).click();
  await expect(anna.page.getByRole('dialog')).toHaveCount(0);
  await expect(card).toContainText('Anna kocht am Sonntag');

  const ben = await newUserContext(browser, testInfo);
  await loginViaUi(ben.page, benEmail);
  await ben.page.goto('/bet');
  await expect(ben.page.locator('#belohnung')).toContainText('Anna für dich:');
  await expect(ben.page.locator('#belohnung')).toContainText('Anna kocht am Sonntag');
  await ben.page.goto('/notifications');
  await expect(ben.page.getByText(/Anna verspricht dir eine Belohnung/)).toBeVisible();
  expect(anna.problems).toEqual([]);
  expect(ben.problems).toEqual([]);
});

test('Reaktion auf das Foto des Partners: sichtbar auf der Kachel, Mitteilung, wieder zurücknehmen', async ({
  browser,
}, testInfo) => {
  const { anna, annaEmail, benEmail } = await makeCouple();
  await anna.checkin('laufen');

  const ben = await newUserContext(browser, testInfo);
  await loginViaUi(ben.page, benEmail);
  await ben.page.getByRole('button', { name: /Foto ansehen/ }).click();
  const group = ben.page.getByRole('group', { name: /Auf das Training von Anna reagieren/ });
  const flame = group.getByRole('button', { name: 'Feuer' });
  await expect(flame).toHaveAttribute('aria-pressed', 'false');
  await flame.click();
  await expect(flame).toHaveAttribute('aria-pressed', 'true');
  await group.getByRole('button', { name: 'Stark' }).click(); // ersetzt die erste Reaktion
  await expect(group.getByRole('button', { name: 'Stark' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(flame).toHaveAttribute('aria-pressed', 'false');
  await ben.page.keyboard.press('Escape');
  await expect(ben.page.locator('.ds-photo__react')).toContainText('Ben: Stark');

  const annaPage = await newUserContext(browser, testInfo);
  await loginViaUi(annaPage.page, annaEmail);
  await expect(annaPage.page.locator('.ds-photo__react')).toContainText('Ben: Stark');
  await annaPage.page.getByRole('button', { name: /Foto ansehen/ }).click();
  await expect(annaPage.page.getByRole('dialog')).toContainText('Ben: Stark');
  // Auf das eigene Foto kann man nicht reagieren
  await expect(annaPage.page.getByRole('group', { name: /reagieren/ })).toHaveCount(0);
  await annaPage.page.keyboard.press('Escape');
  await annaPage.page.goto('/notifications');
  // Die Mitteilung kommt nur für die erste Reaktion (hier das Feuer); der Wechsel zu "Stark" erzeugt keine zweite
  await expect(annaPage.page.getByText('Ben feuert dich an.')).toBeVisible();
  await expect(annaPage.page.getByText('Ben findet dich stark.')).toHaveCount(0);

  // Erneut antippen nimmt die Reaktion zurück
  await ben.page.getByRole('button', { name: /Foto ansehen/ }).click();
  await ben.page
    .getByRole('group', { name: /reagieren/ })
    .getByRole('button', { name: 'Stark' })
    .click();
  await ben.page.keyboard.press('Escape');
  await expect(ben.page.locator('.ds-photo__react')).toHaveCount(0);
  expect(ben.problems).toEqual([]);
  expect(annaPage.problems).toEqual([]);
});

test.describe('Kamera-Fehler im Browser', () => {
  /** Lässt die ersten `fails` Aufrufe von getUserMedia mit dem Fehler `name` scheitern, danach funktioniert die Fake-Kamera. */
  async function failCamera(page: import('@playwright/test').Page, name: string, fails: number) {
    await page.addInitScript(
      ({ name, fails }) => {
        const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
        let calls = 0;
        navigator.mediaDevices.getUserMedia = (constraints) => {
          calls += 1;
          if (calls <= fails) return Promise.reject(new DOMException('test', name));
          return original(constraints);
        };
      },
      { name, fails },
    );
  }

  test('belegte Kamera: erklärt, was zu tun ist, und lässt sich danach erneut versuchen', async ({
    browser,
  }, testInfo) => {
    const { annaEmail } = await makeCouple();
    const { page, problems } = await newUserContext(browser, testInfo);
    await failCamera(page, 'NotReadableError', 3); // alle drei Versuche (hohe Auflösung, nur Seite, irgendeine) scheitern
    await loginViaUi(page, annaEmail);
    await page.goto('/checkin');
    await expect(page.getByText(/nutzt sie gerade eine andere App/)).toBeVisible();
    await expect(page.getByText('Du kannst stattdessen ein Foto auswählen.')).toBeVisible();
    // Die andere App ist geschlossen: erneut versuchen öffnet die Kamera
    await page.getByRole('button', { name: 'Kamera erneut versuchen' }).click();
    await expect(page.getByTestId('camera')).toBeVisible();
    expect(problems.filter((p) => !/NotReadable|test/.test(p))).toEqual([]);
  });

  test('klemmt nur die hohe Auflösung, gelingt der zweite Versuch ohne Fehlermeldung', async ({
    browser,
  }, testInfo) => {
    const { annaEmail } = await makeCouple();
    const { page } = await newUserContext(browser, testInfo);
    await failCamera(page, 'NotReadableError', 1);
    await loginViaUi(page, annaEmail);
    await page.goto('/checkin');
    await expect(page.getByTestId('camera')).toBeVisible();
  });

  test('verweigerter Zugriff und fehlende Kamera haben eigene Hinweise', async ({
    browser,
  }, testInfo) => {
    const { annaEmail } = await makeCouple();
    const denied = await newUserContext(browser, testInfo);
    await failCamera(denied.page, 'NotAllowedError', 9);
    await loginViaUi(denied.page, annaEmail);
    await denied.page.goto('/checkin');
    await expect(denied.page.getByText(/Der Zugriff auf die Kamera ist blockiert/)).toBeVisible();

    const missing = await newUserContext(browser, testInfo);
    await failCamera(missing.page, 'NotFoundError', 9);
    await loginViaUi(missing.page, annaEmail);
    await missing.page.goto('/checkin');
    await expect(missing.page.getByText('Es wurde keine Kamera gefunden.')).toBeVisible();
    // Die Fotoauswahl bleibt in jedem Fall möglich
    await expect(
      missing.page.getByRole('button', { name: /Foto aufnehmen oder auswählen/ }),
    ).toBeVisible();
  });
});
