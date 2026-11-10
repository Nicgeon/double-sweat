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

/** Stellt der App eine Serveradresse voraus, wie sie der Build mit DS_SERVER_URL (und DS_SERVER_LOCK) fest einbaut. */
async function presetServer(page: Page, url: string, locked: boolean) {
  await page.addInitScript((p) => Object.assign(window, { __dsServerPreset: p }), { url, locked });
}

test('Server-Voreinstellung: Adresse ist vorausgefüllt, ein Tipp genügt, der Wechsel bleibt möglich', async ({
  browser,
}) => {
  const api = await Api.create();
  const f = await api.founder('Anna');
  const { page, problems } = await appPage(browser);
  await presetServer(page, BASE, false);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Mit deinem Server verbinden.' })).toBeVisible();
  await expect(page.getByLabel('Serveradresse')).toHaveValue(BASE);
  await expect(page.getByText('Diese App-Version schlägt den Server vor.')).toBeVisible();
  await page.getByRole('button', { name: 'Verbinden' }).click();
  await expect(page.getByRole('heading', { name: 'Willkommen zurück.' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'ändern' })).toBeVisible();

  await page.getByLabel('E-Mail').fill(f.email);
  await page.getByLabel('Passwort').fill(PASSWORD);
  await page.getByRole('button', { name: 'Anmelden' }).click();
  await expect(page.getByRole('heading', { name: 'Heute', level: 1 })).toBeVisible();
  await page.goto('/profile');
  await expect(page.getByRole('button', { name: 'Server wechseln' })).toBeVisible();
  await expect(page.getByText('Fest eingestellt')).toHaveCount(0);
  expect(problems).toEqual([]);
});

test('Server fest eingestellt: keine Eingabe, kein Wechsel, fremde Einladungen zählen nicht', async ({
  browser,
}) => {
  const api = await Api.create();
  const f = await api.founder('Anna');
  const { code } = await api.invite();
  const { page, problems } = await appPage(browser);
  const open = (url: string) =>
    page.evaluate(
      (u) => (window as unknown as { __dsOpenUrl: (u: string) => Promise<void> }).__dsOpenUrl(u),
      url,
    );

  // Die App war schon auf einen anderen Server eingerichtet (etwa eine ältere Version ohne Festlegung) …
  await connect(page, 'http://localhost:4173');
  await expect(page.getByRole('heading', { name: 'Willkommen zurück.' })).toBeVisible();
  expect((await stored(page)).server).toBe('http://localhost:4173');
  // … und wird jetzt in einer Version geöffnet, die auf BASE festgelegt ist: sie landet dort, ohne zu fragen
  await presetServer(page, BASE, true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Willkommen zurück.' })).toBeVisible();
  expect((await stored(page)).server).toBe(BASE);
  await expect(page.getByText('Server: 127.0.0.1:4173')).toBeVisible();
  await expect(page.getByRole('link', { name: 'ändern' })).toHaveCount(0);

  // Die Seite zum Einrichten gibt es nicht mehr
  await page.goto('/server');
  await expect(page.getByRole('heading', { name: 'Willkommen zurück.' })).toBeVisible();
  await expect(page.getByLabel('Serveradresse')).toHaveCount(0);

  // Einladung eines anderen Servers: ignoriert, kein Fenster, Server bleibt
  await open(`doublesweat://join?s=${encodeURIComponent('http://localhost:4173')}&c=${code}`);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect((await stored(page)).server).toBe(BASE);
  // Einladung des eigenen Servers funktioniert
  await open(`doublesweat://join?s=${encodeURIComponent(BASE)}&c=${code}`);
  await expect(page.getByRole('heading', { name: 'Anna lädt dich ein.' })).toBeVisible();

  await page.goto('/login');
  await page.getByLabel('E-Mail').fill(f.email);
  await page.getByLabel('Passwort').fill(PASSWORD);
  await page.getByRole('button', { name: 'Anmelden' }).click();
  await expect(page.getByRole('heading', { name: 'Heute', level: 1 })).toBeVisible();
  await page.goto('/profile');
  await expect(page.getByText(/^Server: 127\.0\.0\.1:4173 · Fest eingestellt/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Server wechseln' })).toHaveCount(0);
  expect(problems).toEqual([]);
});

test('Zurück-Knopf: erst Fenster zu, dann Unterseite zurück, Tab-Wurzel zu „Heute“, dort beenden', async ({
  browser,
}) => {
  const { page, problems } = await appPage(browser);
  await connect(page);
  await page.getByRole('link', { name: 'Neues Team gründen' }).click();
  await page.getByLabel('Anzeigename').fill('Anna');
  await page.getByLabel('E-Mail').fill(uniqueEmail('anna'));
  await page.getByLabel('Passwort').fill(PASSWORD);
  await page.getByLabel('Setup-Token').fill(SETUP_TOKEN);
  await page.getByRole('button', { name: 'Team gründen' }).click();
  await expect(page.getByRole('heading', { name: 'Heute', level: 1 })).toBeVisible();

  // Der Zurück-Knopf der App, wie ihn Capacitor meldet (canGoBack: der WebView hat Verlauf)
  const back = (canGoBack = true) =>
    page.evaluate(
      (c) => (window as unknown as { __dsBack: (c: boolean) => Promise<string> }).__dsBack(c),
      canGoBack,
    );

  await page
    .getByRole('navigation')
    .getByRole('link', { name: /Profil/ })
    .click();
  await page.getByRole('link', { name: /^Konto/ }).click();
  await expect(page.getByRole('heading', { name: 'Konto', level: 1 })).toBeVisible();

  // Ein offenes Fenster schließt zuerst, die Seite bleibt
  await page.getByRole('button', { name: 'Passwort ändern' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(await back()).toBe('overlay');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Konto', level: 1 })).toBeVisible();

  // Unterseite: einen Schritt zurück zur Liste
  expect(await back()).toBe('history');
  await expect(page.getByRole('heading', { name: 'Profil', level: 1 })).toBeVisible();
  // Tab-Wurzel: zu „Heute“
  expect(await back()).toBe('goto');
  await expect(page.getByRole('heading', { name: 'Heute', level: 1 })).toBeVisible();
  // Auf „Heute“ beendet Zurück die App (im Browser ohne Wirkung, die Seite bleibt stehen)
  expect(await back()).toBe('exit');
  await expect(page.getByRole('heading', { name: 'Heute', level: 1 })).toBeVisible();

  // Ohne Verlauf (etwa nach einem Link aus einer Mitteilung) geht es zur Seite darüber
  await page.evaluate(() =>
    (window as unknown as { __dsOpenUrl: (u: string) => Promise<void> }).__dsOpenUrl(
      'doublesweat://open?path=%2Fnotifications',
    ),
  );
  await expect(page.getByRole('heading', { name: 'Benachrichtigungen', level: 1 })).toBeVisible();
  expect(await back(false)).toBe('goto');
  await expect(page.getByRole('heading', { name: 'Heute', level: 1 })).toBeVisible();
  expect(problems).toEqual([]);
});

/** Gründet in der App ein Team (wie die Tests oben) und wartet auf „Heute“. */
async function registerInApp(page: Page) {
  await connect(page);
  await page.getByRole('link', { name: 'Neues Team gründen' }).click();
  await page.getByLabel('Anzeigename').fill('Anna');
  await page.getByLabel('E-Mail').fill(uniqueEmail('anna'));
  await page.getByLabel('Passwort').fill(PASSWORD);
  await page.getByLabel('Setup-Token').fill(SETUP_TOKEN);
  await page.getByRole('button', { name: 'Team gründen' }).click();
  await expect(page.getByRole('heading', { name: 'Heute', level: 1 })).toBeVisible();
}

/** Spielt Health Connect vor (im Testbuild liest die Brücke `window.__dsHealthFake`). */
async function fakeHealth(page: Page, fake: Record<string, unknown>) {
  await page.addInitScript((f) => Object.assign(window, { __dsHealthFake: f }), fake);
}

/**
 * Zeitpunkt vor `minutes` Minuten, aber nie vor Mitternacht: Vorschläge gelten nur für Trainings von heute, der Test
 * soll auch kurz nach Mitternacht laufen.
 */
const todayAgo = (minutes: number) => {
  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);
  return Math.max(midnight.getTime() + 60_000, Date.now() - minutes * 60_000);
};

const healthState = (page: Page) =>
  page.evaluate(
    () => (window as unknown as { __dsHealthFake: Record<string, unknown> }).__dsHealthFake,
  );

test('Health Connect: einschalten, Trainings als Vorschlag im Check-in, Übernommenes kommt nicht wieder', async ({
  browser,
}) => {
  const { page, problems } = await appPage(browser);
  await fakeHealth(page, {
    availability: 'available',
    granted: false,
    sessions: [
      { id: 'lauf', tag: 'laufen', startMs: todayAgo(180), endMs: todayAgo(120), minutes: 45 },
      { id: 'kraft', tag: 'kraft', startMs: todayAgo(480), endMs: todayAgo(450), minutes: 30 },
    ],
  });
  await registerInApp(page);

  // Profil: die Zeile gibt es nur in der App, anfangs aus
  await page
    .getByRole('navigation')
    .getByRole('link', { name: /Profil/ })
    .click();
  const row = page.getByRole('main').getByRole('link', { name: /^Health Connect/ });
  await expect(row).toContainText('Aus');
  await row.click();
  await expect(page.getByRole('heading', { name: 'Health Connect', level: 1 })).toBeVisible();
  const toggle = page.getByRole('switch', { name: 'Trainings als Vorschlag beim Check-in' });
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  await expect(page.getByText('Gefundene Trainings')).toHaveCount(0);

  // Einschalten fragt die Erlaubnis ab; danach stehen die gefundenen Trainings da
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  const found = page.getByRole('region', { name: /Gefundene Trainings/ });
  await expect(found).toContainText('Laufen');
  await expect(found).toContainText('45 min');
  await expect(found).toContainText('Kraft');
  await expect(found).toContainText('30 min');
  await page.getByRole('button', { name: 'Health Connect öffnen' }).click();
  expect((await healthState(page)).opened).toBe(1);
  await page.getByRole('link', { name: 'Zurück' }).first().click();
  await expect(page.getByRole('main').getByRole('link', { name: /^Health Connect/ })).toContainText(
    'Trainings als Vorschlag',
  );

  // Check-in (innerhalb der App navigieren, damit der vorgespielte Stand bleibt)
  await page.getByRole('navigation').getByRole('link', { name: /Heute/ }).click();
  await page.locator('a.ds-fab').click();
  await expect(page.getByTestId('camera')).toBeVisible();
  await page.getByRole('button', { name: 'Foto aufnehmen' }).click();
  await page.getByRole('button', { name: 'Selfie überspringen' }).click();
  await expect(page.getByRole('img', { name: 'Dein Foto' })).toBeVisible();

  const suggestions = page.getByRole('radiogroup', { name: 'Aus Health Connect' });
  await expect(suggestions.getByRole('radio')).toHaveCount(2);
  const run = suggestions.getByRole('radio', { name: /^Laufen · 45 min/ });
  await run.click();
  await expect(run).toHaveAttribute('aria-checked', 'true');
  // Ein Tipp wählt die Sportart und schreibt die Dauer sichtbar in die Notiz
  await expect(
    page.getByRole('radiogroup', { name: 'Training' }).getByRole('radio', { name: 'Laufen' }),
  ).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByLabel('Notiz (optional)')).toHaveValue('45 min');
  // Wählt man selbst eine andere Sportart, gilt der Vorschlag nicht mehr als gewählt
  await page
    .getByRole('radiogroup', { name: 'Training' })
    .getByRole('radio', { name: 'Rad' })
    .click();
  await expect(run).toHaveAttribute('aria-checked', 'false');
  // … und die Dauer, die der Vorschlag eingetragen hatte, geht mit
  await expect(page.getByLabel('Notiz (optional)')).toHaveCount(0);
  await run.click();
  await page.getByRole('button', { name: 'Einchecken' }).click();
  await expect(page.getByRole('heading', { name: 'Eingecheckt.' })).toBeVisible();

  // Das Foto steht mit Sportart und Dauer im Feed
  await page.getByRole('link', { name: 'Fertig' }).click();
  await expect(page.locator('.ds-photo')).toContainText('Laufen');
  await page.getByRole('button', { name: /Foto ansehen/ }).click();
  await expect(page.getByRole('dialog')).toContainText('45 min');
  await page.keyboard.press('Escape');

  // Das übernommene Training wird nicht noch einmal vorgeschlagen, das andere schon
  await page.getByRole('link', { name: 'Noch ein Check-in' }).first().click();
  await expect(page.getByTestId('camera')).toBeVisible();
  await page.waitForTimeout(1100); // die Fake-Kamera zeigt die Sekunde: zwei gleiche Fotos lehnt der Server ab
  await page.getByRole('button', { name: 'Foto aufnehmen' }).click();
  await page.getByRole('button', { name: 'Selfie überspringen' }).click();
  await expect(page.getByRole('img', { name: 'Dein Foto' })).toBeVisible();
  const again = page.getByRole('radiogroup', { name: 'Aus Health Connect' });
  await expect(again.getByRole('radio')).toHaveCount(1);
  await expect(again.getByRole('radio', { name: /^Kraft · 30 min/ })).toBeVisible();
  expect(problems).toEqual([]);
});

/** Health Connect ist schon eingeschaltet und erlaubt (wie nach dem ersten Einrichten), dazu die Trainings von heute. */
async function healthOn(page: Page, sessions: Record<string, unknown>[]) {
  await fakeHealth(page, { availability: 'available', granted: true, sessions });
  await page.addInitScript(() => localStorage.setItem('ds_health', '1'));
}

test('Health Connect: Heute schlägt ein erkanntes Training als Check-in vor, ein Tipp trägt Sportart und Dauer ein', async ({
  browser,
}) => {
  const { page, problems } = await appPage(browser);
  await healthOn(page, [
    { id: 'lauf', tag: 'laufen', startMs: todayAgo(75), endMs: todayAgo(30), minutes: 45 },
    { id: 'kraft', tag: 'kraft', startMs: todayAgo(480), endMs: todayAgo(450), minutes: 30 },
  ]);
  await registerInApp(page);

  // Das jüngste Training steht als Karte auf „Heute“, das andere ist nur ein Hinweis darunter
  const card = page.getByRole('region', { name: 'Training erkannt' });
  await expect(card).toContainText('Laufen');
  await expect(card).toContainText('45 min');
  await expect(card).toContainText('+1 weiteres Training heute');

  // Ein Tipp führt in die Kamera; in der Vorschau ist alles schon eingetragen
  await card.getByRole('link', { name: 'Einchecken' }).click();
  await expect(page).toHaveURL(/\/checkin\?hc=lauf$/);
  await expect(page.getByTestId('camera')).toBeVisible();
  await page.getByRole('button', { name: 'Foto aufnehmen' }).click();
  await page.getByRole('button', { name: 'Selfie überspringen' }).click();
  await expect(page.getByRole('img', { name: 'Dein Foto' })).toBeVisible();
  await expect(
    page
      .getByRole('radiogroup', { name: 'Aus Health Connect' })
      .getByRole('radio', { name: /^Laufen · 45 min/ }),
  ).toHaveAttribute('aria-checked', 'true');
  await expect(
    page.getByRole('radiogroup', { name: 'Training' }).getByRole('radio', { name: 'Laufen' }),
  ).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByLabel('Notiz (optional)')).toHaveValue('45 min');
  await page.getByRole('button', { name: 'Einchecken' }).click();
  await expect(page.getByRole('heading', { name: 'Eingecheckt.' })).toBeVisible();

  // Zurück auf „Heute“: der Lauf ist übernommen, das Krafttraining bleibt als nächster Vorschlag
  await page.getByRole('link', { name: 'Fertig' }).click();
  await expect(card).toContainText('Kraft');
  await expect(card).not.toContainText('Laufen');
  await expect(card).not.toContainText('weitere');

  // Ausblenden: weg, auch nach dem Neuladen
  await card.getByRole('button', { name: 'Ausblenden' }).click();
  await expect(card).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Heute', level: 1 })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Training erkannt' })).toHaveCount(0);
  expect(problems).toEqual([]);
});

test('Health Connect: ein Check-in ohne Vorschlag deckt das Training zu, es wird danach nicht noch einmal vorgeschlagen', async ({
  browser,
}) => {
  const { page, problems } = await appPage(browser);
  await healthOn(page, [
    { id: 'lauf', tag: 'laufen', startMs: todayAgo(75), endMs: todayAgo(30), minutes: 45 },
  ]);
  await registerInApp(page);
  await expect(page.getByRole('region', { name: 'Training erkannt' })).toBeVisible();

  // Check-in über den Knopf in der Leiste, den Vorschlag lässt man links liegen
  await page.locator('a.ds-fab').click();
  await expect(page.getByTestId('camera')).toBeVisible();
  await page.getByRole('button', { name: 'Foto aufnehmen' }).click();
  await page.getByRole('button', { name: 'Selfie überspringen' }).click();
  await page.getByRole('radio', { name: 'Yoga' }).click();
  await page.getByRole('button', { name: 'Einchecken' }).click();
  await expect(page.getByRole('heading', { name: 'Eingecheckt.' })).toBeVisible();
  await page.getByRole('link', { name: 'Fertig' }).click();
  await expect(page.getByRole('heading', { name: 'Heute', level: 1 })).toBeVisible();
  await expect(page.locator('.ds-photo')).toContainText('Yoga');
  await expect(page.getByRole('region', { name: 'Training erkannt' })).toHaveCount(0);
  expect(problems).toEqual([]);
});

test('Health Connect: ohne Training von heute gibt es keine Karte', async ({ browser }) => {
  const { page, problems } = await appPage(browser);
  // Eingeschaltet, aber das einzige Training endete gestern: ein Check-in zählt nur für heute
  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);
  const yesterday = midnight.getTime() - 3600_000;
  await healthOn(page, [
    { id: 'gestern', tag: 'rad', startMs: yesterday - 3600_000, endMs: yesterday, minutes: 60 },
  ]);
  await registerInApp(page);
  await expect(page.getByRole('region', { name: 'Training erkannt' })).toHaveCount(0);
  expect(problems).toEqual([]);
});

test('Health Connect: nicht vorhanden oder Erlaubnis verweigert erklärt, was zu tun ist', async ({
  browser,
}) => {
  const missing = await appPage(browser);
  await fakeHealth(missing.page, { availability: 'unavailable' });
  await registerInApp(missing.page);
  await missing.page
    .getByRole('navigation')
    .getByRole('link', { name: /Profil/ })
    .click();
  await missing.page.getByRole('link', { name: /^Health Connect/ }).click();
  await expect(
    missing.page.getByText(/Health Connect ist auf diesem Gerät nicht vorhanden/),
  ).toBeVisible();
  await expect(
    missing.page.getByRole('switch', { name: 'Trainings als Vorschlag beim Check-in' }),
  ).toBeDisabled();
  await missing.page.getByRole('button', { name: 'Im Play Store öffnen' }).click();
  expect((await healthState(missing.page)).store).toBe(1);

  const denied = await appPage(browser);
  await fakeHealth(denied.page, { availability: 'available', granted: false, deny: true });
  await registerInApp(denied.page);
  await denied.page
    .getByRole('navigation')
    .getByRole('link', { name: /Profil/ })
    .click();
  await denied.page.getByRole('link', { name: /^Health Connect/ }).click();
  const toggle = denied.page.getByRole('switch', { name: 'Trainings als Vorschlag beim Check-in' });
  await toggle.click();
  await expect(denied.page.getByText(/Der Zugriff wurde nicht erlaubt/)).toBeVisible();
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  await denied.page.getByRole('button', { name: 'Health Connect öffnen' }).click();
  expect((await healthState(denied.page)).opened).toBe(1);
  expect(missing.problems).toEqual([]);
  expect(denied.problems).toEqual([]);
});

test('Health Connect: der Datenschutzhinweis von Health Connect öffnet die Seite der App', async ({
  browser,
}) => {
  const { page, problems } = await appPage(browser);
  await fakeHealth(page, { availability: 'available', granted: false });
  await registerInApp(page);
  await page.evaluate(() =>
    (window as unknown as { __dsOpenUrl: (u: string) => Promise<void> }).__dsOpenUrl(
      'doublesweat://open?path=%2Fprofile%2Fhealth',
    ),
  );
  await expect(page.getByRole('heading', { name: 'Health Connect', level: 1 })).toBeVisible();
  await expect(page.getByText(/Gelesen werden nur Trainings der letzten 24 Stunden/)).toBeVisible();
  expect(problems).toEqual([]);
});
