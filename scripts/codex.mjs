import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
const exe = ['AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe', 'AppData/Local/ms-playwright/chromium-1200/chrome-win64/chrome.exe']
  .map((x) => path.join(homedir(), x)).find(existsSync);
const srv = spawn('python', ['-m', 'http.server', '4323', '--bind', '127.0.0.1', '--directory', 'dist'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 1200));
const b = await chromium.launch({ executablePath: exe, headless: true });
const p = await b.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
await p.goto('http://127.0.0.1:4323/');
await p.waitForTimeout(800);
await p.click('text=瓷谱');
await p.waitForTimeout(600);
await p.screenshot({ path: 'proof/shots/codex.png' });
await b.close(); srv.kill();
