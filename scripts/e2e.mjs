/**
 * End-to-end check on the production build. Drives the real game in Chromium,
 * takes screenshots for the proof bundle, and asserts the loop actually works.
 *
 *   node scripts/e2e.mjs           # serves dist/ itself
 *   BASE_URL=... node scripts/e2e.mjs
 */
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const OUT = 'proof/shots';
mkdirSync(OUT, { recursive: true });

function findChrome() {
  const candidates = [
    path.join(homedir(), 'AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe'),
    path.join(homedir(), 'AppData/Local/ms-playwright/chromium-1200/chrome-win64/chrome.exe'),
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  ];
  for (const c of candidates) if (existsSync(c)) return c;
  throw new Error('no chromium found');
}

const base = process.env.BASE_URL ?? 'http://127.0.0.1:4318/';
let server = null;
if (!process.env.BASE_URL) {
  server = spawn('npx', ['vite', 'preview', '--port', '4318', '--strictPort', '--host', '127.0.0.1'], {
    stdio: 'ignore',
    shell: process.platform === 'win32',
  });
  await new Promise((r) => setTimeout(r, 2400));
}

const browser = await chromium.launch({ executablePath: findChrome(), headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });

const problems = [];
const external = [];
page.on('console', (m) => {
  if (m.type() === 'error') problems.push(m.text());
});
page.on('pageerror', (e) => problems.push(String(e)));
page.on('request', (r) => {
  const u = r.url();
  if (!u.startsWith(base) && !u.startsWith('data:') && !u.startsWith('blob:')) external.push(u);
});

let failures = 0;
const results = [];
const check = (name, ok, detail = '') => {
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
};
const state = () => page.evaluate(() => JSON.parse(JSON.stringify(window.__game.state)));
const shot = async (name) => {
  await page.screenshot({ path: `${OUT}/${name}.png` });
};
const wait = (ms) => page.waitForTimeout(ms);

async function runFireUntilOpen(maxRounds = 60) {
  for (let i = 0; i < maxRounds; i++) {
    const s = await state();
    if (s.phase !== 'fire') return s;
    if (s.event) {
      await page.click('.choice');
      await wait(120);
      continue;
    }
    if (s.shard) {
      await page.click('#shard-panel .btn');
      await wait(120);
      continue;
    }
    await page.evaluate(() => {
      const g = window.__game.game;
      // A stoker who watches the curve: vent by the size of the gap, feed when short.
      for (let t = 0; t < 6 && g.state.phase === 'fire'; t += 0.05) {
        const gap = g.target - g.state.fire.temp;
        g.setVent(gap > 0.12 ? 3 : gap > 0.04 ? 2 : gap > 0.005 ? 1 : 0);
        g.feed(gap > 0.002);
        g.update(0.05);
        if (g.state.event || g.state.shard) break;
      }
      g.feed(false);
    });
    await wait(30);
  }
  return await state();
}

try {
  const t0 = Date.now();
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.big-title', { timeout: 5000 });
  check('AC-1 title appears under 3s', Date.now() - t0 < 3000, `${Date.now() - t0}ms`);
  check('AC-1 no external requests', external.length === 0, external.join(', '));
  await wait(400);
  await shot('01-title');

  // The museum screen is reachable from the title and lists every ware.
  await page.click('text=瓷谱');
  await wait(400);
  const pedestals = await page.locator('.pedestal').count();
  check('AC-17 瓷谱 lists every ware on a pedestal', pedestals === 5, `found ${pedestals}`);
  await shot('00-codex');
  await page.click('.codex-close');
  await wait(300);

  // Title → brief → load
  await page.click('.btn-primary');
  await wait(250);
  let s = await state();
  check('AC-2 brief shown for night one', s.phase === 'brief' && s.night === 0);
  await shot('02-brief');

  await page.click('.panel .btn-primary');
  await wait(250);
  s = await state();
  const hintLoad = (await page.locator('.hint.show').textContent()) ?? '';
  check('AC-15 a hint line guides the load step', hintLoad.trim().length > 4, hintLoad.trim().slice(0, 24));
  const slotCount = await page.locator('.slot').count();
  check('AC-2 twelve chambers', slotCount === 12, `found ${slotCount}`);
  check('AC-2 tray has five pieces', (await page.locator('.card').count()) === 5);

  // Select a ware, read the verdicts.
  await page.locator('.card').first().click();
  await wait(200);
  const verdicts = await page.evaluate(() =>
    [...document.querySelectorAll('.slot')].map((el) => el.dataset.verdict ?? null),
  );
  check('AC-3 verdicts appear when a ware is selected', verdicts.filter(Boolean).length > 0);
  check(
    'AC-3 verdicts cover more than one outcome',
    new Set(verdicts.filter(Boolean)).size >= 2,
    [...new Set(verdicts.filter(Boolean))].join('/'),
  );
  await shot('03-load-verdicts');

  // Place into the middle chamber, then take it back out.
  await page.locator('.slot').nth(5).click();
  await wait(150);
  s = await state();
  check('AC-2 click places the ware', s.slots[5] !== null);
  await page.locator('.slot').nth(5).click();
  await wait(150);
  s = await state();
  check('AC-2 click again returns it to the tray', s.slots[5] === null);

  // Auto-place the rest and seal.
  await page.evaluate(() => window.__game.game.autoPlace());
  await wait(120);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === '封窑');
    if (b) b.click();
  });
  await wait(250);
  s = await state();
  check('AC-2 封窑 starts the fire', s.phase === 'fire');
  const hintFire = (await page.locator('.hint.show').textContent()) ?? '';
  check('AC-15 the hint changes with the phase', hintFire.includes('投柴') || hintFire.includes('火'), hintFire.trim().slice(0, 24));

  // Feeding raises the temperature.
  const before = (await state()).fire.temp;
  await page.mouse.move(120, 810);
  await page.locator('#feed').hover();
  await page.mouse.down();
  await wait(1800);
  await page.mouse.up();
  s = await state();
  check('AC-4 投柴 raises the heat', s.fire.temp > before + 0.01, `${before.toFixed(3)} → ${s.fire.temp.toFixed(3)}`);

  // Vent.
  await page.locator('.vent').nth(3).click();
  await wait(120);
  s = await state();
  check('AC-4 vents reach level 3', s.fire.vent === 3);
  await page.locator('.vent').nth(1).click();
  await wait(80);

  // Shard ×3 then disabled.
  for (let i = 0; i < 3; i++) {
    await page.locator('#shard').click();
    await wait(260);
    if (i === 0) await shot('04-shard');
    await page.locator('#shard-panel .btn').click();
    await wait(160);
  }
  s = await state();
  const shardDisabled = await page.locator('#shard').isDisabled();
  check('AC-7 three shards, then the button locks', s.shards === 0 && shardDisabled);

  // Run into the first event.
  for (let i = 0; i < 20; i++) {
    s = await state();
    if (s.event) break;
    await page.evaluate(() => window.__game.game.fastForward(6));
    await wait(60);
  }
  s = await state();
  check('AC-6 event card shows up mid-fire', !!s.event);
  if (s.event) {
    await shot('05-event');
    const woodBefore = s.fire.wood;
    await page.locator('.choice').first().click();
    await wait(200);
    const after = await state();
    check('AC-6 choosing an option clears the card and has an effect', !after.event && after.fired.length === 1, `wood ${woodBefore}→${after.fire.wood}`);
  }

  await shot('06-fire');

  // Finish the night.
  s = await runFireUntilOpen();
  check('AC-8 twelve 时辰 end in the kiln opening', s.phase === 'open', s.phase);
  await wait(400);
  await shot('07-open');

  // Pull one piece out by clicking it, then take the rest at once.
  const takes = await page.locator('.take').count();
  if (takes > 0) {
    await page.locator('.take').first().click();
    await wait(260);
    const after = await state();
    check('AC-16 clicking a piece pulls it out', after.revealed.length === 1, `revealed ${after.revealed.length}`);
  }
  for (let i = 0; i < 10; i++) {
    s = await state();
    if (s.phase !== 'open') break;
    await page.locator('#next').click();
    await wait(160);
  }
  s = await state();
  check('AC-9 every piece gets a verdict', s.phase === 'settle' && s.pieces.every((p) => !!p.verdict), `${s.pieces.map((p) => p.verdict).join(',')}`);
  await shot('08-settle');

  // Next night.
  await page.locator('#next').click();
  await wait(300);
  s = await state();
  check('AC-10 the night advances', s.phase === 'brief' && s.night === 1);

  // Keyboard-only run of night two.
  await page.keyboard.press('Enter');
  await wait(200);
  await page.evaluate(() => window.__game.game.autoPlace());
  await wait(100);
  await page.keyboard.press('Enter');
  await wait(200);
  s = await state();
  check('AC-11 Enter seals the kiln from the keyboard', s.phase === 'fire', s.phase);
  await page.keyboard.down('Space');
  await wait(1600);
  await page.keyboard.up('Space');
  await page.keyboard.press('3');
  await wait(120);
  s = await state();
  check('AC-11 keyboard feeds and sets the vent', s.fire.temp > 0.005 && s.fire.vent === 2, `temp ${s.fire.temp.toFixed(3)} vent ${s.fire.vent}`);

  s = await runFireUntilOpen();
  check('AC-11 keyboard night reaches the kiln opening', s.phase === 'open', s.phase);

  // Viewport sweep.
  for (const [w, h, label] of [
    [1280, 720, '1280'],
    [1920, 1080, '1920'],
    [390, 844, '390'],
  ]) {
    await page.setViewportSize({ width: w, height: h });
    await wait(350);
    const over = await page.evaluate(() => ({
      x: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      y: document.documentElement.scrollHeight - document.documentElement.clientHeight,
    }));
    check(`AC-12 ${label} has no horizontal overflow`, over.x <= 1, `overflow ${over.x}`);
    if (w === 390) await shot('09-mobile');
  }
  await page.setViewportSize({ width: 1440, height: 900 });

  check('AC-13 no console errors', problems.length === 0, problems.slice(0, 3).join(' | '));
} catch (err) {
  check('run completed without throwing', false, String(err).slice(0, 240));
  await shot('99-failure');
} finally {
  await browser.close();
  if (server) server.kill();
}

console.log(results.join('\n'));
console.log(`\n${results.length - failures}/${results.length} checks passed`);
process.exit(failures === 0 ? 0 : 1);
