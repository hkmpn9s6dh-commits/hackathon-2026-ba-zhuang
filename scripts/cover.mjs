import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const exe = ['AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe', 'AppData/Local/ms-playwright/chromium-1200/chrome-win64/chrome.exe']
  .map((x) => path.join(homedir(), x)).find(existsSync) ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const server = spawn('python', ['-m', 'http.server', '4193', '--bind', '127.0.0.1', '--directory', '.'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 1500));
const browser = await chromium.launch({ executablePath: exe, headless: true });

const big = await browser.newPage({ viewport: { width: 1500, height: 1000 }, deviceScaleFactor: 2 });
await big.goto('http://127.0.0.1:4193/submission/cover.html');
await big.waitForTimeout(1200);
await big.locator('.cover').screenshot({ path: 'submission/cover-1500x1000.png' });

const wide = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 2 });
await wide.goto('http://127.0.0.1:4193/submission/cover.html');
await wide.waitForTimeout(900);
await wide.evaluate(() => {
  const c = document.querySelector('.cover');
  c.style.transform = 'scale(0.63)';
  c.style.transformOrigin = '0 0';
});
await wide.waitForTimeout(300);
await wide.screenshot({ path: 'submission/cover-1200x630.png' });

await browser.close();
server.kill();
console.log('covers written');
