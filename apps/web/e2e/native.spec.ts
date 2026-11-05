import { expect, type Page, test } from '@playwright/test';
import { APP_BASE, BASE } from '../playwright.config';
import { Api, nextIp, PASSWORD, SETUP_TOKEN, uniqueEmail } from './helpers';

// Native-Build (Android-App) im Browser: Capacitor-Plugins fallen auf ihre Web-Varianten zurück
// (Speicher = localStorage). Die Live-Kamera ist dieselbe wie im Browser (Fake-Kamera von Chromium).
// Geprüft wird die Logik der App, nicht das Gerät.

async function appPage(browser: import('@playwright/test').Browser) {
  const context = await browser.newContext({
    baseURL: APP_BASE,
    viewport: { width: 390, height: 844 },
  });
  // Eigene Absender-IP pro Test (Ratenbegrenzung). Als extraHTTPHeaders würde der Header auch den CORS-Preflight
  // erweitern und von der API zu Recht abgelehnt; die Route setzt ihn nur an der eigentlichen Anfrage.
  const ip = nextIp();
  await context.route(`${BASE}/**`, (route) =>
    route.continue({ headers: { ...route.request().headers(), 'x-forwarded-for': ip } }),
  );
  const page = await context.newPage();
  const problems: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' && !/status of 401/.test(m.text()))
      problems.push(`console: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) =>
      console.error(`CSP: ${e.violatedDirective} ${e.blockedURI}`),
    );
  });
  return { context, page, problems };
}

async function connect(page: Page, address = BASE) {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Mit deinem Server verbinden.' })).toBeVisible();
  await page.getByLabel('Serveradresse').fill(address);
  await page.getByRole('button', { name: 'Verbinden' }).click();
}

const stored = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('ds_native_auth') ?? 'null'));

test('Server einrichten: falsche Adressen werden erklärt, bevor Zugangsdaten fließen', async ({
  browser,
}) => {
  const { page } = await appPage(browser);
  // Kein Double-Sweat-Server (der Test-Server der App liefert nur Dateien)
  await connect(page, APP_BASE);
  await expect(page.getByRole('alert')).toContainText('kein Double-Sweat-Server');
  // nicht erreichbar
  await page.getByLabel('Serveradresse').fill('http://127.0.0.1:1');
  await page.getByRole('button', { name: 'Verbinden' }).click();
  await expect(page.getByRole('alert')).toContainText('nicht erreichbar');
  // keine gültige Adresse
  await page.getByLabel('Serveradresse').fill('ftp://sweat.example.org');
  await page.getByRole('button', { name: 'Verbinden' }).click();
  await expect(page.getByRole('alert')).toContainText('keine gültige Adresse');
  expect(await stored(page)).toBeNull();
});

test('Team gründen mit Token-Anmeldung, Fotos mit Anmeldung laden, abmelden', async ({
  browser,
}) => {
  const { context, page, problems } = await appPage(browser);
  await connect(page);
  await expect(page.getByRole('heading', { name: 'Willkommen zurück.' })).toBeVisible();
  await expect(page.getByText('Server: 127.0.0.1:4173')).toBeVisible();

  await page.getByRole('link', { name: 'Neues Team gründen' }).click();
  await page.getByLabel('Anzeigename').fill('Anna');
  await page.getByLabel('E-Mail').fill(uniqueEmail('anna'));
  await page.getByLabel('Passwort').fill(PASSWORD);
  await page.getByLabel('Setup-Token').fill(SETUP_TOKEN);
  await page.getByRole('button', { name: 'Team gründen' }).click();
  await expect(page.getByRole('heading', { name: 'Heute', level: 1 })).toBeVisible();

  // Tokens liegen im App-Speicher, es gibt keine Cookie-Sitzung
  const auth = await stored(page);
  expect(auth).toMatchObject({ server: BASE });
  expect(auth.access).toMatch(/\S{20,}/);
  expect(auth.refresh).toMatch(/\S{20,}/);
  expect((await context.cookies()).filter((c) => c.name.includes('ds_session'))).toEqual([]);

  // Check-in mit der Live-Kamera der App (in der APK erlaubt die CAMERA-Berechtigung das Live-Bild)
  await page.goto('/checkin');
  await expect(page.getByTestId('camera')).toBeVisible();
  await page.getByRole('button', { name: 'Foto aufnehmen' }).click();
  // In der App folgt gleich das Selfie (Schalter standardmäßig an), mit Vorlauf und "Selfie überspringen"
  await expect(page.getByTestId('selfie-camera')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Selfie überspringen' })).toBeVisible();
  await expect(page.getByTestId('selfie-preview')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('img', { name: 'Dein Foto' })).toBeVisible();
  await page.getByRole('radio', { name: 'Yoga' }).click();
  await page.getByRole('button', { name: 'Einchecken' }).click();
  await expect(page.getByRole('heading', { name: 'Eingecheckt.' })).toBeVisible();

  // Das geschützte Foto wird mit Bearer-Token geladen und als blob: angezeigt
  await page.goto('/');
  for (const img of [
    page.locator('.ds-photo img:not(.selfie-inset)'),
    page.locator('.ds-photo .selfie-inset'),
  ]) {
    await expect(img).toBeVisible();
    await expect.poll(async () => (await img.getAttribute('src')) ?? '').toMatch(/^blob:/);
    expect(await img.evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(0);
  }

  // Abmelden: Tokens weg (Server bleibt), das alte Token ist am Server widerrufen
  const oldAccess = auth.access as string;
  await page.goto('/profile');
  await page.getByRole('button', { name: 'Abmelden' }).click();
  await expect(page.getByRole('heading', { name: 'Willkommen zurück.' })).toBeVisible();
  expect(await stored(page)).toMatchObject({ server: BASE, access: null, refresh: null });
  const res = await fetch(`${BASE}/api/v1/me`, {
    headers: { authorization: `Bearer ${oldAccess}` },
  });
  expect(res.status).toBe(401);
  expect(problems).toEqual([]);
});

test('abgelaufenes Access-Token wird mit dem Refresh-Token erneuert; widerrufene Sitzung führt zur Anmeldung', async ({
  browser,
}) => {
  const api = await Api.create();
  const founder = await api.founder('Anna');
  const { page, problems } = await appPage(browser);
  await connect(page);
  await page.getByLabel('E-Mail').fill(founder.email);
  await page.getByLabel('Passwort').fill(PASSWORD);
  await page.getByRole('button', { name: 'Anmelden' }).click();
  await expect(page.getByRole('heading', { name: 'Heute', level: 1 })).toBeVisible();
  const before = await stored(page);

  // Access-Token ungültig machen: der nächste Start erneuert es mit dem Refresh-Token (Rotation)
  await page.evaluate(() => {
    const a = JSON.parse(localStorage.getItem('ds_native_auth') ?? '{}');
    a.access = 'ungueltig-ungueltig-ungueltig';
    localStorage.setItem('ds_native_auth', JSON.stringify(a));
  });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Heute', level: 1 })).toBeVisible();
  const after = await stored(page);
  expect(after.access).not.toBe('ungueltig-ungueltig-ungueltig');
  expect(after.access).not.toBe(before.access);
  expect(after.refresh).not.toBe(before.refresh); // rotiert

  // Refresh-Token ungültig: zurück zur Anmeldung, Server bleibt gespeichert
  await page.evaluate(() => {
    const a = JSON.parse(localStorage.getItem('ds_native_auth') ?? '{}');
    a.access = 'x'.repeat(30);
    a.refresh = 'y'.repeat(30);
    localStorage.setItem('ds_native_auth', JSON.stringify(a));
  });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Willkommen zurück.' })).toBeVisible();
  expect(await stored(page)).toMatchObject({ server: BASE, access: null, refresh: null });
  expect(problems).toEqual([]);
});

test('Einladungslink der App: gleicher Server direkt, fremder Server nur nach Bestätigung', async ({
  browser,
}) => {
  const anna = await Api.create();
  await anna.founder('Anna');
  const { code } = await anna.invite();
  const { page } = await appPage(browser);
  await connect(page);
  await expect(page.getByRole('heading', { name: 'Willkommen zurück.' })).toBeVisible();
  const open = (url: string) =>
    page.evaluate(
      (u) => (window as unknown as { __dsOpenUrl: (u: string) => Promise<void> }).__dsOpenUrl(u),
      url,
    );

  // Ungültige Links und fremde Schemata bewirken nichts
  await open('https://evil.example/join/ABCD-EFGH-JKMN-PQRS');
  await open('doublesweat://join?s=ftp%3A%2F%2Fx&c=ABCD-EFGH-JKMN-PQRS');
  await expect(page.getByRole('dialog')).toHaveCount(0);

  // Anderer Server (hier: dieselbe API unter anderem Host-Namen): Bestätigung mit Anzeige des Hosts
  await open(`doublesweat://join?s=${encodeURIComponent('http://localhost:4173')}&c=${code}`);
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('localhost:4173');
  await dialog.getByRole('button', { name: 'Abbrechen' }).click();
  await expect(dialog).toHaveCount(0);
  expect((await stored(page)).server).toBe(BASE);

  await open(`doublesweat://join?s=${encodeURIComponent('http://localhost:4173')}&c=${code}`);
  await page.getByRole('dialog').getByRole('button', { name: 'Verbinden' }).click();
  await expect(page.getByRole('heading', { name: 'Anna lädt dich ein.' })).toBeVisible();
  expect((await stored(page)).server).toBe('http://localhost:4173');
});

test('Einladungslink des eigenen Servers öffnet die Einladung direkt, Beitritt per App', async ({
  browser,
}) => {
  const anna = await Api.create();
  await anna.founder('Anna');
  const { code } = await anna.invite();
  const { page, problems } = await appPage(browser);
  await connect(page);
  await expect(page.getByRole('heading', { name: 'Willkommen zurück.' })).toBeVisible();
  await page.evaluate(
    (u) => (window as unknown as { __dsOpenUrl: (u: string) => Promise<void> }).__dsOpenUrl(u),
    `doublesweat://join?s=${encodeURIComponent(BASE)}&c=${code}`,
  );
  await expect(page.getByRole('heading', { name: 'Anna lädt dich ein.' })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByLabel('Anzeigename').fill('Ben');
  await page.getByLabel('E-Mail').fill(uniqueEmail('ben'));
  await page.getByLabel('Passwort').fill(PASSWORD);
  await page.getByRole('button', { name: 'Beitreten' }).click();
  await expect(page.getByRole('heading', { name: 'Heute', level: 1 })).toBeVisible();
  await expect(page.locator('.ds-wlane:not(.ds-wlane--empty)')).toHaveCount(2);
  expect(problems).toEqual([]);
});

test('Server wechseln im Profil meldet ab und fragt nach einem neuen Server', async ({
  browser,
}) => {
  const api = await Api.create();
  const f = await api.founder('Anna');
  const { page } = await appPage(browser);
  await connect(page);
  await page.getByLabel('E-Mail').fill(f.email);
  await page.getByLabel('Passwort').fill(PASSWORD);
  await page.getByRole('button', { name: 'Anmelden' }).click();
  await expect(page.getByRole('heading', { name: 'Heute', level: 1 })).toBeVisible();
  await page.goto('/profile');
  await expect(page.getByText(/^Server: 127\.0\.0\.1/)).toBeVisible();
  await page.getByRole('button', { name: 'Server wechseln' }).click();
  await expect(page.getByRole('heading', { name: 'Mit deinem Server verbinden.' })).toBeVisible();
  expect(await stored(page)).toBeNull();
});
