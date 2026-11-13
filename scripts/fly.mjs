import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
const exe = ['AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe', 'AppData/Local/ms-playwright/chromium-1200/chrome-win64/chrome.exe']
  .map((x) => path.join(homedir(), x)).find(existsSync);
const srv = spawn('python', ['-m', 'http.server', '4322', '--bind', '127.0.0.1', '--directory', 'dist'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 1200));
const b = await chromium.launch({ executablePath: exe, headless: true });
const p = await b.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
await p.goto('http://127.0.0.1:4322/');
await p.waitForTimeout(700);
await p.click('.title-actions .btn-primary'); await p.waitForTimeout(250);
await p.click('.panel .btn-primary'); await p.waitForTimeout(300);
await p.evaluate(() => window.__game.game.autoPlace()); await p.waitForTimeout(120);
await p.evaluate(() => { const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='封窑'); if(b) b.click(); });
await p.waitForTimeout(250);
for (let i=0;i<70;i++){
  const ph = await p.evaluate(()=>window.__game.state.phase);
  if (ph!=='fire') break;
  const ev = await p.evaluate(()=>!!window.__game.state.event);
  if (ev) { await p.locator('.choice').first().click(); await p.waitForTimeout(120); continue; }
  await p.evaluate(()=>{const g=window.__game.game; for(let t=0;t<6&&g.state.phase==='fire';t+=0.05){const gap=g.target-g.state.fire.temp; g.setVent(gap>0.12?3:gap>0.04?2:gap>0.005?1:0); g.feed(gap>0.002); g.update(0.05); if(g.state.event||g.state.shard) break;} g.feed(false);});
  await p.waitForTimeout(30);
}
await p.waitForTimeout(500);
await p.locator('.take').nth(0).click();
await p.waitForTimeout(260);
await p.locator('.take').nth(0).click();
await p.waitForTimeout(180);
await p.screenshot({ path: 'proof/shots/fly.png' });
await p.waitForTimeout(900);
await p.screenshot({ path: 'proof/shots/bench.png' });
await b.close(); srv.kill();
