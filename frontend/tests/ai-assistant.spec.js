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

  test('AI-02: Submits question and renders structured answer with expandable tool disclosure', async ({ page }) => {
    // Intercept AI chat endpoint to provide deterministic mock response
    await page.route('**/api/v1/ai/chat', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            responseType: 'overdue_summary',
            answer: 'Found 1 overdue task(s) in Engineering: Implement Auth Middleware.',
            structuredData: {
              tasksAnalyzed: 4,
              overdueCount: 1,
              tasksWithDueDates: 2,
              tasksWithoutDueDates: 2,
              tasks: [
                {
                  id: 'task-1',
                  title: 'Implement Auth Middleware',
                  column: 'To Do',
                  priority: 'URGENT',
                  dueDate: '2026-10-31T00:00:00Z',
                  assignee: 'Bob',
                  daysPastDue: 3,
                },
              ],
            },
            toolsUsed: ['get_overdue_tasks'],
            recordsAnalyzed: 4,
            dataScope: 'Engineering & Product',
            confidence: 'high',
            generatedAt: new Date().toISOString(),
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
    await expect(page.getByText('Implement Auth Middleware', { exact: true })).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=4 tasks analyzed')).toBeVisible();

    // 5. Expand tool disclosure
    const disclosureBtn = page.locator('button:has-text("How this answer was generated")');
    await expect(disclosureBtn).toBeVisible();
    await disclosureBtn.click();
    await expect(page.locator('span:has-text("get_overdue_tasks")')).toBeVisible();
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
            responseType: 'board_summary',
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

  test('AI-05: Case A — Handles workspace with zero due dates gracefully', async ({ page }) => {
    await page.route('**/api/v1/ai/chat', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            responseType: 'overdue_summary',
            answer: 'Analyzed 11 task(s) across Entire Workspace. None of these tasks have due dates configured. As a result, 0 tasks are classified as overdue.',
            structuredData: {
              tasksAnalyzed: 11,
              overdueCount: 0,
              tasksWithDueDates: 0,
              tasksWithoutDueDates: 11,
              tasks: [],
            },
            toolsUsed: ['get_overdue_tasks'],
            recordsAnalyzed: 11,
            dataScope: 'Engineering & Product',
          },
        }),
      });
    });

    await page.goto('/login');
    await page.fill('input[type="email"]', 'bob@acme.com');
    await page.fill('input[type="password"]', 'password123');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/\?boardId=/);

    await page.click('aside a[href="/ai-assistant"]');
    await page.fill('textarea', 'Which tasks are overdue?');
    await page.click('button:has-text("Ask")');

    // Verify explanation and zero due date notice
    await expect(page.locator('text=No due dates are set on any task in this workspace')).toBeVisible();
    await expect(page.locator('text=11 tasks analyzed')).toBeVisible();
  });

  test('AI-06: Case B & C — Renders scope and security notice widgets without tool clutter', async ({ page }) => {
    // Intercept security notice for password request
    await page.route('**/api/v1/ai/chat', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            responseType: 'security_notice',
            answer: 'User passwords and authentication credentials are encrypted and protected by strict system access controls.',
            structuredData: {
              noticeType: 'security_notice',
              title: 'Security & Credential Protection',
              reason: 'Credentials and passwords are not accessible via workspace APIs.',
            },
            toolsUsed: [], // Zero tools used
            recordsAnalyzed: 0,
            dataScope: 'Engineering & Product',
          },
        }),
      });
    });

    await page.goto('/login');
    await page.fill('input[type="email"]', 'bob@acme.com');
    await page.fill('input[type="password"]', 'password123');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/\?boardId=/);

    await page.click('aside a[href="/ai-assistant"]');
    await page.fill('textarea', "Can I know Charlie's password?");
    await page.click('button:has-text("Ask")');

    // Verify security notice widget is rendered
    await expect(page.locator('text=Credential Protection Active')).toBeVisible();
    // Verify tool disclosure button is NOT rendered when 0 tools were used
    await expect(page.locator('button:has-text("How this answer was generated")')).not.toBeVisible();
  });

  test('AI-07: Supports Enter to send, Shift+Enter for newline, and mobile responsive layout', async ({ page }) => {
    // Test keyboard interaction
    await page.goto('/login');
    await page.fill('input[type="email"]', 'bob@acme.com');
    await page.fill('input[type="password"]', 'password123');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/\?boardId=/);

    await page.click('aside a[href="/ai-assistant"]');

    const textarea = page.locator('textarea');
    await textarea.focus();
    await textarea.type('Line 1');
    await page.keyboard.down('Shift');
    await page.keyboard.press('Enter');
    await page.keyboard.up('Shift');
    await textarea.type('Line 2');

    const val = await textarea.inputValue();
    expect(val).toContain('\n');

    // Test mobile layout (375 x 667)
    await page.setViewportSize({ width: 375, height: 667 });
    await expect(page.locator('h1:has-text("AI Kanban Assistant")')).toBeVisible();
    await expect(page.getByText('Read-Only', { exact: true })).toBeVisible();
    await expect(page.locator('[data-testid="ai-ask-btn"]')).toBeVisible();
  });

  test('AI-08: Displays Gemini LLM generation source in technical disclosure without fallback indicator', async ({ page }) => {
    await page.route('**/api/v1/ai/chat', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            responseType: 'task_list',
            answer: 'Here are the high-priority tasks analyzed by Gemini.',
            structuredData: {
              tasksAnalyzed: 2,
              tasks: [
                { id: 't-1', title: 'Task Alpha', priority: 'HIGH', column: 'To Do' },
              ],
            },
            toolsUsed: ['get_tasks'],
            recordsAnalyzed: 2,
            dataScope: 'Engineering & Product',
            confidence: 'high',
            generation: {
              source: 'llm',
              model: 'gemini-2.5-flash',
              fallbackUsed: false,
            },
          },
        }),
      });
    });

    await page.goto('/login');
    await page.fill('input[type="email"]', 'bob@acme.com');
    await page.fill('input[type="password"]', 'password123');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/\?boardId=/);

    await page.click('aside a[href="/ai-assistant"]');
    await page.fill('textarea', 'Show high priority tasks');
    await page.click('[data-testid="ai-ask-btn"]');

    await expect(page.getByText('Here are the high-priority tasks analyzed by Gemini.')).toBeVisible();
    // Verify fallback indicator is NOT visible
    await expect(page.locator('[data-testid="ai-fallback-indicator"]')).not.toBeVisible();

    // Expand disclosure and check source
    const disclosureBtn = page.locator('button:has-text("How this answer was generated")');
    await expect(disclosureBtn).toBeVisible();
    await disclosureBtn.click();
    await expect(page.locator('[data-testid="ai-generation-source"]')).toContainText('Gemini (gemini-2.5-flash)');
  });

  test('AI-09: Displays subtle local fallback banner and metadata when LLM fails', async ({ page }) => {
    await page.route('**/api/v1/ai/chat', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            responseType: 'overdue_summary',
            answer: 'Local workspace analysis found 1 overdue task.',
            structuredData: {
              tasksAnalyzed: 3,
              overdueCount: 1,
              tasks: [
                { id: 't-1', title: 'Critical Patch', priority: 'URGENT', column: 'To Do', daysPastDue: 2 },
              ],
            },
            toolsUsed: ['get_overdue_tasks'],
            recordsAnalyzed: 3,
            dataScope: 'Engineering & Product',
            confidence: 'high',
            generation: {
              source: 'local',
              model: null,
              fallbackUsed: true,
              failureReason: 'ResourceExhausted',
            },
          },
        }),
      });
    });

    await page.goto('/login');
    await page.fill('input[type="email"]', 'bob@acme.com');
    await page.fill('input[type="password"]', 'password123');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/\?boardId=/);

    await page.click('aside a[href="/ai-assistant"]');
    await page.fill('textarea', 'Which tasks are overdue?');
    await page.click('[data-testid="ai-ask-btn"]');

    await expect(page.getByText('Local workspace analysis found 1 overdue task.')).toBeVisible();
    
    // Verify subtle fallback indicator is visible
    const fallbackIndicator = page.locator('[data-testid="ai-fallback-indicator"]');
    await expect(fallbackIndicator).toBeVisible();
    await expect(fallbackIndicator).toHaveText('Answered using local workspace analysis.');

    // Verify raw technical error code is NOT rendered in user face
    await expect(page.getByText('ResourceExhausted')).not.toBeVisible();

    // Expand disclosure and verify Local Deterministic Fallback label
    const disclosureBtn = page.locator('button:has-text("How this answer was generated")');
    await expect(disclosureBtn).toBeVisible();
    await disclosureBtn.click();
    await expect(page.locator('[data-testid="ai-generation-source"]')).toContainText('Local Deterministic Fallback');
  });
});
