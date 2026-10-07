import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { io } from 'socket.io-client';
import { randomUUID } from 'node:crypto';
import type { BoardState } from '../src/lib/board';

const baseURL = process.env.E2E_BASE_URL || 'http://localhost:3500';
async function enter(page: Page, id: string, name: string) {
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Your guest display name' }).fill(name);
  await page.getByRole('textbox', { name: 'Board ID or invitation URL' }).fill(id);
  await page.getByRole('button', { name: 'Join board', exact: true }).click();
  await expect(page.getByText('Live & connected', { exact: true })).toBeVisible();
}
async function draw(page: Page, tool = 'Pen (P)', start = [0.2, 0.25], end = [0.45, 0.5]) {
  await page.getByRole('button', { name: tool, exact: true }).click();
  const box = (await page.locator('.canvas-sheet').boundingBox())!;
  await page.mouse.move(box.x + box.width * start[0], box.y + box.height * start[1]);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * end[0], box.y + box.height * end[1], { steps: 15 });
  await page.mouse.up();
}
async function pixels(page: Page) {
  return page.locator('.canvas-sheet canvas').nth(1).evaluate(canvas => {
    const element = canvas as HTMLCanvasElement;
    const data = element.getContext('2d')!.getImageData(0, 0, element.width, element.height).data;
    let count = 0;
    for (let index = 3; index < data.length; index += 4) if (data[index] > 0) count++;
    return count;
  });
}
async function observe(id: string) {
  const socket = io(baseURL, { transports: ['websocket'], extraHeaders: { Origin: new URL(baseURL).origin } });
  let state: BoardState = { lines: [], redoStack: [], messages: [], participants: [] };
  socket.on('current-state', data => { state = data; });
  await new Promise<void>((resolve, reject) => {
    socket.once('connect', () => socket.timeout(10000).emit('join-session', {
      sessionId: id, name: 'Test Observer', clientId: randomUUID(),
    }, (error: Error | null, ack: { ok: boolean; error?: string }) => error || !ack?.ok ? reject(error || new Error(ack.error)) : resolve()));
    socket.once('connect_error', reject);
  });
  return { socket, state: () => state };
}

test('two independent guests draw, undo without losing teammates, chat, reload, and clear', async ({ browser }) => {
  const id = `e2e-${randomUUID()}`;
  const aliceContext = await browser.newContext();
  const bobContext = await browser.newContext();
  const alice = await aliceContext.newPage();
  const bob = await bobContext.newPage();
  const observer = await observe(id);
  const errors: string[] = [];
  alice.on('pageerror', error => errors.push(error.message));
  bob.on('pageerror', error => errors.push(error.message));
  try {
    await enter(alice, id, 'Alice');
    await enter(bob, `${baseURL}/session/${id}`, 'Bob');
    await expect(alice.locator('.participant-name').filter({ hasText: 'Bob' })).toBeVisible();
    await draw(alice);
    await expect.poll(() => observer.state().lines.length).toBe(1);
    await expect.poll(() => pixels(bob)).toBeGreaterThan(50);
    await draw(bob, 'Rectangle (R)', [0.6, 0.2], [0.8, 0.4]);
    await expect.poll(() => observer.state().lines.length).toBe(2);
    await alice.getByRole('button', { name: 'Undo your last drawing (Ctrl or Command Z)' }).click();
    await expect.poll(() => observer.state().lines.map(line => line.tool)).toEqual(['rectangle']);
    await expect.poll(() => pixels(bob)).toBeGreaterThan(50);
    await alice.getByRole('button', { name: 'Redo your drawing (Ctrl or Command Shift Z)' }).click();
    await expect.poll(() => observer.state().lines.length).toBe(2);
    await alice.getByRole('textbox', { name: 'Message your collaborators' }).fill('Hello Bob, let’s build together!');
    await alice.getByRole('button', { name: 'Send message' }).click();
    await expect(bob.getByText('Hello Bob, let’s build together!', { exact: true })).toBeVisible();
    await bob.reload();
    await expect(bob.getByText('Live & connected', { exact: true })).toBeVisible();
    await expect.poll(() => pixels(bob)).toBeGreaterThan(50);
    await expect(bob.getByText('Hello Bob, let’s build together!', { exact: true })).toBeVisible();
    await alice.getByRole('button', { name: 'Clear canvas', exact: true }).click();
    await alice.getByRole('button', { name: 'Clear for everyone' }).click();
    await expect.poll(() => observer.state().lines.length).toBe(0);
    await expect.poll(() => pixels(bob)).toBe(0);
    await expect(bob.getByText('Hello Bob, let’s build together!', { exact: true })).toBeVisible();
    expect(errors).toEqual([]);
  } finally { observer.socket.disconnect(); await aliceContext.close(); await bobContext.close(); }
});

test('shape, text, eraser, shortcuts, sharing, and PNG/PDF exports work', async ({ page }) => {
  const id = `e2e-${randomUUID()}`;
  const observer = await observe(id);
  try {
    await enter(page, id, 'Designer');
    await draw(page, 'Ellipse (O)');
    await expect.poll(() => observer.state().lines.length).toBe(1);
    await page.getByRole('button', { name: 'Text (T)', exact: true }).click();
    await page.locator('.canvas-sheet').click({ position: { x: 65, y: 45 } });
    await page.getByRole('textbox', { name: 'Your text', exact: true }).fill('Interview-ready ideas');
    await page.getByRole('button', { name: 'Add to canvas' }).click();
    await expect.poll(() => observer.state().lines.length).toBe(2);
    expect(observer.state().lines[1].text).toBe('Interview-ready ideas');
    await draw(page, 'Eraser (E)');
    await expect.poll(() => observer.state().lines.length).toBe(3);
    await page.locator('.canvas-sheet').focus();
    await page.getByRole('button', { name: 'Undo your last drawing (Ctrl or Command Z)' }).click();
    await expect.poll(() => observer.state().lines.length).toBe(2);
    await page.getByRole('button', { name: 'Redo your drawing (Ctrl or Command Shift Z)' }).click();
    await expect.poll(() => observer.state().lines.length).toBe(3);
    await page.getByRole('button', { name: 'Share board' }).click();
    await expect(page.getByRole('textbox', { name: 'Invitation link' })).toHaveValue(`${baseURL}/session/${id}`);
    await page.getByRole('button', { name: 'Copy link' }).click();
    await expect(page.locator('.invite-status')).toContainText(/copied|selected/);
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    const pngPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export canvas as PNG' }).click();
    const png = await pngPromise;
    expect(png.suggestedFilename()).toMatch(/\.png$/);
    expect(await png.failure()).toBeNull();
    const pdfPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export canvas as PDF' }).click();
    const pdf = await pdfPromise;
    expect(pdf.suggestedFilename()).toMatch(/\.pdf$/);
    expect(await pdf.failure()).toBeNull();
  } finally { observer.socket.disconnect(); }
});

test('late join and separate room isolation work', async ({ page, browser }) => {
  const id = `e2e-${randomUUID()}`;
  const observer = await observe(id);
  const context = await browser.newContext();
  try {
    await enter(page, id, 'Artist');
    await draw(page);
    await expect.poll(() => observer.state().lines.length).toBe(1);
    const late = await context.newPage();
    await late.goto(`/session/${id}`);
    await expect(late.getByText('Live & connected', { exact: true })).toBeVisible();
    await expect.poll(() => pixels(late)).toBeGreaterThan(50);
    await late.goto(`/session/e2e-${randomUUID()}`);
    await expect(late.getByText('Live & connected', { exact: true })).toBeVisible();
    await expect.poll(() => pixels(late)).toBe(0);
    await draw(late);
    await expect(late.getByRole('button', { name: 'Undo your last drawing (Ctrl or Command Z)' })).toBeEnabled();
    expect(observer.state().lines.length).toBe(1);
  } finally { observer.socket.disconnect(); await context.close(); }
});

test('mobile layout, touch drawing, and chat work without horizontal overflow', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const page = await context.newPage();
  const id = `e2e-${randomUUID()}`;
  const observer = await observe(id);
  try {
    await enter(page, id, 'Mobile guest');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const sheet = page.locator('.canvas-sheet');
    const box = (await sheet.boundingBox())!;
    await page.mouse.move(box.x + 30, box.y + 30);
    await page.mouse.down();
    await page.mouse.move(box.x + 100, box.y + 80, { steps: 5 });
    await page.mouse.up();
    await expect.poll(() => observer.state().lines.length).toBe(1);
    await page.getByRole('button', { name: 'Toggle team chat' }).click();
    await expect(page.getByRole('textbox', { name: 'Message your collaborators' })).toBeVisible();
  } finally { observer.socket.disconnect(); await context.close(); }
});

test('disconnect pauses editing, then reconnect restores authoritative state', async ({ page, context }) => {
  const id = `e2e-${randomUUID()}`;
  await enter(page, id, 'Reconnect guest');
  await draw(page);
  await expect(page.getByRole('button', { name: 'Undo your last drawing (Ctrl or Command Z)' })).toBeEnabled();
  await context.setOffline(true);
  await expect(page.getByRole('button', { name: 'Pen (P)', exact: true })).toBeDisabled({ timeout: 40000 });
  await context.setOffline(false);
  await expect(page.getByText('Live & connected', { exact: true })).toBeVisible({ timeout: 30000 });
  await expect.poll(() => pixels(page)).toBeGreaterThan(50);
});

test('image classifier accepts a local image and returns a result or a useful model error', async ({ page }) => {
  await page.goto('/image-classifier');
  const onePixelPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
  await page.locator('#classifier-upload').setInputFiles({ name: 'test.png', mimeType: 'image/png', buffer: onePixelPng });
  await expect(page.getByRole('button', { name: 'Classify image' })).toBeEnabled();
  await page.getByRole('button', { name: 'Classify image' }).click();
  await expect(page.locator('.predictions li').first().or(page.getByRole('alert'))).toBeVisible({ timeout: 90000 });
});
