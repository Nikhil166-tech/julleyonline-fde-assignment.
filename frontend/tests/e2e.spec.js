import { test, expect } from '@playwright/test';

test.describe('JulleyOnline End-to-End Real Persistence & RBAC Test Suite', () => {
  test.beforeEach(async ({ page }) => {
    page.on('console', (msg) => console.log('[BROWSER]', msg.type(), msg.text()));
    page.on('pageerror', (err) => console.log('[BROWSER ERROR]', err.message));
    // Clear localStorage to start fresh
    await page.goto('/login');
    await page.evaluate(() => localStorage.clear());
  });

  test('E2E-01: User Login with seeded credentials hydrates session and workspace context', async ({ page }) => {
    await page.goto('/login');

    // Fill login credentials
    await page.fill('input[type="email"]', 'bob@acme.com');
    await page.fill('input[type="password"]', 'password123');
    await page.click('button[type="submit"]');

    // Should redirect to dashboard
    await expect(page).toHaveURL(/\/(\?boardId=.*)?$/);

    // Verify header profile displays Bob Smith and Tenant Admin role
    await expect(page.locator('header')).toContainText('Bob Smith');
    await expect(page.locator('header')).toContainText('Tenant Admin');

    // Verify organization and tenant selectors are populated
    await expect(page.locator('header')).toContainText('Acme Technologies');
    await expect(page.locator('header')).toContainText('Engineering & Product');
  });

  test('E2E-02: Board & Task CRUD with real PostgreSQL persistence and refresh verification', async ({ page }) => {
    // 1. Log in as Bob
    await page.goto('/login');
    await page.fill('input[type="email"]', 'bob@acme.com');
    await page.fill('input[type="password"]', 'password123');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/(\?boardId=.*)?$/);

    // 2. Open Board List
    await page.click('a[href="/boards"]');
    await expect(page).toHaveURL('/boards');

    // 3. Create a unique test board
    const boardName = `E2E Board ${Date.now()}`;
    await page.click('button:has-text("Create Board")');
    await page.fill('input[placeholder="e.g. Q4 Sprint Roadmap"]', boardName);
    await page.click('button[type="submit"]:has-text("Create Board")');

    // Verify board is created and rendered in board list
    await expect(page.locator(`text=${boardName}`)).toBeVisible();

    // 4. Click to open board workspace
    await page.click(`text=${boardName}`);
    await expect(page).toHaveURL(/\/\?boardId=/);
    await expect(page.locator('h1')).toContainText(boardName);

    // Verify default workflow columns exist: Backlog, In Progress, Done
    await expect(page.locator('h3:has-text("Backlog")')).toBeVisible();
    await expect(page.locator('h3:has-text("In Progress")')).toBeVisible();
    await expect(page.locator('h3:has-text("Done")')).toBeVisible();

    // 5. Create a new task in Backlog
    const taskTitle = `E2E Live Task ${Date.now()}`;
    await page.click('button:has-text("Add Task")');
    const taskModal = page.locator('div[role="dialog"]');
    await expect(taskModal).toBeVisible();
    await taskModal.locator('input[placeholder="e.g. Implement Optimistic Locking"]').fill(taskTitle);
    await taskModal.locator('textarea[placeholder="Add detailed task notes or specifications..."]').fill('Verifying real PostgreSQL persistence');
    await taskModal.locator('button[type="submit"]:has-text("Create Task")').click();

    // Verify task appears on the board under Backlog with version v1
    const taskCard = page.locator(`[data-testid="task-card"]:has-text("${taskTitle}")`);
    await expect(taskCard).toBeVisible();
    await expect(taskCard).toContainText('v1');

    // 6. REAL DATABASE PERSISTENCE CHECK: Reload the page
    await page.reload();
    await expect(page.locator('h1')).toContainText(boardName);
    const persistedCard = page.locator(`[data-testid="task-card"]:has-text("${taskTitle}")`);
    await expect(persistedCard).toBeVisible();
    await expect(persistedCard).toContainText('v1');

    // 7. Click task card to open Task Details Drawer
    await persistedCard.click();
    const drawer = page.locator('[data-testid="task-details-drawer"]');
    await expect(drawer).toBeVisible();

    // 8. Edit task title and trigger in-place mutation
    const updatedTitle = `${taskTitle} (Updated)`;
    const titleInput = drawer.locator('input[value*="E2E Live Task"]');
    await titleInput.fill(updatedTitle);
    await titleInput.blur(); // Triggers handleFieldSave on blur

    // Verify version bumps to v2 after successful update
    await expect(drawer).toContainText('v2');

    // Close drawer
    await drawer.locator('button[title="Close drawer"]').click();
    await expect(page.locator(`text=${updatedTitle}`)).toBeVisible();
  });

  test('E2E-03: Column Deletion Non-Empty Safety Policy Enforcement', async ({ page }) => {
    // Log in as Bob
    await page.goto('/login');
    await page.fill('input[type="email"]', 'bob@acme.com');
    await page.fill('input[type="password"]', 'password123');
    await page.click('button[type="submit"]');

    // Ensure we are on board
    await expect(page).toHaveURL(/\/(\?boardId=.*)?$/);

    // Add a column "Temp Column"
    const colName = `Temp ${Date.now()}`;
    await page.click('button:has-text("Add Column")');
    await page.fill('input[placeholder="e.g. QA Review"]', colName);
    await page.click('button[type="submit"]:has-text("Add Column")');

    await expect(page.locator(`h3:has-text("${colName}")`)).toBeVisible();

    // Add a task into this column
    const colTaskTitle = `Blocker Task ${Date.now()}`;
    const columnContainer = page.locator(`[data-column-name="${colName}"]`);
    await columnContainer.locator('button[title="Add task to column"]').click();
    const colModal = page.locator('div[role="dialog"]');
    await expect(colModal).toBeVisible();
    await colModal.locator('input[placeholder="e.g. Implement Optimistic Locking"]').fill(colTaskTitle);
    await colModal.locator('button[type="submit"]:has-text("Create Task")').click();

    await expect(page.locator(`text=${colTaskTitle}`)).toBeVisible();

    // Attempt to delete non-empty column -> Must be rejected by backend policy
    await columnContainer.locator('button[title="Column actions"]').click();
    await page.click('button:has-text("Delete Column")');

    // Verify error banner appears
    await expect(columnContainer).toContainText(/Cannot delete column containing/);
  });

  test('E2E-04: Role-Based Access Control: Charlie (Member) cannot manage boards or columns', async ({ page }) => {
    // Log in as Charlie (Member)
    await page.goto('/login');
    await page.fill('input[type="email"]', 'charlie@acme.com');
    await page.fill('input[type="password"]', 'password123');
    await page.click('button[type="submit"]');

    await expect(page).toHaveURL(/\/(\?boardId=.*)?$/);

    // Verify header role is Member
    await expect(page.locator('header')).toContainText('Charlie');
    await expect(page.locator('header')).toContainText('Member');

    // Member should NOT see "Add Column" button
    await expect(page.locator('button:has-text("Add Column")')).not.toBeVisible();

    // Navigate to /boards
    await page.click('a[href="/boards"]');
    await expect(page).toHaveURL('/boards');

    // Member should NOT see "Create Board" button
    await expect(page.locator('button:has-text("Create Board")')).not.toBeVisible();
  });
});
