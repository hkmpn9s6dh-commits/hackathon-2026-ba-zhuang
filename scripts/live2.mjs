import { chromium } from 'playwright-core';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
const exe = ['AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe', 'AppData/Local/ms-playwright/chromium-1200/chrome-win64/chrome.exe']
  .map((x) => path.join(homedir(), x)).find(existsSync);
const b = await chromium.launch({ executablePath: exe, headless: true });
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
await p.goto('https://hkmpn9s6dh-commits.github.io/hackathon-2026-ba-zhuang/', { waitUntil: 'domcontentloaded', timeout: 45000 });
await p.waitForSelector('.big-title', { timeout: 20000 });
await p.click('text=瓷谱');
await p.waitForTimeout(900);
const n = await p.locator('.pedestal').count();
console.log('live pedestals:', n);
await p.screenshot({ path: 'proof/shots/live-codex.png' });
await b.close();
