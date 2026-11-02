import { test, expect } from '@playwright/test';

test.describe('AI Kanban Assistant Frontend Suite', () => {
  test.beforeEach(async ({ page }) => {
    // Clear localStorage to ensure fresh session
    await page.goto('/login');
    await page.evaluate(() => localStorage.clear());
  });

  test('AI-01: Navigates to AI Assistant page and verifies read-only indicator & context', async ({ page }) => {
    // 1. Log in as Bob
    await page.goto('/login');
    await page.fill('input[type="email"]', 'bob@acme.com');
    await page.fill('input[type="password"]', 'password123');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/\?boardId=/);

    // 2. Click AI Assistant sidebar link
    const aiNavLink = page.locator('aside a[href="/ai-assistant"]');
    await expect(aiNavLink).toBeVisible();
    await aiNavLink.click();

    // 3. Verify route and header elements
    await expect(page).toHaveURL(/\/ai-assistant/);
    await expect(page.locator('h1:has-text("AI Kanban Assistant")')).toBeVisible();
    await expect(page.getByText('Read-Only', { exact: true })).toBeVisible();
    await expect(page.getByRole('main').getByText('Engineering & Product')).toBeVisible();

    // 4. Verify board scope selector and suggested prompts
    await expect(page.locator('select#ai-board-select')).toBeVisible();
    await expect(page.locator('button:has-text("Which tasks are overdue?")')).toBeVisible();
  });

  test('AI-02: Submits question and renders structured answer with tool badges', async ({ page }) => {
    // Intercept AI chat endpoint to provide deterministic mock response
    await page.route('**/api/v1/ai/chat', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            answer: 'Found 1 overdue task(s) in Engineering: Implement Auth Middleware.',
            toolsUsed: ['get_overdue_tasks'],
            confidence: 'high',
            generatedAt: new Date().toISOString(),
            contextMeta: {
              tenantName: 'Engineering & Product',
              totalTasks: 4,
            },
          },
        }),
      });
    });

    // 1. Log in
    await page.goto('/login');
    await page.fill('input[type="email"]', 'bob@acme.com');
    await page.fill('input[type="password"]', 'password123');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/\?boardId=/);

    // 2. Navigate to AI Assistant
    await page.click('aside a[href="/ai-assistant"]');
    await expect(page.locator('h1:has-text("AI Kanban Assistant")')).toBeVisible();

    // 3. Click "Which tasks are overdue?" chip
    await page.click('button:has-text("Which tasks are overdue?")');

    // 4. Verify message and answer appear in timeline
    await expect(page.locator('text=Implement Auth Middleware')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('span:has-text("get_overdue_tasks")')).toBeVisible();
    await expect(page.locator('text=4 tasks analyzed')).toBeVisible();
  });

  test('AI-03: Switching tenant workspace cancels in-flight request and resets chat history', async ({ page }) => {
    let requestDelayedPromiseResolve = null;
    const requestDelayedPromise = new Promise((resolve) => {
      requestDelayedPromiseResolve = resolve;
    });

    // Intercept AI chat endpoint with a deliberate delay
    await page.route('**/api/v1/ai/chat', async (route) => {
      await requestDelayedPromise;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            answer: 'Old Engineering Response that should be dropped',
            toolsUsed: ['get_board_summary'],
          },
        }),
      });
    });

    // 1. Log in as Bob
    await page.goto('/login');
    await page.fill('input[type="email"]', 'bob@acme.com');
    await page.fill('input[type="password"]', 'password123');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/\?boardId=/);

    // 2. Go to AI Assistant
    await page.click('aside a[href="/ai-assistant"]');
    await expect(page.locator('h1:has-text("AI Kanban Assistant")')).toBeVisible();

    // 3. Send query
    await page.fill('textarea', 'Summarize board');
    await page.click('button:has-text("Ask")');

    // 4. Verify loading state
    await expect(page.locator('text=Analyzing workspace tasks')).toBeVisible();

    // 5. Switch tenant workspace via header tenant switcher
    await page.click('[data-testid="tenant-switcher-trigger"]');
    await page.click('[data-testid="tenant-option-marketing"]');

    // 6. Release delayed response
    requestDelayedPromiseResolve();

    // 7. Verify stale message is NOT shown and active tenant is Marketing
    await expect(page.locator('text=Old Engineering Response that should be dropped')).not.toBeVisible();
    await expect(page.locator('[data-testid="tenant-switcher-trigger"]')).toContainText('Marketing & Growth');
  });

  test('AI-04: Gracefully renders error banner on service failure with dismiss action', async ({ page }) => {
    await page.route('**/api/v1/ai/chat', async (route) => {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({
          success: false,
          error: {
            code: 'AI_SERVICE_UNAVAILABLE',
            message: 'AI Assistant microservice is currently unreachable.',
          },
        }),
      });
    });

    // 1. Log in
    await page.goto('/login');
    await page.fill('input[type="email"]', 'bob@acme.com');
    await page.fill('input[type="password"]', 'password123');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/\?boardId=/);

    // 2. Go to AI Assistant
    await page.click('aside a[href="/ai-assistant"]');
    await expect(page.locator('h1:has-text("AI Kanban Assistant")')).toBeVisible();

    // 3. Ask question
    await page.fill('textarea', 'Show tasks');
    await page.click('button:has-text("Ask")');

    // 4. Verify error banner and dismiss button
    const errorBanner = page.locator('text=AI Assistant microservice is currently unreachable');
    await expect(errorBanner).toBeVisible({ timeout: 5000 });

    await page.click('button:has-text("Dismiss")');
    await expect(errorBanner).not.toBeVisible();
  });
});
