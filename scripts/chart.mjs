import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
const exe = ['AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe', 'AppData/Local/ms-playwright/chromium-1200/chrome-win64/chrome.exe']
  .map((x) => path.join(homedir(), x)).find(existsSync);
const srv = spawn('python', ['-m', 'http.server', '4321', '--bind', '127.0.0.1', '--directory', 'dist'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 1200));
const b = await chromium.launch({ executablePath: exe, headless: true });
const p = await b.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
await p.goto('http://127.0.0.1:4321/');
await p.waitForTimeout(700);
await p.click('.title-actions .btn-primary');
await p.waitForTimeout(250);
await p.click('.panel .btn-primary');
await p.waitForTimeout(400);
await p.evaluate(() => window.__game.game.autoPlace());
await p.waitForTimeout(150);
await p.evaluate(() => { const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='封窑'); if(b) b.click(); });
await p.waitForTimeout(300);
// feed for 6 seconds, then look at the chart
await p.evaluate(() => { const g=window.__game.game; g.feed(true); g.fastForward(6); g.feed(false); });
await p.waitForTimeout(300);
await p.screenshot({ path: 'proof/shots/chart-start.png', clip: { x: 20, y: 90, width: 460, height: 260 } });
await b.close(); srv.kill();
