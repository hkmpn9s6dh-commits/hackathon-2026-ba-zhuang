/** Capture the submission stills: a clean play-through at 1600×1000. */
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const OUT = 'submission/stills';
mkdirSync(OUT, { recursive: true });

function findChrome() {
  const candidates = [
    path.join(homedir(), 'AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe'),
    path.join(homedir(), 'AppData/Local/ms-playwright/chromium-1200/chrome-win64/chrome.exe'),
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
  ];
  for (const c of candidates) if (existsSync(c)) return c;
  throw new Error('no chromium found');
}

const base = process.env.BASE_URL ?? 'http://127.0.0.1:4191/';
let server = null;
if (!process.env.BASE_URL) {
  server = spawn('npx', ['vite', 'preview', '--port', '4191', '--strictPort', '--host', '127.0.0.1'], {
    stdio: 'ignore',
    shell: process.platform === 'win32',
  });
  await new Promise((r) => setTimeout(r, 2400));
}

const browser = await chromium.launch({ executablePath: findChrome(), headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2 });
await page.goto(base);
await page.waitForTimeout(1500);
const shot = async (name) => page.screenshot({ path: `${OUT}/${name}.png` });

const stoke = (seconds) =>
  page.evaluate((sec) => {
    const g = window.__game.game;
    for (let t = 0; t < sec && g.state.phase === 'fire'; t += 0.05) {
      const gap = g.target - g.state.fire.temp;
      g.setVent(gap > 0.12 ? 3 : gap > 0.04 ? 2 : gap > 0.005 ? 1 : 0);
      g.feed(gap > 0.002);
      g.update(0.05);
      if (g.state.event || g.state.shard) break;
    }
    g.feed(false);
  }, seconds);

await shot('00-title');

await page.click('.title-actions .btn-primary', { force: true });
await page.waitForTimeout(400);
await page.click('.panel .btn-primary');
await page.waitForTimeout(500);

// Night one: one ware selected to show the verdicts.
await page.locator('.card').nth(1).click();
await page.waitForTimeout(400);
await shot('01-load-verdicts');

await page.evaluate(() => window.__game.game.autoPlace());
await page.waitForTimeout(200);
await shot('02-load-full');

await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === '封窑');
  if (b) b.click();
});
await page.waitForTimeout(400);

let shotFire = false;
let shotEvent = false;
let shardTaken = false;
for (let i = 0; i < 90; i++) {
  const st = await page.evaluate(() => ({
    phase: window.__game.state.phase,
    event: window.__game.state.event ? window.__game.state.event.def.title : null,
    shard: !!window.__game.state.shard,
    t: window.__game.state.fire.t,
  }));
  if (st.phase !== 'fire') break;
  if (st.shard) {
    await page.locator('#shard-panel .btn').click();
    await page.waitForTimeout(150);
    continue;
  }
  if (st.event) {
    if (!shotEvent) {
      await shot('05-event');
      shotEvent = true;
    }
    await page.locator('.choice').first().click();
    await page.waitForTimeout(150);
    continue;
  }
  if (!shotFire && st.t > 55) {
    await page.waitForTimeout(200);
    await shot('03-fire');
    shotFire = true;
  }
  if (!shardTaken && st.t > 74) {
    await page.evaluate(() => window.__game.game.pullShard());
    await page.waitForTimeout(450);
    await shot('04-shard');
    shardTaken = true;
    await page.locator('#shard-panel .btn').click();
    await page.waitForTimeout(150);
    continue;
  }
  await stoke(4);
  await page.waitForTimeout(40);
}
await page.waitForTimeout(500);
await shot('06-open');

for (let i = 0; i < 10; i++) {
  const phase = await page.evaluate(() => window.__game.state.phase);
  if (phase !== 'open') break;
  await page.locator('#next').click();
  await page.waitForTimeout(180);
}
await page.waitForTimeout(800);
await shot('07-settle');

// Night two, mixed wares.
await page.locator('#next').click();
await page.waitForTimeout(300);
await page.keyboard.press('Enter');
await page.waitForTimeout(300);
await page.evaluate(() => window.__game.game.autoPlace());
await page.waitForTimeout(200);
await shot('08-night2-vases');

await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === '封窑');
  if (b) b.click();
});
await page.waitForTimeout(300);
for (let i = 0; i < 5; i++) await stoke(20);
await shot('09-night2-fire');

// Mobile.
// Clean full-bleed art for the cover: no HUD, no bar, real game state.
await page.setViewportSize({ width: 1500, height: 1000 });
await page.evaluate(() => {
  document.getElementById('hud').style.display = 'none';
  document.getElementById('bar').style.display = 'none';
  document.getElementById('app').style.gridTemplateRows = '1fr';
  const o = document.getElementById('overlay');
  if (o) o.style.display = 'none';
});
await page.waitForTimeout(900);
await page.screenshot({ path: '../ba-zhuang/submission/stills/11-cover-bg.png' });
await page.evaluate(() => {
  document.getElementById('hud').style.display = '';
  document.getElementById('bar').style.display = '';
  document.getElementById('app').style.gridTemplateRows = '';
  const o = document.getElementById('overlay');
  if (o) o.style.display = '';
});

await page.setViewportSize({ width: 400, height: 860 });
await page.waitForTimeout(500);
await shot('10-mobile');

await browser.close();
if (server) server.kill();
console.log('stills written to', OUT);
