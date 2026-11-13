import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const OUT = 'submission/slides';
mkdirSync(OUT, { recursive: true });
const exe = ['AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe', 'AppData/Local/ms-playwright/chromium-1200/chrome-win64/chrome.exe']
  .map((x) => path.join(homedir(), x)).find(existsSync)
  ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const server = spawn('python', ['-m', 'http.server', '4192', '--bind', '127.0.0.1', '--directory', '.'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 1600));

const browser = await chromium.launch({ executablePath: exe, headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 2 });
await page.goto('http://127.0.0.1:4192/submission/deck.html');
await page.waitForTimeout(1200);
const slides = await page.locator('section.slide').all();
let i = 0;
for (const s of slides) {
  i += 1;
  await s.screenshot({ path: `${OUT}/slide-${String(i).padStart(2, '0')}.png` });
}
await page.pdf({ path: 'submission/把桩-作品说明.pdf', width: '1600px', height: '900px', printBackground: true });
await browser.close();
server.kill();
console.log('slides', i);
