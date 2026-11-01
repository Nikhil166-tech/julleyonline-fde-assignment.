import http from 'http';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(__dirname, '../dist');

// Read built index.html and inject a mock logged-in state if requested
const indexHtmlContent = fs.readFileSync(path.join(distDir, 'index.html'), 'utf-8');

// Simple static server for dist
const server = http.createServer((req, res) => {
  let reqPath = req.url.split('?')[0];

  if (reqPath === '/' || reqPath.startsWith('/boards') || reqPath.startsWith('/members')) {
    // Inject localStorage seed so the preview displays the authenticated dashboard matching the approved design
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

server.listen(4173, '127.0.0.1', () => {
  console.log('Preview server running on http://127.0.0.1:4173');

  const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  const outPath = path.resolve(__dirname, '../../docs/stage_a_desktop_verification.png');

  try {
    console.log('Capturing screenshot with headless Edge...');
    execSync(
      `"${edgePath}" --headless=new --disable-gpu --window-size=1440,900 --screenshot="${outPath}" http://127.0.0.1:4173/`,
      { stdio: 'inherit', timeout: 15000 }
    );
    console.log('Screenshot successfully saved to:', outPath);
  } catch (err) {
    console.error('Execution warning/error:', err.message);
  } finally {
    server.close();
    process.exit(0);
  }
});
