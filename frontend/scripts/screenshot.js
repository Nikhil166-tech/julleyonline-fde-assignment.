import puppeteer from 'puppeteer-core';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(__dirname, '../dist');
const indexHtmlContent = fs.readFileSync(path.join(distDir, 'index.html'), 'utf-8');

// Static server for previewing built dist
const server = http.createServer((req, res) => {
  let reqPath = req.url.split('?')[0];

  if (reqPath === '/' || reqPath.startsWith('/boards') || reqPath.startsWith('/members')) {
    const authenticatedHtml = indexHtmlContent.replace(
      '<head>',
      `<head><script>
        localStorage.setItem('julley_token', 'demo-preview-token');
        localStorage.setItem('julley_active_org_id', 'demo-org-1');
        localStorage.setItem('julley_active_tenant_id', 'demo-tenant-1');
      </script>`
    );
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(authenticatedHtml);
    return;
  }

  let filePath = path.join(distDir, reqPath);
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(distDir, 'index.html');
  }

  const ext = path.extname(filePath);
  const contentTypes = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
  };

  res.writeHead(200, { 'Content-Type': contentTypes[ext] || 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(res);
});

server.listen(4173, '127.0.0.1', async () => {
  console.log('Static preview server active at http://127.0.0.1:4173');

  const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  const outDir = path.resolve(__dirname, '../../docs');

  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath: edgePath,
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();

    // 1. Desktop Screenshot (1440 x 900)
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
    await page.goto('http://127.0.0.1:4173/', { waitUntil: 'load' });
    await page.waitForTimeout ? page.waitForTimeout(1000) : new Promise((r) => setTimeout(r, 1000));
    const desktopPath = path.join(outDir, 'stage_a_desktop_screenshot.png');
    await page.screenshot({ path: desktopPath });
    console.log('Saved desktop screenshot:', desktopPath);

    // 2. Mobile Screenshot (390 x 844)
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    await page.goto('http://127.0.0.1:4173/', { waitUntil: 'load' });
    await new Promise((r) => setTimeout(r, 500));
    const mobilePath = path.join(outDir, 'stage_a_mobile_screenshot.png');
    await page.screenshot({ path: mobilePath });
    console.log('Saved mobile screenshot:', mobilePath);

    // 3. Login Page Screenshot (1440 x 900)
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
    await page.goto('http://127.0.0.1:4173/login', { waitUntil: 'load' });
    await new Promise((r) => setTimeout(r, 500));
    const loginPath = path.join(outDir, 'stage_a_login_screenshot.png');
    await page.screenshot({ path: loginPath });
    console.log('Saved login screenshot:', loginPath);

  } catch (err) {
    console.error('Screenshot error:', err);
  } finally {
    if (browser) await browser.close();
    server.close();
    process.exit(0);
  }
});
