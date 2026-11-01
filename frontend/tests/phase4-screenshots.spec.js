import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const docsDir = path.resolve(__dirname, '../../docs');

test.describe('JulleyOnline Phase 4 Screenshots Capture', () => {
  test('Capture high-fidelity screenshots of Phase 4 Real-Time Collaboration & Concurrency', async ({
    browser,
  }) => {
    const contextBob = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const contextCharlie = await browser.newContext({ viewport: { width: 1440, height: 900 } });

    const pageBob = await contextBob.newPage();
    const pageCharlie = await contextCharlie.newPage();

    try {
      // 1. Bob logs in
      await pageBob.goto('/login');
      await pageBob.fill('input[type="email"]', 'bob@acme.com');
      await pageBob.fill('input[type="password"]', 'password123');
      await pageBob.click('button[type="submit"]');
      await expect(pageBob).toHaveURL(/\/(\?boardId=.*)?$/);

      // 2. Charlie logs in and joins Bob's board
      await pageCharlie.goto('/login');
      await pageCharlie.fill('input[type="email"]', 'charlie@acme.com');
      await pageCharlie.fill('input[type="password"]', 'password123');
      await pageCharlie.click('button[type="submit"]');
      await expect(pageCharlie).toHaveURL(/\/(\?boardId=.*)?$/);

      const boardUrl = pageBob.url();
      await pageCharlie.goto(boardUrl);

      // Verify connection and presence
      await expect(pageBob.locator('[data-testid="connection-status-pill"]')).toContainText('Live');
      await expect(pageBob.locator('[data-testid="presence-avatar-stack"]')).toBeVisible();

      // Screenshot 1: Live Collaboration with Presence Avatar Stack & Undo/Redo Toolbar
      await pageBob.screenshot({ path: path.join(docsDir, 'phase4_collab_live.png') });

      // 3. Open a task in drawer to capture OCC version & fields
      const taskCard = pageBob.locator('[data-testid="task-card"]').first();
      if (await taskCard.isVisible()) {
        await taskCard.click();
        await expect(pageBob.locator('[data-testid="task-details-drawer"]')).toBeVisible();
        await pageBob.waitForTimeout(500);

        // Screenshot 2: Task Details Drawer with OCC Versioning
        await pageBob.screenshot({ path: path.join(docsDir, 'phase4_task_drawer.png') });
      }
    } finally {
      await contextBob.close();
      await contextCharlie.close();
    }
  });
});
