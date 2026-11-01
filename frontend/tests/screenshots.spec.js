import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const docsDir = path.resolve(__dirname, '../../docs');

test.describe('JulleyOnline Phase 3 Live Screenshots Capture', () => {
  test('Capture high-fidelity screenshots of all functional Phase 3 screens', async ({ page }) => {
    // 1. Login Screen
    await page.goto('/login');
    await page.screenshot({ path: path.join(docsDir, 'phase3_01_login.png') });

    // 2. Log in as Bob Smith
    await page.fill('input[type="email"]', 'bob@acme.com');
    await page.fill('input[type="password"]', 'password123');
    await page.click('button[type="submit"]');

    await expect(page).toHaveURL(/\/(\?boardId=.*)?$/);
    await expect(page.locator('header')).toContainText('Bob Smith');
    await expect(page.locator('header')).toContainText('Tenant Admin');

    // 3. Create a clean demo board with real tasks
    await page.click('a[href="/boards"]');
    await expect(page).toHaveURL('/boards');

    // Screenshot of Boards Page
    await page.screenshot({ path: path.join(docsDir, 'phase3_02_boards.png') });

    const demoBoard = `Sprint 24 — Engineering Roadmap ${Date.now()}`;
    await page.click('button:has-text("Create Board")');
    await page.fill('input[placeholder="e.g. Q4 Sprint Roadmap"]', demoBoard);
    await page.click('button[type="submit"]:has-text("Create Board")');

    await expect(page.locator(`text=${demoBoard}`).first()).toBeVisible();
    await page.click(`text=${demoBoard}`);
    await expect(page).toHaveURL(/\/\?boardId=/);

    // 4. Create 3 realistic tasks across columns
    const tasks = [
      {
        title: 'Implement Optimistic Concurrency Control (OCC)',
        desc: 'Atomic version matching in PostgreSQL transactions with HTTP 409 Conflict protocol.',
      },
      {
        title: 'Integrate Tenant & Organization Scoped RBAC',
        desc: 'Prevent cross-tenant access and enforce Org Admin, Tenant Admin, and Member permissions.',
      },
      {
        title: 'Build Responsive Design System & Drawer',
        desc: 'Pixel-perfect replication of approved SaaS UI reference with Tailwind tokens.',
      },
    ];

    for (const t of tasks) {
      await page.click('button:has-text("Add Task")');
      const modal = page.locator('div[role="dialog"]');
      await expect(modal).toBeVisible();
      await modal.locator('input[placeholder="e.g. Implement Optimistic Locking"]').fill(t.title);
      await modal.locator('textarea[placeholder="Add detailed task notes or specifications..."]').fill(t.desc);
      await modal.locator('button[type="submit"]:has-text("Create Task")').click();
      await expect(page.locator(`[data-testid="task-card"]:has-text("${t.title}")`)).toBeVisible();
    }

    // Capture Live Kanban Board
    await page.screenshot({ path: path.join(docsDir, 'phase3_03_kanban_board.png') });

    // 5. Open Task Details Drawer on the first task
    const firstCard = page.locator(`[data-testid="task-card"]:has-text("${tasks[0].title}")`);
    await firstCard.click();
    const drawer = page.locator('[data-testid="task-details-drawer"]');
    await expect(drawer).toBeVisible();

    // Capture Task Details Drawer
    await page.screenshot({ path: path.join(docsDir, 'phase3_04_task_drawer.png') });

    // Close drawer
    await drawer.locator('button[title="Close drawer"]').click();

    // 6. Navigate to Members Page
    await page.click('a[href="/members"]');
    await expect(page).toHaveURL('/members');
    await expect(page.locator('h1')).toContainText('Members');
    await page.screenshot({ path: path.join(docsDir, 'phase3_05_members.png') });

    // 7. Navigate to Activity Feed
    await page.click('a[href="/activity"]');
    await expect(page).toHaveURL('/activity');
    await expect(page.locator('h1')).toContainText('Activity History');
    await page.screenshot({ path: path.join(docsDir, 'phase3_06_activities.png') });

    // 8. Navigate to Settings Page
    await page.click('a[href="/settings"]');
    await expect(page).toHaveURL('/settings');
    await expect(page.locator('h1')).toContainText('Settings');
    await page.screenshot({ path: path.join(docsDir, 'phase3_07_settings.png') });
  });
});
