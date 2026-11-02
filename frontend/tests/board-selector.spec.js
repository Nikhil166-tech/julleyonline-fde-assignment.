import { test, expect } from '@playwright/test';
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test.describe('Board Selector, Search & Tenant Isolation Regression Suite', () => {
  test.beforeAll(async () => {
    // Reset test database to pristine seed state before tests
    try {
      execSync('node --env-file=.env.test scripts/reset-test-db.js', {
        cwd: path.resolve(__dirname, '../../backend'),
        stdio: 'pipe',
      });
    } catch (e) {
      console.warn('Test DB reset beforeAll warning:', e.message);
    }
  });

  test.afterAll(async () => {
    // Clean up test-generated boards after tests complete
    try {
      execSync('node --env-file=.env.test scripts/reset-test-db.js', {
        cwd: path.resolve(__dirname, '../../backend'),
        stdio: 'pipe',
      });
    } catch (e) {
      console.warn('Test DB reset afterAll warning:', e.message);
    }
  });

  test.beforeEach(async ({ page }) => {
    // Clear localStorage to ensure fresh session
    await page.goto('/login');
    await page.evaluate(() => localStorage.clear());
  });

  test('SEL-01: Board selector renders active board, count badge, and opens searchable dropdown', async ({ page }) => {
    // 1. Log in as Bob
    await page.goto('/login');
    await page.fill('input[type="email"]', 'bob@acme.com');
    await page.fill('input[type="password"]', 'password123');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/\?boardId=/);

    // 2. Locate board selector trigger
    const selectorTrigger = page.locator('[data-testid="board-selector-trigger"]');
    await expect(selectorTrigger).toBeVisible();
    await expect(selectorTrigger).toContainText('Sprint 1 - Core Platform MVP');

    // 3. Click to open dropdown
    await selectorTrigger.click();
    const dropdown = page.locator('[data-testid="board-selector-dropdown"]');
    await expect(dropdown).toBeVisible();

    // 4. Verify search input is rendered
    const searchInput = page.locator('[data-testid="board-search-input"]');
    await expect(searchInput).toBeVisible();

    // 5. Verify the active board has checkmark icon and correct metadata
    const activeItem = dropdown.locator('[data-testid^="board-item-"]').first();
    await expect(activeItem).toBeVisible();
    await expect(activeItem).toContainText('Sprint 1 - Core Platform MVP');
    await expect(activeItem.locator('[data-testid="board-active-check"]')).toBeVisible();
  });

  test('SEL-02: Search filtering works dynamically by board name and short ID', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', 'bob@acme.com');
    await page.fill('input[type="password"]', 'password123');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/\?boardId=/);

    // Open board selector dropdown
    await page.click('[data-testid="board-selector-trigger"]');
    const searchInput = page.locator('[data-testid="board-search-input"]');
    await expect(searchInput).toBeVisible();

    // Filter by name match
    await searchInput.fill('Core Platform');
    const items = page.locator('[data-testid^="board-item-"]');
    await expect(items).toHaveCount(1);
    await expect(items.first()).toContainText('Sprint 1 - Core Platform MVP');

    // Filter by non-existent query
    await searchInput.fill('NonExistentBoard999');
    await expect(page.locator('text=No boards matching')).toBeVisible();

    // Clear search
    await searchInput.fill('');
    await expect(items).toHaveCount(1);
  });

  test('SEL-03: Board selection loads correct columns, tasks, and updates URL query param', async ({ page }) => {
    // 1. Log in as Bob
    await page.goto('/login');
    await page.fill('input[type="email"]', 'bob@acme.com');
    await page.fill('input[type="password"]', 'password123');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/\?boardId=/);

    // 2. Create a second board so we can test switching
    await page.click('[data-testid="board-selector-trigger"]');
    await page.click('[data-testid="board-selector-create-btn"]');

    const modal = page.locator('div[role="dialog"]');
    await expect(modal).toBeVisible();
    const secondBoardName = `Beta Release Board ${Date.now()}`;
    await modal.locator('input[placeholder="e.g. Q4 Sprint Roadmap"]').fill(secondBoardName);
    await modal.locator('button[type="submit"]:has-text("Create Board")').click();

    // Verify modal closed and new board is selected
    await expect(page.locator('h1')).toContainText(secondBoardName);

    // Verify default columns exist on new board
    await expect(page.locator('h3:has-text("Backlog")')).toBeVisible();
    await expect(page.locator('h3:has-text("In Progress")')).toBeVisible();
    await expect(page.locator('h3:has-text("Done")')).toBeVisible();

    // 3. Switch back to Sprint 1 using BoardSelector
    await page.click('[data-testid="board-selector-trigger"]');
    await page.click('button[data-testid^="board-item-"]:has-text("Sprint 1 - Core Platform MVP")');

    // Verify URL and board heading updated back to Sprint 1
    await expect(page.locator('h1')).toContainText('Sprint 1 - Core Platform MVP');
    await expect(page.locator('[data-testid="board-selector-trigger"]')).toContainText('Sprint 1 - Core Platform MVP');
  });

  test('SEL-04: Support for multiple boards with identical names via distinct short IDs', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', 'bob@acme.com');
    await page.fill('input[type="password"]', 'password123');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/\?boardId=/);

    const duplicateName = `Sprint Planning`;

    // Create First Board with duplicateName
    await page.click('[data-testid="board-selector-trigger"]');
    await page.click('[data-testid="board-selector-create-btn"]');
    let modal = page.locator('div[role="dialog"]');
    await modal.locator('input[placeholder="e.g. Q4 Sprint Roadmap"]').fill(duplicateName);
    await modal.locator('button[type="submit"]:has-text("Create Board")').click();
    await expect(page.locator('h1')).toContainText(duplicateName);

    // Create Second Board with the exact same duplicateName
    await page.click('[data-testid="board-selector-trigger"]');
    await page.click('[data-testid="board-selector-create-btn"]');
    modal = page.locator('div[role="dialog"]');
    await modal.locator('input[placeholder="e.g. Q4 Sprint Roadmap"]').fill(duplicateName);
    await modal.locator('button[type="submit"]:has-text("Create Board")').click();
    await expect(page.locator('h1')).toContainText(duplicateName);

    // Open dropdown and verify both appear with distinct short IDs
    await page.click('[data-testid="board-selector-trigger"]');
    await page.locator('[data-testid="board-search-input"]').fill(duplicateName);

    const duplicateItems = page.locator('[data-testid^="board-item-"]');
    await expect(duplicateItems).toHaveCount(2);

    // Verify both items have short IDs `#...` and they are different
    const idBadges = duplicateItems.locator('span.font-mono');
    const id1 = await idBadges.nth(0).textContent();
    const id2 = await idBadges.nth(1).textContent();

    expect(id1).toBeTruthy();
    expect(id2).toBeTruthy();
    expect(id1).not.toBe(id2);
  });

  test('SEL-05: Tenant switching strictly scopes board selector and prevents cross-tenant UI bleed', async ({ page }) => {
    // 1. Log in as Bob (Tenant Admin in Acme Engineering, Member in Acme Marketing)
    await page.goto('/login');
    await page.fill('input[type="email"]', 'bob@acme.com');
    await page.fill('input[type="password"]', 'password123');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/\?boardId=/);

    // 2. Verify Bob starts in Engineering & Product
    await expect(page.locator('[data-testid="tenant-switcher-trigger"]')).toContainText('Engineering & Product');
    await expect(page.locator('[data-testid="board-selector-trigger"]')).toBeVisible();

    // 3. Switch Tenant to Marketing & Growth
    await page.click('[data-testid="tenant-switcher-trigger"]');
    await page.click('[data-testid="tenant-option-marketing"]');

    // 4. Verify tenant changed to Marketing & Growth
    await expect(page.locator('[data-testid="tenant-switcher-trigger"]')).toContainText('Marketing & Growth');

    // 5. In Marketing, Bob has 0 boards initially.
    // Verify Sprint 1 (Engineering board) is NOT shown in selector or board canvas!
    await expect(page.locator('text=Sprint 1 - Core Platform MVP')).not.toBeVisible();
    await expect(page.locator('text=No boards in this workspace')).toBeVisible();

    // 6. Switch back to Engineering & Product
    await page.click('[data-testid="tenant-switcher-trigger"]');
    await page.click('[data-testid="tenant-option-engineering"]');
    await expect(page.locator('[data-testid="tenant-switcher-trigger"]')).toContainText('Engineering & Product');

    // Engineering boards should immediately reappear in board selector
    const engineeringBoardSelector = page.locator('[data-testid="board-selector-trigger"]');
    await expect(engineeringBoardSelector).toBeVisible();
    await engineeringBoardSelector.click();
    await expect(page.locator('[data-testid="board-selector-dropdown"]')).toContainText('Sprint 1 - Core Platform MVP');
  });

  test('SEL-06: Create Board action inside BoardSelector is visible for Admins and hidden for Members', async ({ page }) => {
    // 1. Log in as Charlie (Member in Engineering)
    await page.goto('/login');
    await page.fill('input[type="email"]', 'charlie@acme.com');
    await page.fill('input[type="password"]', 'password123');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/\?boardId=/);

    // Open BoardSelector as Charlie
    await page.click('[data-testid="board-selector-trigger"]');

    // Create New Board button should NOT be rendered for standard Member
    await expect(page.locator('[data-testid="board-selector-create-btn"]')).not.toBeVisible();
  });

  test('SEL-07: Tenant-switching race condition: delayed board-list response from prior workspace is dropped and never triggers 403', async ({ page }) => {
    // 1. Intercept GET /api/v1/boards requests
    let releaseEngineeringResponse = null;
    const engineeringDelayPromise = new Promise((resolve) => {
      releaseEngineeringResponse = resolve;
    });

    let delayedEngineeringDispatched = false;
    let forbiddenDetected = false;

    // Track any HTTP 403 responses
    page.on('response', (res) => {
      if (res.status() === 403 && res.url().includes('/api/v1/boards')) {
        forbiddenDetected = true;
      }
    });

    await page.route('**/api/v1/boards', async (route) => {
      const req = route.request();

      // Intercept the first GET /api/v1/boards on mount (for Engineering)
      if (req.method() === 'GET' && !delayedEngineeringDispatched) {
        delayedEngineeringDispatched = true;

        // Fetch actual response from backend under Engineering context
        const response = await route.fetch();
        const body = await response.text();

        // Delay returning this response until after Bob switches to Marketing
        await engineeringDelayPromise;

        // Fulfill with the delayed Engineering response
        await route.fulfill({ response, body });
        return;
      }

      // Allow all other requests (such as for Marketing workspace) to continue immediately
      await route.continue();
    });

    // 2. Log in as Bob (starts with Engineering workspace)
    await page.goto('/login');
    await page.fill('input[type="email"]', 'bob@acme.com');
    await page.fill('input[type="password"]', 'password123');
    await page.click('button[type="submit"]');

    // Wait until the Workspace switcher trigger in Header is visible
    const tenantSwitcher = page.locator('[data-testid="tenant-switcher-trigger"]');
    await expect(tenantSwitcher).toBeVisible();

    // 3. Switch workspace from Engineering to Marketing while Engineering response is still delayed
    await tenantSwitcher.click();
    await page.click('[data-testid="tenant-option-marketing"]');
    await expect(tenantSwitcher).toContainText('Marketing & Growth');

    // 4. Marketing should now be active. Now release the delayed Engineering response!
    if (releaseEngineeringResponse) {
      releaseEngineeringResponse();
    }

    // Give time for any delayed promise/state to process
    await page.waitForTimeout(500);

    // 5. Verify Marketing remains selected and NO forbidden error or Engineering board was loaded
    await expect(tenantSwitcher).toContainText('Marketing & Growth');
    await expect(page.locator('text=Access forbidden: Board belongs to another tenant workspace')).not.toBeVisible();
    await expect(page.locator('text=Sprint 1 - Core Platform MVP')).not.toBeVisible();
    await expect(page.locator('text=No boards in this workspace')).toBeVisible();
    expect(forbiddenDetected).toBe(false);
  });
});
