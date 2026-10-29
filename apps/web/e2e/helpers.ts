import {
  type APIRequestContext,
  type Browser,
  type BrowserContext,
  expect,
  type Page,
  request,
  type TestInfo,
} from '@playwright/test';
import { BASE } from '../playwright.config';

export const SETUP_TOKEN = 'e2e-setup-token-0123456789abcdef';
export const PASSWORD = 'ein sehr langes passwort';

let counter = 0;
/** Eindeutige Absenderadresse je Test (die API begrenzt Registrierungen pro IP; sie vertraut X-Forwarded-For von localhost). */
export function nextIp(): string {
  counter += 1;
  return `10.${Math.floor(Math.random() * 200) + 20}.${Math.floor(counter / 250)}.${counter % 250}`;
}
export const uniqueEmail = (name: string) =>
  `${name}.${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}@example.org`;

/** Browser-Kontext mit eigener IP, der CSP-Verstöße und Konsolenfehler sammelt. */
export async function newUserContext(
  browser: Browser,
  testInfo: TestInfo,
  ip = nextIp(),
  locale = 'de-DE',
): Promise<{ context: BrowserContext; page: Page; problems: string[] }> {
  const { viewport, hasTouch, isMobile } = testInfo.project.use;
  const context = await browser.newContext({
    baseURL: BASE,
    // Die Oberfläche folgt der Browsersprache; die meisten Tests laufen auf Deutsch
    locale,
    extraHTTPHeaders: { 'x-forwarded-for': ip },
    permissions: ['camera'],
    viewport,
    hasTouch,
    isMobile,
  });
  const page = await context.newPage();
  const problems: string[] = [];
  page.on('console', (m) => {
    // Die Sitzungsprüfung (GET /me) liefert ohne Anmeldung erwartungsgemäß 401; der Browser meldet das als Konsolenfehler
    if (m.type() === 'error' && !/status of 401/.test(m.text()))
      problems.push(`console: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => {
      console.error(`CSP: ${e.violatedDirective} ${e.blockedURI}`);
    });
  });
  return { context, page, problems };
}

/** Kleines gültiges JPEG (320×240) als Testfoto für Check-ins über die API. */
export const TEST_JPEG = Buffer.from(
  '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',
  'base64',
);

/** Minimaler API-Client für Testvorbereitung (Cookie-Sitzung mit CSRF-Header). */
export class Api {
  private csrf = '';
  private constructor(private readonly ctx: APIRequestContext) {}
  static async create(ip = nextIp()): Promise<Api> {
    return new Api(
      await request.newContext({
        baseURL: BASE,
        extraHTTPHeaders: { 'x-forwarded-for': ip, origin: BASE },
      }),
    );
  }
  async call(method: 'get' | 'post' | 'patch' | 'put' | 'delete', path: string, data?: unknown) {
    const res = await this.ctx[method](`/api/v1${path}`, {
      data,
      headers: this.csrf ? { 'x-csrf-token': this.csrf } : {},
    });
    const body = await res.json().catch(() => null);
    return { status: res.status(), body };
  }
  async founder(name = 'Anna') {
    const email = uniqueEmail(name.toLowerCase());
    const res = await this.call('post', '/auth/register', {
      email,
      password: PASSWORD,
      displayName: name,
      timezone: 'Europe/Berlin',
      setupToken: SETUP_TOKEN,
      color: 'ember',
    });
    expect(res.status).toBe(201);
    this.csrf = res.body.csrfToken;
    return { email, ...res.body };
  }
  async invite(): Promise<{ code: string; joinUrl: string }> {
    const res = await this.call('post', '/teams/invites', {});
    expect(res.status).toBe(201);
    return res.body;
  }
  /** Check-in mit Testfoto für heute; gibt die ID zurück. */
  async checkin(tag = 'kraft') {
    const res = await this.ctx.post('/api/v1/checkins', {
      multipart: { photo: { name: 'foto.jpg', mimeType: 'image/jpeg', buffer: TEST_JPEG }, tag },
      headers: { 'x-csrf-token': this.csrf },
    });
    expect(res.status()).toBe(201);
    return (await res.json()).checkin.id as string;
  }
  async dispose() {
    await this.ctx.dispose();
  }
}

/** Anmeldung über die Oberfläche. */
export async function loginViaUi(page: Page, email: string, password = PASSWORD) {
  await page.goto('/login');
  // Sprachunabhängig: die meisten Tests laufen auf Deutsch, einige im englischen Browser
  await page.getByLabel(/^E-?mail$/i).fill(email);
  await page.getByLabel(/^Passwo(rt|rd)$/).fill(password);
  await page.getByRole('button', { name: /^(Anmelden|Sign in)$/ }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
}

/** Zwei Personen im Team (Anna, Ben) über die API angelegt; Ben ist als Partner beigetreten. */
export async function makeCouple() {
  const anna = await Api.create();
  const a = await anna.founder('Anna');
  const invite = await anna.invite();
  const ben = await Api.create();
  const benEmail = uniqueEmail('ben');
  const res = await ben.call('post', '/auth/register', {
    email: benEmail,
    password: PASSWORD,
    displayName: 'Ben',
    timezone: 'Europe/Berlin',
    inviteCode: invite.code,
  });
  expect(res.status).toBe(201);
  return { anna, ben, annaEmail: a.email as string, benEmail, inviteCode: invite.code };
}
