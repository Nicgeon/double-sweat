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
): Promise<{ context: BrowserContext; page: Page; problems: string[] }> {
  const { viewport, hasTouch, isMobile } = testInfo.project.use;
  const context = await browser.newContext({
    baseURL: BASE,
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
  async dispose() {
    await this.ctx.dispose();
  }
}

/** Anmeldung über die Oberfläche. */
export async function loginViaUi(page: Page, email: string, password = PASSWORD) {
  await page.goto('/login');
  await page.getByLabel('E-Mail').fill(email);
  await page.getByLabel('Passwort').fill(password);
  await page.getByRole('button', { name: 'Anmelden' }).click();
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
