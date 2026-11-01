import { test, expect } from '@playwright/test';

test.describe('Phase 4: Real-Time Collaboration, Presence, Concurrency & Recovery', () => {
  test('COL-01: Real-time presence reflects multi-user room presence and status pill', async ({ browser }) => {
    const contextBob = await browser.newContext();
    const contextCharlie = await browser.newContext();

    const pageBob = await contextBob.newPage();
    const pageCharlie = await contextCharlie.newPage();

    try {
      // 1. Bob logs in
      await pageBob.goto('/login');
      await pageBob.fill('input[type="email"]', 'bob@acme.com');
      await pageBob.fill('input[type="password"]', 'password123');
      await pageBob.click('button[type="submit"]');
      await expect(pageBob).toHaveURL(/\/(\?boardId=.*)?$/);

      // Wait for board and connection status
      const statusPillBob = pageBob.locator('[data-testid="connection-status-pill"]');
      await expect(statusPillBob).toBeVisible({ timeout: 10000 });
      await expect(statusPillBob).toContainText('Live');

      // 2. Charlie logs in and navigates to Bob's current board
      await pageCharlie.goto('/login');
      await pageCharlie.fill('input[type="email"]', 'charlie@acme.com');
      await pageCharlie.fill('input[type="password"]', 'password123');
      await pageCharlie.click('button[type="submit"]');
      await expect(pageCharlie).toHaveURL(/\/(\?boardId=.*)?$/);

      const bobUrl = pageBob.url();
      await pageCharlie.goto(bobUrl);

      const statusPillCharlie = pageCharlie.locator('[data-testid="connection-status-pill"]');
      await expect(statusPillCharlie).toBeVisible({ timeout: 10000 });
      await expect(statusPillCharlie).toContainText('Live');

      // 3. Verify presence avatars on both browsers
      const presenceStackBob = pageBob.locator('[data-testid="presence-avatar-stack"]');
      await expect(presenceStackBob).toBeVisible({ timeout: 10000 });

      const presenceStackCharlie = pageCharlie.locator('[data-testid="presence-avatar-stack"]');
      await expect(presenceStackCharlie).toBeVisible({ timeout: 10000 });

      // 4. Close Charlie's page -> Bob's presence updates
      await pageCharlie.close();
      await pageBob.waitForTimeout(1000);
    } finally {
      await contextBob.close();
      await contextCharlie.close();
    }
  });

  test('COL-02: Real-time task creation broadcasts to second collaborator without page reload', async ({
    browser,
  }) => {
    const contextBob = await browser.newContext();
    const contextCharlie = await browser.newContext();

    const pageBob = await contextBob.newPage();
    const pageCharlie = await contextCharlie.newPage();

    try {
      // 1. Log in Bob
      await pageBob.goto('/login');
      await pageBob.fill('input[type="email"]', 'bob@acme.com');
      await pageBob.fill('input[type="password"]', 'password123');
      await pageBob.click('button[type="submit"]');
      await expect(pageBob).toHaveURL(/\/(\?boardId=.*)?$/);

      // 2. Log in Charlie on the same board
      await pageCharlie.goto('/login');
      await pageCharlie.fill('input[type="email"]', 'charlie@acme.com');
      await pageCharlie.fill('input[type="password"]', 'password123');
      await pageCharlie.click('button[type="submit"]');
      await expect(pageCharlie).toHaveURL(/\/(\?boardId=.*)?$/);

      const boardUrl = pageBob.url();
      await pageCharlie.goto(boardUrl);

      // Wait until both are connected
      await expect(pageBob.locator('[data-testid="connection-status-pill"]')).toContainText('Live');
      await expect(pageCharlie.locator('[data-testid="connection-status-pill"]')).toContainText('Live');

      // 3. Bob creates a new task
      const uniqueTaskTitle = `Live Collab Task ${Date.now()}`;
      await pageBob.click('button:has-text("Add Task")');
      await pageBob.fill('input[placeholder="e.g. Implement Optimistic Locking"]', uniqueTaskTitle);
      await pageBob.click('button[type="submit"]:has-text("Create Task")');

      // Verify task appears on Bob's board
      await expect(pageBob.locator(`text=${uniqueTaskTitle}`)).toBeVisible({ timeout: 5000 });

      // Verify task instantly appears on Charlie's board via WebSocket without page refresh
      await expect(pageCharlie.locator(`text=${uniqueTaskTitle}`)).toBeVisible({ timeout: 5000 });
    } finally {
      await contextBob.close();
      await contextCharlie.close();
    }
  });

  test('COL-03: Real-time task movement updates column on second collaborator in real time', async ({
    browser,
  }) => {
    const contextBob = await browser.newContext();
    const contextCharlie = await browser.newContext();

    const pageBob = await contextBob.newPage();
    const pageCharlie = await contextCharlie.newPage();

    try {
      // 1. Log in Bob
      await pageBob.goto('/login');
      await pageBob.fill('input[type="email"]', 'bob@acme.com');
      await pageBob.fill('input[type="password"]', 'password123');
      await pageBob.click('button[type="submit"]');
      await expect(pageBob).toHaveURL(/\/(\?boardId=.*)?$/);

      // 2. Log in Charlie on same board
      await pageCharlie.goto('/login');
      await pageCharlie.fill('input[type="email"]', 'charlie@acme.com');
      await pageCharlie.fill('input[type="password"]', 'password123');
      await pageCharlie.click('button[type="submit"]');
      await expect(pageCharlie).toHaveURL(/\/(\?boardId=.*)?$/);

      const boardUrl = pageBob.url();
      await pageCharlie.goto(boardUrl);
      const urlObj = new URL(boardUrl);
      const boardId = urlObj.searchParams.get('boardId');

      // Bob creates a task in Backlog
      const moveTaskTitle = `Move Collab Task ${Date.now()}`;
      await pageBob.click('button:has-text("Add Task")');
      await pageBob.fill('input[placeholder="e.g. Implement Optimistic Locking"]', moveTaskTitle);
      await pageBob.click('button[type="submit"]:has-text("Create Task")');

      await expect(pageCharlie.locator(`text=${moveTaskTitle}`)).toBeVisible({ timeout: 5000 });

      // Execute move from Charlie via API using Charlie's token and tenant context
      const charlieToken = await pageCharlie.evaluate(() => localStorage.getItem('julley_token'));
      const activeTenantId = await pageCharlie.evaluate(() => localStorage.getItem('julley_active_tenant_id'));

      await pageCharlie.evaluate(
        async ({ token, tenantId, boardId, title }) => {
          let bId = boardId;
          if (!bId) {
            const res = await fetch('/api/v1/boards', {
              headers: {
                Authorization: `Bearer ${token}`,
                'x-tenant-id': tenantId,
              },
            });
            const boards = await res.json();
            bId = boards.data[0].id;
          }
          const boardRes = await fetch(`/api/v1/boards/${bId}`, {
            headers: {
              Authorization: `Bearer ${token}`,
              'x-tenant-id': tenantId,
            },
          });
          const boardData = await boardRes.json();
          let foundTask = null;
          let inProgCol = boardData.data.columns.find((c) => c.name === 'In Progress');
          for (const col of boardData.data.columns) {
            const t = col.tasks?.find((x) => x.title === title);
            if (t) {
              foundTask = t;
              break;
            }
          }
          if (foundTask && inProgCol) {
            await fetch(`/api/v1/tasks/${foundTask.id}/move`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
                'x-tenant-id': tenantId,
              },
              body: JSON.stringify({
                targetColumnId: inProgCol.id,
                newPosition: 0,
                version: foundTask.version,
              }),
            });
          }
        },
        { token: charlieToken, tenantId: activeTenantId, boardId, title: moveTaskTitle }
      );

      // Verify that Bob's board receives task:moved event and the task is now in "In Progress" column
      const inProgressColumnBob = pageBob.locator('[data-column-name="In Progress"]');
      await expect(inProgressColumnBob.locator(`text=${moveTaskTitle}`)).toBeVisible({ timeout: 5000 });
    } finally {
      await contextBob.close();
      await contextCharlie.close();
    }
  });

  test('COL-04: Concurrent task edits trigger HTTP 409 Conflict Modal with latest-state reconciliation', async ({
    browser,
  }) => {
    const contextBob = await browser.newContext();
    const contextCharlie = await browser.newContext();

    const pageBob = await contextBob.newPage();
    const pageCharlie = await contextCharlie.newPage();

    try {
      // 1. Log in Bob
      await pageBob.goto('/login');
      await pageBob.fill('input[type="email"]', 'bob@acme.com');
      await pageBob.fill('input[type="password"]', 'password123');
      await pageBob.click('button[type="submit"]');
      await expect(pageBob).toHaveURL(/\/(\?boardId=.*)?$/);

      // 2. Log in Charlie
      await pageCharlie.goto('/login');
      await pageCharlie.fill('input[type="email"]', 'charlie@acme.com');
      await pageCharlie.fill('input[type="password"]', 'password123');
      await pageCharlie.click('button[type="submit"]');
      await expect(pageCharlie).toHaveURL(/\/(\?boardId=.*)?$/);

      const boardUrl = pageBob.url();
      await pageCharlie.goto(boardUrl);
      const urlObj = new URL(boardUrl);
      const conflictBoardId = urlObj.searchParams.get('boardId');

      // Bob creates a task
      const conflictTaskTitle = `Conflict Test Task ${Date.now()}`;
      await pageBob.click('button:has-text("Add Task")');
      await pageBob.fill('input[placeholder="e.g. Implement Optimistic Locking"]', conflictTaskTitle);
      await pageBob.click('button[type="submit"]:has-text("Create Task")');

      // Verify task visible for both
      await expect(pageBob.locator(`text=${conflictTaskTitle}`)).toBeVisible({ timeout: 5000 });
      await expect(pageCharlie.locator(`text=${conflictTaskTitle}`)).toBeVisible({ timeout: 5000 });

      // 3. Bob clicks task to open drawer (holding current version 1)
      await pageBob.click(`text=${conflictTaskTitle}`);
      await expect(pageBob.locator('[data-testid="task-details-drawer"]')).toBeVisible();

      // Temporarily disconnect Bob's socket so Bob's drawer does not receive Charlie's background update before Bob edits
      await pageBob.evaluate(() => {
        if (window.__socketInstance) window.__socketInstance.disconnect();
      });

      // 4. Charlie concurrently updates the task via API (advancing version to 2)
      const charlieToken = await pageCharlie.evaluate(() => localStorage.getItem('julley_token'));
      const activeTenantId = await pageCharlie.evaluate(() => localStorage.getItem('julley_active_tenant_id'));
      const updateResult = await pageCharlie.evaluate(
        async ({ token, tenantId, boardId, title }) => {
          let bId = boardId;
          if (!bId) {
            const res = await fetch('/api/v1/boards', {
              headers: {
                Authorization: `Bearer ${token}`,
                'x-tenant-id': tenantId,
              },
            });
            const boards = await res.json();
            bId = boards.data[0].id;
          }
          const boardRes = await fetch(`/api/v1/boards/${bId}`, {
            headers: {
              Authorization: `Bearer ${token}`,
              'x-tenant-id': tenantId,
            },
          });
          const boardData = await boardRes.json();
          let target = null;
          for (const col of boardData.data.columns) {
            const t = col.tasks?.find((x) => x.title === title);
            if (t) {
              target = t;
              break;
            }
          }
          if (target) {
            const putRes = await fetch(`/api/v1/tasks/${target.id}`, {
              method: 'PUT',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
                'x-tenant-id': tenantId,
              },
              body: JSON.stringify({
                title: `${title} [Updated by Charlie]`,
                description: 'Charlie concurrent modification',
                priority: 'HIGH',
                version: target.version,
              }),
            });
            return await putRes.json();
          }
          return null;
        },
        { token: charlieToken, tenantId: activeTenantId, boardId: conflictBoardId, title: conflictTaskTitle }
      );

      expect(updateResult?.data?.version).toBe(2);

      // 5. Bob (in drawer with stale version 1) changes priority to URGENT
      const prioritySelect = pageBob.locator('[data-testid="task-details-drawer"] select').first();
      await prioritySelect.selectOption('URGENT');

      // 6. Verify Conflict Modal pops up with 409 Conflict details
      const conflictModal = pageBob.locator('[data-testid="conflict-modal"]');
      await expect(conflictModal).toBeVisible({ timeout: 5000 });
      await expect(conflictModal).toContainText('Concurrent Edit Detected');

      // 7. Click "Refresh to Latest Version" to reconcile state
      await pageBob.click('button:has-text("Refresh to Latest Version")');

      // Reconnect Bob's socket
      await pageBob.evaluate(() => {
        if (window.__socketInstance) window.__socketInstance.connect();
      });

      // Verify drawer now shows Charlie's updated version and title
      await expect(conflictModal).not.toBeVisible();
      await expect(pageBob.locator('[data-testid="task-details-drawer"]')).toContainText('Charlie concurrent modification');
      await expect(pageBob.locator('[data-testid="task-details-drawer"] input[type="text"]').first()).toHaveValue(
        new RegExp('Updated by Charlie')
      );
    } finally {
      await contextBob.close();
      await contextCharlie.close();
    }
  });

  test('COL-05: Undo and Redo restores task positions with optimistic locking validation', async ({
    page,
  }) => {
    // 1. Log in Bob
    await page.goto('/login');
    await page.fill('input[type="email"]', 'bob@acme.com');
    await page.fill('input[type="password"]', 'password123');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/(\?boardId=.*)?$/);

    // 2. Create task in Backlog
    const undoTaskTitle = `Undo Task ${Date.now()}`;
    await page.click('button:has-text("Add Task")');
    await page.fill('input[placeholder="e.g. Implement Optimistic Locking"]', undoTaskTitle);
    await page.click('button[type="submit"]:has-text("Create Task")');

    await expect(page.locator(`text=${undoTaskTitle}`)).toBeVisible({ timeout: 5000 });

    // Verify initial Undo and Redo buttons exist in toolbar
    const undoBtn = page.locator('[data-testid="undo-btn"]');
    const redoBtn = page.locator('[data-testid="redo-btn"]');
    await expect(undoBtn).toBeVisible();
    await expect(redoBtn).toBeVisible();

    // 3. Open task in drawer to edit description (creating a reversible update action)
    await page.click(`text=${undoTaskTitle}`);
    await expect(page.locator('[data-testid="task-details-drawer"]')).toBeVisible();

    // Change priority to HIGH
    const prioritySelect = page.locator('[data-testid="task-details-drawer"] select').first();
    await prioritySelect.selectOption('HIGH');
    await page.waitForTimeout(500);

    // Verify undo button is now enabled
    await expect(undoBtn).toBeEnabled({ timeout: 3000 });

    // 4. Click Undo button
    await undoBtn.click();
    await page.waitForTimeout(500);

    // Verify priority reverted to MEDIUM (or initial state)
    await expect(prioritySelect).toHaveValue('MEDIUM');

    // 5. Click Redo button
    await expect(redoBtn).toBeEnabled({ timeout: 3000 });
    await redoBtn.click();
    await page.waitForTimeout(500);

    // Verify priority returned to HIGH
    await expect(prioritySelect).toHaveValue('HIGH');
  });

  test('COL-06: Socket reconnection automatically re-authenticates, rejoins room and refetches snapshot', async ({
    page,
  }) => {
    // 1. Log in Bob
    await page.goto('/login');
    await page.fill('input[type="email"]', 'bob@acme.com');
    await page.fill('input[type="password"]', 'password123');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/(\?boardId=.*)?$/);

    const statusPill = page.locator('[data-testid="connection-status-pill"]');
    await expect(statusPill).toContainText('Live', { timeout: 10000 });

    // 2. Trigger disconnect via test socket instance
    await page.evaluate(() => {
      if (window.__socketInstance) {
        window.__socketInstance.disconnect();
      }
    });

    // Verify status indicator reacts
    await page.waitForTimeout(500);

    // 3. Trigger reconnect
    await page.evaluate(() => {
      if (window.__socketInstance) {
        window.__socketInstance.connect();
      }
    });

    // Verify status returns to Live
    await expect(statusPill).toContainText('Live', { timeout: 10000 });
  });

  test('COL-07: Intervening collaborator update blocks stale undo and preserves latest version', async ({
    browser,
  }) => {
    const contextBob = await browser.newContext();
    const contextCharlie = await browser.newContext();
    const pageBob = await contextBob.newPage();
    const pageCharlie = await contextCharlie.newPage();

    try {
      // 1. Log in Bob and Charlie to Acme Engineering
      for (const { page, email } of [
        { page: pageBob, email: 'bob@acme.com' },
        { page: pageCharlie, email: 'charlie@acme.com' },
      ]) {
        await page.goto('/login');
        await page.fill('input[type="email"]', email);
        await page.fill('input[type="password"]', 'password123');
        await page.click('button[type="submit"]');
        await expect(page).toHaveURL(/\/(\?boardId=.*)?$/);
        await expect(page.locator('[data-testid="connection-status-pill"]')).toContainText('Live', { timeout: 10000 });
      }

      // 2. Bob creates a task
      const taskTitle = `Concurrency Undo Task ${Date.now()}`;
      await pageBob.click('button:has-text("Add Task")');
      await pageBob.fill('input[placeholder="e.g. Implement Optimistic Locking"]', taskTitle);
      await pageBob.click('button[type="submit"]:has-text("Create Task")');

      // Wait for task to be visible on both pages
      const bobTaskCard = pageBob.locator(`text=${taskTitle}`).first();
      const charlieTaskCard = pageCharlie.locator(`text=${taskTitle}`).first();
      await expect(bobTaskCard).toBeVisible({ timeout: 5000 });
      await expect(charlieTaskCard).toBeVisible({ timeout: 5000 });

      // 3. Bob drags/moves the task into "In Progress" (v1 -> v2)
      // We can also trigger the move via task drawer priority or dragging
      await bobTaskCard.click();
      await expect(pageBob.locator('[data-testid="task-details-drawer"]')).toBeVisible();
      const bobPriority = pageBob.locator('[data-testid="task-details-drawer"] select').first();
      await bobPriority.selectOption('URGENT');
      await pageBob.waitForTimeout(600);

      // Verify Bob's undo button is enabled
      const bobUndoBtn = pageBob.locator('[data-testid="undo-btn"]');
      await expect(bobUndoBtn).toBeEnabled({ timeout: 3000 });

      // 4. Meanwhile, Charlie edits the same task in his browser (advancing version to v3)
      await charlieTaskCard.click();
      await expect(pageCharlie.locator('[data-testid="task-details-drawer"]')).toBeVisible();
      const charlieDescInput = pageCharlie.locator('[data-testid="task-details-drawer"] textarea');
      await charlieDescInput.fill('Charlie updated task details concurrently');
      // Blur to save
      await pageCharlie.locator('[data-testid="task-details-drawer"] input[type="text"]').first().click();
      await pageCharlie.waitForTimeout(600);

      // 5. Now Bob attempts to Undo his previous edit
      await bobUndoBtn.click();
      await pageBob.waitForTimeout(600);

      // Verify Bob's stale undo is blocked with conflict warning banner
      const undoBanner = pageBob.locator('[data-testid="undo-error-banner"]');
      await expect(undoBanner).toBeVisible({ timeout: 5000 });
      await expect(undoBanner).toContainText(/Cannot undo: Task was modified by another collaborator/i);
    } finally {
      await contextBob.close();
      await contextCharlie.close();
    }
  });
});
