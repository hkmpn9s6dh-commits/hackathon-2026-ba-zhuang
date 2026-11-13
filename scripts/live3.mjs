import { chromium } from 'playwright-core';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
const exe = ['AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe', 'AppData/Local/ms-playwright/chromium-1200/chrome-win64/chrome.exe']
  .map((x) => path.join(homedir(), x)).find(existsSync);
const b = await chromium.launch({ executablePath: exe, headless: true });
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
const url = 'https://hkmpn9s6dh-commits.github.io/hackathon-2026-ba-zhuang/';
await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
await p.waitForSelector('.big-title', { timeout: 20000 });
await p.evaluate(() => localStorage.clear());
await p.reload({ waitUntil: 'domcontentloaded' });
await p.waitForSelector('.big-title');
await p.click('.title-actions .btn-primary');
await p.waitForTimeout(300);
await p.click('.panel .btn-primary');
await p.waitForTimeout(400);
await p.evaluate(() => window.__game.game.autoPlace());
await p.waitForTimeout(150);
await p.evaluate(() => { const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='封窑'); if(b) b.click(); });
await p.waitForTimeout(2200);
await p.reload({ waitUntil: 'domcontentloaded' });
await p.waitForSelector('.big-title', { timeout: 15000 });
const has = await p.locator('#continue').count();
const note = has ? await p.locator('.resume-note').textContent() : '';
console.log('live continue button:', has, '|', (note || '').trim());
if (has) {
  await p.click('#continue');
  await p.waitForTimeout(500);
  const st = await p.evaluate(() => ({ phase: window.__game.state.phase, t: window.__game.state.fire.t }));
  console.log('resumed:', JSON.stringify(st));
}
await b.close();
