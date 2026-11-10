import { expect, type Page, test } from '@playwright/test';
import { loginViaUi, makeCouple, newUserContext } from './helpers';

// Fokus, Zoom und Belichtung der Live-Kamera. Die Fake-Kamera von Chromium kennt weder Zoom noch Belichtungskorrektur;
// darum spielt der Test ein Handy vor: Der Track meldet diese Fähigkeiten und merkt sich, was angefragt wird.

type Call = { advanced?: Record<string, unknown>[] };

/** Lässt die Kamera wie die Rückkamera eines Android-Handys aussehen (Zoom 1 bis 8, Belichtung -3 bis +3). */
async function fakePhoneCamera(page: Page, caps: Record<string, unknown> = {}) {
  await page.addInitScript((extra) => {
    const calls: unknown[] = [];
    const state: Record<string, unknown> = { zoom: 1, exposureCompensation: 0 };
    Object.assign(window, { __camCalls: calls });
    const proto = MediaStreamTrack.prototype;
    const getCapabilities = proto.getCapabilities;
    const getSettings = proto.getSettings;
    proto.getCapabilities = function () {
      return {
        ...getCapabilities.call(this),
        zoom: { min: 1, max: 8, step: 0.1 },
        exposureCompensation: { min: -3, max: 3, step: 0.5 },
        focusMode: ['manual', 'single-shot', 'continuous'],
        exposureMode: ['manual', 'continuous'],
        whiteBalanceMode: ['manual', 'continuous'],
        ...extra,
      } as MediaTrackCapabilities;
    };
    proto.getSettings = function () {
      return { ...getSettings.call(this), ...state } as MediaTrackSettings;
    };
    proto.applyConstraints = async (c?: MediaTrackConstraints) => {
      calls.push(JSON.parse(JSON.stringify(c ?? {})));
      for (const set of (c as Call | undefined)?.advanced ?? []) {
        if ('zoom' in set) state.zoom = set.zoom;
        if ('exposureCompensation' in set) state.exposureCompensation = set.exposureCompensation;
      }
    };
  }, caps);
}

const calls = (page: Page) =>
  page.evaluate(() => (window as unknown as { __camCalls: Call[] }).__camCalls);

/** Alle angefragten Einträge ("advanced") der Reihe nach. */
const entries = async (page: Page) => (await calls(page)).flatMap((c) => c.advanced ?? []);

test('Kamera stellt Fokus und Belichtung von selbst auf automatisch', async ({
  browser,
}, testInfo) => {
  const { annaEmail } = await makeCouple();
  const { page, problems } = await newUserContext(browser, testInfo);
  await fakePhoneCamera(page);
  await loginViaUi(page, annaEmail);
  await page.goto('/checkin');
  await expect(page.getByTestId('camera')).toBeVisible();
  await expect.poll(() => entries(page)).toContainEqual({ focusMode: 'continuous' });
  expect(await entries(page)).toContainEqual({ exposureMode: 'continuous' });
  expect(await entries(page)).toContainEqual({ whiteBalanceMode: 'continuous' });
  expect(problems).toEqual([]);
});

test('Zoom: der Regler stellt den Faktor ein, die Anzeige folgt', async ({ browser }, testInfo) => {
  const { annaEmail } = await makeCouple();
  const { page, problems } = await newUserContext(browser, testInfo);
  await fakePhoneCamera(page);
  await loginViaUi(page, annaEmail);
  await page.goto('/checkin');
  const tools = page.getByRole('group', { name: 'Kameraeinstellungen' });
  const zoom = tools.getByRole('slider', { name: 'Zoom' });
  await expect(zoom).toBeVisible();
  await expect(zoom).toHaveAttribute('aria-valuetext', '1,0×');
  await zoom.fill('2.5');
  await expect(zoom).toHaveAttribute('aria-valuetext', '2,5×');
  await expect(tools.getByText('2,5×')).toBeVisible();
  await expect.poll(() => entries(page)).toContainEqual({ zoom: 2.5 });
  // Nach dem Foto ist die Kamera zu, und die nächste fängt wieder bei 1× an
  await page.getByRole('button', { name: 'Foto aufnehmen' }).click();
  await expect(page.getByRole('img', { name: 'Dein Foto' })).toBeVisible();
  await page.getByRole('button', { name: 'Neues Foto' }).click();
  await expect(page.getByTestId('camera')).toBeVisible();
  await expect(tools.getByRole('slider', { name: 'Zoom' })).toHaveAttribute(
    'aria-valuetext',
    '1,0×',
  );
  expect(problems).toEqual([]);
});

test('Belichtung: Schalter öffnet den Regler, „Zurücksetzen“ stellt 0 wieder ein', async ({
  browser,
}, testInfo) => {
  const { annaEmail } = await makeCouple();
  const { page, problems } = await newUserContext(browser, testInfo);
  await fakePhoneCamera(page);
  await loginViaUi(page, annaEmail);
  await page.goto('/checkin');
  const tools = page.getByRole('group', { name: 'Kameraeinstellungen' });
  await expect(tools.getByRole('slider', { name: 'Zoom' })).toBeVisible();
  // Die Belichtung ist erst auf Wunsch da (zwei Regler übereinander wären zu viel)
  await expect(tools.getByRole('slider', { name: 'Belichtung' })).toHaveCount(0);
  const toggle = tools.getByRole('button', { name: 'Belichtung einstellen' });
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  const exposure = tools.getByRole('slider', { name: 'Belichtung' });
  await exposure.fill('1.5');
  await expect(exposure).toHaveAttribute('aria-valuetext', '+1,5');
  await expect.poll(() => entries(page)).toContainEqual({ exposureCompensation: 1.5 });
  await tools.getByRole('button', { name: 'Zurücksetzen' }).click();
  await expect(exposure).toHaveAttribute('aria-valuetext', '0,0');
  await expect(tools.getByRole('button', { name: 'Zurücksetzen' })).toHaveCount(0);
  await expect
    .poll(async () => (await entries(page)).at(-1))
    .toMatchObject({
      exposureCompensation: 0,
    });
  // Eine verstellte Belichtung bleibt beim Zoomen erhalten
  await exposure.fill('-1');
  await tools.getByRole('slider', { name: 'Zoom' }).fill('3');
  await expect
    .poll(async () => (await entries(page)).at(-1))
    .toEqual({
      zoom: 3,
      exposureCompensation: -1,
    });
  expect(problems).toEqual([]);
});

test('Tipp auf das Bild stellt dort scharf und zeigt einen Ring, danach folgt wieder der Autofokus', async ({
  browser,
}, testInfo) => {
  const { annaEmail } = await makeCouple();
  const { page, problems } = await newUserContext(browser, testInfo);
  await fakePhoneCamera(page);
  await loginViaUi(page, annaEmail);
  await page.goto('/checkin');
  await expect(page.getByTestId('camera')).toBeVisible();
  await expect(page.locator('video')).toHaveJSProperty('readyState', 4);
  const box = await page.getByTestId('camera-touch').boundingBox();
  if (!box) throw new Error('keine Fläche');
  // Zoom verstellen, damit sich zeigt, dass der Fokus-Tipp ihn nicht zurücksetzt
  await page.getByRole('slider', { name: 'Zoom' }).fill('2');
  await page.mouse.click(box.x + box.width * 0.25, box.y + box.height * 0.4);
  await expect(page.getByTestId('camera-ring')).toBeVisible();
  await expect
    .poll(async () => (await entries(page)).find((e) => e.focusMode === 'single-shot'))
    .toMatchObject({ focusMode: 'single-shot', zoom: 2 });
  const focus = (await entries(page)).find((e) => e.focusMode === 'single-shot');
  const point = ((focus?.pointsOfInterest ?? []) as { x: number; y: number }[])[0];
  // Das Kamerabild ist hier ein querformatiges Fake-Bild, an den Seiten abgeschnitten: der Punkt liegt im Bild
  expect(point?.y).toBeCloseTo(0.4, 1);
  expect(point?.x).toBeGreaterThan(0);
  expect(point?.x).toBeLessThan(0.5);
  // Der Ring verschwindet wieder
  await expect(page.getByTestId('camera-ring')).toHaveCount(0, { timeout: 5000 });
  // Nach einigen Sekunden folgt wieder der Autofokus (mit dem gewählten Zoom)
  await expect
    .poll(async () => (await entries(page)).at(-1), { timeout: 8000 })
    .toMatchObject({ focusMode: 'continuous', zoom: 2 });
  expect(problems).toEqual([]);
});

test('Zwei Finger zoomen, ein Finger stellt scharf', async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobil', 'Berührungen gibt es nur im Handy-Profil');
  const { annaEmail } = await makeCouple();
  const { page, problems } = await newUserContext(browser, testInfo);
  await fakePhoneCamera(page);
  await loginViaUi(page, annaEmail);
  await page.goto('/checkin');
  await expect(page.getByTestId('camera')).toBeVisible();
  const box = await page.getByTestId('camera-touch').boundingBox();
  if (!box) throw new Error('keine Fläche');
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const cdp = await page.context().newCDPSession(page);
  const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', spread: number) =>
    cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints:
        type === 'touchEnd'
          ? []
          : [
              { x: cx - spread, y: cy, id: 1 },
              { x: cx + spread, y: cy, id: 2 },
            ],
    });
  await touch('touchStart', 40);
  for (const spread of [60, 80, 100, 120, 160]) await touch('touchMove', spread);
  await touch('touchEnd', 0);
  // Der Abstand ist von 80 auf 320 gewachsen: vierfacher Zoom
  const zoom = page.getByRole('slider', { name: 'Zoom' });
  await expect(zoom).toHaveAttribute('aria-valuetext', '4,0×');
  await expect.poll(async () => (await entries(page)).at(-1)).toEqual({ zoom: 4 });
  // Zwei Finger lösen keinen Fokus aus
  await expect(page.getByTestId('camera-ring')).toHaveCount(0);
  expect(problems).toEqual([]);
});

test('Selfie: Fokus automatisch, aber keine Regler', async ({ browser }, testInfo) => {
  const { annaEmail } = await makeCouple();
  const { page, problems } = await newUserContext(browser, testInfo);
  await fakePhoneCamera(page);
  await loginViaUi(page, annaEmail);
  await page.goto('/checkin');
  await page.getByRole('button', { name: 'Selfie dazu aufnehmen' }).click();
  await page.getByRole('button', { name: 'Foto aufnehmen' }).click();
  await expect(page.getByTestId('selfie-camera')).toBeVisible();
  await expect(page.getByRole('group', { name: 'Kameraeinstellungen' })).toHaveCount(0);
  await expect(page.getByRole('slider')).toHaveCount(0);
  await page.getByRole('button', { name: 'Selfie überspringen' }).click();
  expect(problems).toEqual([]);
});

test('Kamera ohne Zoom und Belichtungskorrektur zeigt keine Regler', async ({
  browser,
}, testInfo) => {
  const { annaEmail } = await makeCouple();
  const { page, problems } = await newUserContext(browser, testInfo);
  await loginViaUi(page, annaEmail);
  await page.goto('/checkin');
  await expect(page.getByTestId('camera')).toBeVisible();
  await expect(page.locator('video')).toHaveJSProperty('readyState', 4);
  await expect(page.getByRole('group', { name: 'Kameraeinstellungen' })).toHaveCount(0);
  await expect(page.getByRole('slider')).toHaveCount(0);
  // Der Auslöser geht wie immer
  await page.getByRole('button', { name: 'Foto aufnehmen' }).click();
  await expect(page.getByRole('img', { name: 'Dein Foto' })).toBeVisible();
  expect(problems).toEqual([]);
});

test('Kamera, die nur Belichtung kann, zeigt deren Regler ohne Schalter', async ({
  browser,
}, testInfo) => {
  const { annaEmail } = await makeCouple();
  const { page, problems } = await newUserContext(browser, testInfo);
  await fakePhoneCamera(page, { zoom: null });
  await loginViaUi(page, annaEmail);
  await page.goto('/checkin');
  const tools = page.getByRole('group', { name: 'Kameraeinstellungen' });
  await expect(tools.getByRole('slider', { name: 'Belichtung' })).toBeVisible();
  await expect(tools.getByRole('slider', { name: 'Zoom' })).toHaveCount(0);
  await expect(tools.getByRole('button', { name: 'Belichtung einstellen' })).toHaveCount(0);
  expect(problems).toEqual([]);
});

test('Englisch: Beschriftungen der Kameraregler', async ({ browser }, testInfo) => {
  const { anna, annaEmail } = await makeCouple();
  await anna.call('patch', '/me', { locale: 'en' });
  const { page, problems } = await newUserContext(browser, testInfo, undefined, 'en-US');
  await fakePhoneCamera(page);
  await loginViaUi(page, annaEmail);
  await page.goto('/checkin');
  const tools = page.getByRole('group', { name: 'Camera settings' });
  await expect(tools.getByRole('slider', { name: 'Zoom' })).toHaveAttribute(
    'aria-valuetext',
    '1.0×',
  );
  await tools.getByRole('button', { name: 'Adjust exposure' }).click();
  await tools.getByRole('slider', { name: 'Exposure' }).fill('1');
  await expect(tools.getByRole('slider', { name: 'Exposure' })).toHaveAttribute(
    'aria-valuetext',
    '+1.0',
  );
  await expect(tools.getByRole('button', { name: 'Reset' })).toBeVisible();
  expect(problems).toEqual([]);
});
