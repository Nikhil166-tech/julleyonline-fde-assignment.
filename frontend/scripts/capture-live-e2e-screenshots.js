import puppeteer from 'puppeteer-core';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import http from 'http';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const docsDir = path.resolve(__dirname, '../../docs');

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function probeUrl(url, timeoutMs = 15000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      http
        .get(url, (res) => {
          if (res.statusCode >= 200 && res.statusCode < 400) {
            resolve();
          } else {
            retry();
          }
        })
        .on('error', () => retry());
    };
    const retry = () => {
      if (Date.now() - start > timeoutMs) {
        reject(new Error(`Timeout waiting for ${url}`));
      } else {
        setTimeout(check, 400);
      }
    };
    check();
  });
}

async function main() {
  console.log('[Screenshots] Starting backend server...');
  const backendProc = spawn('node', ['src/server.js'], {
    cwd: path.resolve(__dirname, '../../backend'),
    stdio: 'ignore',
    shell: true,
  });

  console.log('[Screenshots] Starting Vite preview server...');
  const previewProc = spawn('npx', ['vite', 'preview', '--port', '4173', '--host', '127.0.0.1'], {
    cwd: path.resolve(__dirname, '..'),
    stdio: 'ignore',
    shell: true,
  });

  try {
    await probeUrl('http://127.0.0.1:5000/api/health');
    console.log('[Screenshots] Backend is up.');
    await probeUrl('http://127.0.0.1:4173');
    console.log('[Screenshots] Frontend preview is up.');

    const browser = await puppeteer.launch({
      executablePath: edgePath,
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      defaultViewport: { width: 1440, height: 900 },
    });

    const page = await browser.newPage();

    // 1. Login
    console.log('[Screenshots] Logging in as Bob Smith...');
    await page.goto('http://127.0.0.1:4173/login', { waitUntil: 'load' });
    await page.type('input[type="email"]', 'bob@acme.com');
    await page.type('input[type="password"]', 'password123');
    await Promise.all([
      page.click('button[type="submit"]'),
      page.waitForNavigation({ waitUntil: 'load' }).catch(() => {}),
    ]);
    await wait(2000); // Allow board snapshot to hydrate

    // Capture Live Kanban Board
    console.log('[Screenshots] Capturing phase3_live_kanban.png...');
    await page.screenshot({
      path: path.join(docsDir, 'phase3_live_kanban.png'),
      fullPage: false,
    });

    // 2. Open Task Details Drawer
    console.log('[Screenshots] Opening Task Details Drawer...');
    const card = await page.waitForSelector('[data-testid="task-card"]');
    if (card) {
      await card.click();
      await page.waitForSelector('[data-testid="task-details-drawer"]');
      await wait(600);
      console.log('[Screenshots] Capturing phase3_task_drawer.png...');
      await page.screenshot({
        path: path.join(docsDir, 'phase3_task_drawer.png'),
        fullPage: false,
      });
    }

    // 3. Members Page
    console.log('[Screenshots] Navigating to /members...');
    await page.goto('http://127.0.0.1:4173/members', { waitUntil: 'load' });
    await wait(1000);
    console.log('[Screenshots] Capturing phase3_members.png...');
    await page.screenshot({
      path: path.join(docsDir, 'phase3_members.png'),
      fullPage: false,
    });

    // 4. Activity Audit Feed
    console.log('[Screenshots] Navigating to /activities...');
    await page.goto('http://127.0.0.1:4173/activities', { waitUntil: 'load' });
    await wait(1000);
    console.log('[Screenshots] Capturing phase3_activities.png...');
    await page.screenshot({
      path: path.join(docsDir, 'phase3_activities.png'),
      fullPage: false,
    });

    // 5. Settings Page
    console.log('[Screenshots] Navigating to /settings...');
    await page.goto('http://127.0.0.1:4173/settings', { waitUntil: 'load' });
    await wait(1000);
    console.log('[Screenshots] Capturing phase3_settings.png...');
    await page.screenshot({
      path: path.join(docsDir, 'phase3_settings.png'),
      fullPage: false,
    });

    await browser.close();
    console.log('[Screenshots] All live functional screenshots captured successfully in docs/!');
  } finally {
    backendProc.kill();
    previewProc.kill();
  }
}

main().catch((err) => {
  console.error('[Screenshots Error]', err);
  process.exit(1);
});
