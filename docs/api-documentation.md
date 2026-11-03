# JulleyOnline API Specification & Documentation

**Version:** 1.0.0 (Phase 2B Complete)  
**Base URL:** `http://localhost:5000/api/v1`  
**Authentication:** Bearer JWT in `Authorization` header (`Authorization: Bearer <token>`)  
**Tenant Context:** UUID in `X-Tenant-ID` header (`X-Tenant-ID: <tenantId>`) for tenant-scoped operations.

---

## 1. System & Health Endpoints

### `GET /api/health`
- **Description:** Verifies service and PostgreSQL database connectivity.
- **Headers:** None.
- **Response `200 OK`:**
  ```json
  {
    "status": "healthy",
    "timestamp": "2026-11-01T11:55:00.000Z",
    "uptimeSeconds": 32,
    "environment": "development",
    "services": {
      "server": {
        "status": "up"
      },
      "database": {
        "status": "connected",
        "engine": "PostgreSQL",
        "responseTimeMs": 8
      }
    }
  }
  ```

---

## 2. Authentication & Account Management

### `POST /api/v1/auth/register`
- **Description:** Bootstraps an organization, initial tenant workspace, and initial Org Admin user.
- **Body:**
  ```json
  {
    "name": "Alice Admin",
    "email": "alice@acme.com",
    "password": "password123",
    "orgName": "Acme Tech",
    "orgSlug": "acme-tech",
    "tenantName": "Engineering"
  }
  ```
  *(Note: `tenantName` is optional and defaults to `"General Workspace"`. The workspace slug is automatically derived from the tenant name; `tenantSlug` is not accepted as an input field.)*
- **Response `201 Created`:** Returns user profile, organization, default tenant, and JWT token.

### `POST /api/v1/auth/login`
- **Description:** Authenticates user via bcrypt password check; returns JWT token and memberships.
- **Body:** `{ "email": "alice@acme.com", "password": "password123" }`
- **Response `200 OK`:** Returns `{ token, user, memberships }`.

### `POST /api/v1/auth/logout`
- **Description:** Invalidate session; documents stateless JWT logout where the client purges the token from local storage and memory.
- **Headers:** `Authorization: Bearer <token>`
- **Body:** None
- **Response `200 OK`:**
  ```json
  {
    "success": true,
    "message": "User logged out successfully. Invalidate local token cache."
  }
  ```

### `GET /api/v1/auth/me`
- **Description:** Returns authenticated user profile, organization memberships, and tenant memberships.
- **Headers:** `Authorization: Bearer <token>`

### `GET /api/v1/auth/me/contexts`
- **Description:** Returns available organizations and subordinate tenants accessible by the user.

### `POST /api/v1/auth/switch-context`
- **Description:** Switches active tenant context, verifying user membership and resolving effective role.
- **Body:** `{ "tenantId": "<uuid>" }`

---

## 3. Organization & Tenant Management

### `GET /api/v1/organizations`
- **Description:** List organizations accessible to the user (Org Admins see all org tenants; Members see assigned tenants).

### `GET /api/v1/organizations/:orgId`
- **Description:** View organization details.

### `PATCH /api/v1/organizations/:orgId`
- **Description:** Update organization name/slug (Org Admin only).

### `POST /api/v1/organizations`
- **Description:** Create a new organization with a default tenant workspace and bootstrap the creator as Org Admin.
- **Headers:** `Authorization: Bearer <token>`
- **Body:** `{ "name": "Acme Ventures", "slug": "acme-ventures" }`
- **Response `201 Created`:** Returns created organization, default workspace, and updated context.

### `DELETE /api/v1/organizations/:orgId`
- **Description:** Delete organization and all subordinate workspaces and boards (Org Admin only).
- **Headers:** `Authorization: Bearer <token>`
- **Query Parameter:** `?force=true` (Required if active workspaces or boards exist).
- **Safe Deletion Policy:** Attempting deletion without `?force=true` when child entities exist returns `HTTP 400 Bad Request` with warning and dependent counts.

### `GET /api/v1/organizations/:orgId/tenants`
- **Description:** List all tenant workspaces in this organization.
- **Headers:** `Authorization: Bearer <token>`
- **Roles:** All organization members.
- **Response `200 OK`:** Array of tenant workspace objects.

### `POST /api/v1/organizations/:orgId/tenants`
- **Description:** Create a new tenant workspace in the organization (Org Admin only).
- **Headers:** `Authorization: Bearer <token>`
- **Body:** `{ "name": "Marketing", "slug": "marketing" }`
- **Response `201 Created`:** Created tenant details.

### `DELETE /api/v1/organizations/:orgId/members/:membershipId`
- **Description:** Remove an Org Admin or organization member. Protected against removing the last Organization Administrator.
- **Headers:** `Authorization: Bearer <token>`
- **Roles:** Org Admin only.
- **Response `200 OK`:** `{ "success": true, "message": "Organization member removed successfully" }`.

### `GET /api/v1/tenants/:tenantId`
- **Description:** View specific tenant details.

### `PATCH /api/v1/tenants/:tenantId`
- **Description:** Update tenant name/slug (Tenant Admin or Org Admin).

### `DELETE /api/v1/tenants/:tenantId`
- **Description:** Delete tenant workspace and cascade delete all boards, columns, and tasks (Org Admin only).
- **Headers:** `Authorization: Bearer <token>`
- **Query Parameter:** `?force=true` (Required if boards or tasks exist in workspace).
- **Safe Deletion Policy:** Attempting deletion without `?force=true` when boards exist returns `HTTP 400 Bad Request` with warning and dependent counts.

### `GET /api/v1/tenants/:tenantId/activities`
- **Description:** Get chronological audit activity logs for the entire tenant workspace, with optional board filtering.
- **Headers:** `Authorization: Bearer <token>`
- **Query Parameters:** `?boardId=<uuid>` (optional), `?limit=50` (optional, default 50).
- **Roles:** Tenant members (`ORG_ADMIN`, `TENANT_ADMIN`, `MEMBER`).
- **Response `200 OK`:** Array of tenant activity logs with actor metadata.

### `GET /api/v1/tenants/:tenantId/members`
- **Description:** List members of the tenant workspace with roles.

### `POST /api/v1/tenants/:tenantId/members`
- **Description:** Add an existing user to the tenant workspace (`role: 'TENANT_ADMIN' | 'MEMBER'`).

### `PATCH /api/v1/tenants/:tenantId/members/:membershipId`
- **Description:** Update member role within tenant.

### `DELETE /api/v1/tenants/:tenantId/members/:membershipId`
- **Description:** Remove member from tenant workspace (protected against removing the last Org Admin).

---

## 4. Board APIs

### `GET /api/v1/boards`
- **Headers:** `Authorization: Bearer <token>`, `X-Tenant-ID: <uuid>`
- **Query Params:** `?q=<string>` or `?search=<string>` (optional search filter by name or board UUID)
- **Roles:** All tenant members (`ORG_ADMIN`, `TENANT_ADMIN`, `MEMBER`).
- **Response `200 OK`:** Array of board summaries with `columnCount` and `taskCount`.

### `POST /api/v1/boards`
- **Headers:** `Authorization`, `X-Tenant-ID`
- **Roles:** `ORG_ADMIN`, `TENANT_ADMIN`.
- **Body:**
  ```json
  {
    "name": "Sprint 24 Board",
    "description": "Core Engineering Sprint Board"
  }
  ```
- **Response `201 Created`:** Creates board and automatically initializes 3 default columns: `Backlog` (pos 0), `In Progress` (pos 1), `Done` (pos 2).

### `GET /api/v1/boards/:boardId`
- **Headers:** `Authorization`, `X-Tenant-ID`
- **Roles:** All tenant members.
- **Response `200 OK`:** Full authoritative snapshot including ordered columns and nested ordered tasks with creator/assignee metadata.

### `PUT /api/v1/boards/:boardId`
- **Headers:** `Authorization`, `X-Tenant-ID`
- **Roles:** `ORG_ADMIN`, `TENANT_ADMIN`.
- **Body:** `{ "name": "Updated Name", "description": "Updated Description" }`

### `DELETE /api/v1/boards/:boardId`
- **Headers:** `Authorization`, `X-Tenant-ID`
- **Roles:** `ORG_ADMIN`, `TENANT_ADMIN`.
- **Response `200 OK`:** Deletes board, columns, tasks, and activity logs.

### `GET /api/v1/boards/:boardId/activities`
- **Headers:** `Authorization`, `X-Tenant-ID`
- **Query Params:** `?limit=50`
- **Response `200 OK`:** Chronological activity audit log for the board.

---

## 5. Column APIs

### `POST /api/v1/boards/:boardId/columns`
- **Headers:** `Authorization`, `X-Tenant-ID`
- **Roles:** `ORG_ADMIN`, `TENANT_ADMIN`.
- **Body:** `{ "name": "QA Review" }`
- **Response `201 Created`:** Adds column with next contiguous position `max(position) + 1`.

### `PUT /api/v1/columns/:columnId`
- **Headers:** `Authorization`, `X-Tenant-ID`
- **Roles:** `ORG_ADMIN`, `TENANT_ADMIN`.
- **Body:** `{ "name": "QA & Staging" }`

### `POST /api/v1/columns/:columnId/move`
- **Headers:** `Authorization`, `X-Tenant-ID`
- **Roles:** `ORG_ADMIN`, `TENANT_ADMIN`.
- **Body:** `{ "newPosition": 1 }`
- **Response `200 OK`:** Atomically shifts sibling columns using transaction-safe integer reordering with row-level locks.

### `DELETE /api/v1/columns/:columnId`
- **Headers:** `Authorization`, `X-Tenant-ID`
- **Roles:** `ORG_ADMIN`, `TENANT_ADMIN`.
- **Safety Policy:**
  - If column contains $\ge 1$ task: **Returns `400 Bad Request`** (`Cannot delete column containing X task(s)...`).
  - If column is empty: Deletes column and shifts subsequent column positions left (`position = position - 1`).

---

## 6. Task APIs & Optimistic Concurrency Control (OCC)

### `GET /api/v1/tasks`
- **Description:** Search or list tasks within the active tenant workspace.
- **Headers:** `Authorization: Bearer <token>`, `X-Tenant-ID: <uuid>`
- **Query Params:**
  - `?q=<string>` or `?search=<string>`: Optional substring search against task title and description.
  - `?boardId=<uuid>`: Optional board filter.
  - `?limit=<int>`: Maximum results (default: 20).
- **Roles:** All tenant members (`ORG_ADMIN`, `TENANT_ADMIN`, `MEMBER`).
- **Response `200 OK`:** Array of task objects with assignee and column details.

### `POST /api/v1/boards/:boardId/tasks`
- **Headers:** `Authorization`, `X-Tenant-ID`
- **Roles:** All tenant members (`ORG_ADMIN`, `TENANT_ADMIN`, `MEMBER`).
- **Body:**
  ```json
  {
    "columnId": "<uuid>",
    "title": "Implement Auth Middleware",
    "description": "Verify JWT and tenant context",
    "priority": "HIGH",
    "assignedToUserId": "<uuid-or-null>",
    "dueDate": "2026-11-05T00:00:00.000Z"
  }
  ```
- **Response `201 Created`:** Created task with contiguous `position`, `version: 1`, and creator/assignee metadata.

### `GET /api/v1/tasks/:taskId`
- **Headers:** `Authorization`, `X-Tenant-ID`
- **Roles:** All tenant members.
- **Response `200 OK`:** Task details.

### `PUT /api/v1/tasks/:taskId`
- **Description:** Updates task details with monotonic version verification.
- **Headers:** `Authorization`, `X-Tenant-ID`
- **Roles:** All tenant members.
- **Body:**
  ```json
  {
    "title": "New Title",
    "description": "Updated description",
    "priority": "URGENT",
    "assignedToUserId": "<uuid-or-null>",
    "version": 1
  }
  ```
- **Success `200 OK`:** Returns task with `version: 2`.
- **Conflict `409 Conflict` (Stale Update):**
  If `version` in payload does not match the database:
  ```json
  {
    "success": false,
    "error": {
      "code": "CONFLICT",
      "message": "Task has been modified by another collaborator. Please refresh.",
      "details": {
        "currentTask": {
          "id": "<taskId>",
          "version": 2,
          "title": "Current Authoritative Title",
          ...
        }
      }
    }
  }
  ```

### `POST /api/v1/tasks/:taskId/move`
- **Description:** Moves/reorders task within or across columns with contiguous integer shifting and OCC.
- **Headers:** `Authorization`, `X-Tenant-ID`
- **Roles:** All tenant members.
- **Body:**
  ```json
  {
    "targetColumnId": "<uuid>",
    "newPosition": 0,
    "version": 2
  }
  ```
- **Rules:**
  - Locks affected columns `FOR UPDATE` to serialize concurrent moves.
  - Clamps target position to contiguous range `[0, max(position)]`.
  - Atomically closes gap in source column and opens gap in target column.
  - Returns `409 Conflict` if the task was moved or updated concurrently (`version` mismatch).

### `DELETE /api/v1/tasks/:taskId`
- **Description:** Deletes a task using atomic OCC version verification and closes column position gaps.
- **Headers:** `Authorization`, `X-Tenant-ID`
- **Query / Body:** Requires `version` (e.g. `DELETE /api/v1/tasks/:taskId?version=2` or JSON body `{ "version": 2 }`).
- **Roles:** `ORG_ADMIN`, `TENANT_ADMIN`, or the task creator (`createdByUserId === req.user.id`). Other members receive `HTTP 403 Forbidden`.
- **Concurrency & Atomicity:**
  - Locks the column row `FOR UPDATE` in PostgreSQL to serialize concurrent operations.
  - Verifies that the task's current version matches the supplied `version`.
  - Returns `409 Conflict` if the task was updated concurrently (`details.currentTask` provided).
  - Returns `400 Validation Error` if `version` is missing or invalid.
  - Closes contiguous position gaps (`SET position = position - 1 WHERE column_id = ... AND position > deletedPosition`).
  - Emits real-time `task:deleted` Socket.IO broadcast strictly after the database commit succeeds.
- **Response `200 OK`:**
  ```json
  {
    "success": true,
    "message": "Task deleted successfully",
    "taskId": "<uuid>",
    "boardId": "<uuid>",
    "columnId": "<uuid>"
  }
  ```

---

## 7. Error Handling Standard

All non-2xx responses follow a standardized error structure:
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR | UNAUTHORIZED | FORBIDDEN | NOT_FOUND | CONFLICT | INTERNAL_ERROR",
    "message": "Human-readable error explanation",
    "details": { ... }
  }
}
```

---

## 8. WebSocket Event Contracts (Socket.IO)

The real-time collaboration layer connects via Socket.IO at `/socket.io` with Bearer JWT handshake authentication.

### 8.1 Room Subscriptions & Lifecycle

| Action | Direction | Event | Payload | Behavior / Verification |
| :--- | :--- | :--- | :--- | :--- |
| **Join Tenant** | Client $\to$ Server | `join:tenant` | `{ tenantId }` | Database membership check; assigns socket to `tenant:<tenantId>`. |
| **Join Tenant Ack** | Server $\to$ Client | `tenant:joined` | `{ success: true, room, tenantId, activeUsers }` | Acknowledges tenant join with online workspace users. |
| **Leave Tenant** | Client $\to$ Server | `leave:tenant` | `{ tenantId }` | Leaves tenant room, decrements socket count, syncs presence. |
| **Join Board** | Client $\to$ Server | `join:board` | `{ tenantId, boardId }` | Validates board exists in tenant and user has membership; joins `tenant:<tId>:board:<bId>`. |
| **Join Board Ack** | Server $\to$ Client | `room:joined` | `{ success: true, room, boardId, tenantId, activeUsers }` | Acknowledges board join with online board collaborators. *(Note: Event name is `room:joined`, not `board:joined`)*. |
| **Leave Board** | Client $\to$ Server | `leave:board` | `{ tenantId, boardId }` | Exits board room, updates active users stack via `presence:sync`. |
| **Unauthorized** | Server $\to$ Client | `error:unauthorized` | `{ error, code: 'FORBIDDEN' \| 'NOT_FOUND' }` | Emitted when attempting unauthorized tenant or board room access. |
| **Revocation** | Server $\to$ Client | `room:kicked` | `{ tenantId, message }` | Triggered when user membership is revoked; drops subscriptions. |

### 8.2 Real-Time Broadcast Payloads

All board mutation events are broadcast **strictly after the PostgreSQL transaction commits**:

| Event | Target Room | Broadcast Payload Fields |
| :--- | :--- | :--- |
| `task:created` | Board room | `{ eventId, type: 'task:created', boardId, tenantId, timestamp, task, version }` |
| `task:updated` | Board room | `{ eventId, type: 'task:updated', boardId, tenantId, timestamp, task, version }` |
| `task:moved` | Board room | `{ eventId, type: 'task:moved', boardId, tenantId, timestamp, task, targetColumnId, newPosition, version }` |
| `task:deleted` | Board room | `{ eventId, type: 'task:deleted', boardId, tenantId, timestamp, taskId, columnId, boardId }` |
| `column:created` | Board room | `{ eventId, type: 'column:created', boardId, tenantId, timestamp, column }` |
| `column:updated` | Board room | `{ eventId, type: 'column:updated', boardId, tenantId, timestamp, column }` |
| `column:moved` | Board room | `{ eventId, type: 'column:moved', boardId, tenantId, timestamp, column }` |
| `column:deleted` | Board room | `{ eventId, type: 'column:deleted', boardId, tenantId, timestamp, columnId, boardId }` |
| `presence:sync` | Board room | `{ boardId, tenantId, activeUsers, timestamp }` |
| `tenant:presence:sync`| Tenant room | `{ tenantId, activeUsers, timestamp }` |

*(Note: Broadcast payloads contain `eventId`, `timestamp`, and entity models. They do not contain `actorId` or `clientRequestId` fields).*

### 8.3 Client Synchronization, Ordering & Conflict Protocol

1. **Event-ID Deduplication:** Clients track processed event IDs (`processedEventsRef`, bounded to 200 items). Duplicate events received via reconnections or network echoes are immediately dropped.
2. **Synchronous Version Comparison:** Local `taskVersionMap` caches the authoritative monotonic version for each task. If an incoming `task:moved` or `task:updated` event has a version lower than the cached version (`event.version < localTask.version`), it is safely discarded as a stale broadcast.
3. **Authoritative Snapshot Reconciliation:** On structural board changes (column move, task move across columns) and socket reconnections, the client triggers `fetchBoardSnapshot(currentBoardId)` (`GET /api/v1/boards/:boardId`) to ensure sibling card positions and metadata are completely synchronized with PostgreSQL.
4. **Optimistic Updates & HTTP 409 Rollback:** Frontend applies optimistic UI adjustments immediately. If the server rejects the request with HTTP 409 Conflict, the client displays a conflict notification modal and refreshes to the latest authoritative database state.
5. **Reconnection Synchronization:** Upon network recovery, the client automatically re-authenticates, re-emits `join:tenant` and `join:board`, and triggers `onReconnectResync` to reload authoritative board data without manual refresh.

---

## 9. AI Kanban Assistant Endpoints

The AI Assistant provides read-only natural language analysis of Kanban boards and workspace metrics, processed via a three-tier execution cascade (Gemini $\to$ Ollama Cloud $\to$ Local Engine).

### `POST /api/v1/ai/chat`
- **Description:** Queries the AI Kanban Assistant with a natural language question scoped to the authorized tenant workspace and optional board filter.
- **Headers:**
  - `Authorization: Bearer <jwt_token>` (Required)
  - `X-Tenant-ID: <uuid>` (Required — Tenant workspace boundary)
  - `Content-Type: application/json`
- **Request Body:**
  ```json
  {
    "query": "Show all overdue tasks across the workspace",
    "boardId": "3b29c91d-9e67-4eb4-bca5-b38fae1f762a"
  }
  ```
  *(Note: `boardId` is optional; when omitted, scope defaults to the entire active tenant workspace).*
- **Response `200 OK`:**
  ```json
  {
    "success": true,
    "data": {
      "answer": "There are currently 2 overdue tasks in the selected board...",
      "responseType": "overdue_summary",
      "data": {
        "overdueCount": 2,
        "tasksAnalyzed": 45,
        "tasksWithDueDates": 20,
        "tasksWithoutDueDates": 25,
        "tasks": [
          {
            "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
            "title": "Database index optimization",
            "priority": "HIGH",
            "columnName": "In Progress",
            "dueDate": "2026-10-28T00:00:00.000Z",
            "daysOverdue": 6
          }
        ]
      },
      "metrics": {
        "totalTasks": 45,
        "completedTasks": 15,
        "pendingTasks": 30,
        "overdueTasks": 2,
        "unassignedTasks": 5,
        "tasksWithDueDates": 20,
        "completionInferencePolicy": "explicit_done_column_or_normalized_done_status",
        "isInferredCompletion": true,
        "byColumn": { "Backlog": 12, "In Progress": 18, "Done": 15 },
        "byPriority": { "LOW": 5, "MEDIUM": 25, "HIGH": 12, "URGENT": 3 }
      },
      "toolExecution": {
        "toolsCalled": ["get_overdue_tasks"],
        "recordsAnalyzed": 45,
        "scope": "Frontend App Board"
      },
      "generation": {
        "source": "llm",
        "provider": "gemini",
        "tier": 1,
        "model": "gemini-3.5-flash",
        "fallbackUsed": false
      }
    }
  }
  ```
- **Three-Tier Metadata Contract (`generation`):**
  - Tier 1 (Gemini): `{ source: "llm", provider: "gemini", tier: 1, model: "gemini-3.5-flash", fallbackUsed: false }`
  - Tier 2 (Ollama Cloud): `{ source: "llm", provider: "ollama", tier: 2, model: "gemma4:31b (ollama)", fallbackUsed: true, failureReason: "gemini_unavailable" }`
  - Tier 3 (Local Deterministic Engine): `{ source: "local", provider: "local", tier: 3, model: "deterministic-v1", fallbackUsed: true, failureReason: "..." }`
  - Intent Guardrail Notice: `{ source: "guardrail", provider: null, tier: null, model: null, fallbackUsed: false }`
- **Error Responses:**
  - `400 Bad Request`: Validation failure (empty query, query > 1000 characters, invalid `boardId` UUID).
  - `401 Unauthorized`: Missing, expired, or invalid JWT Bearer token.
  - `403 Forbidden`: `boardId` belongs to a different tenant workspace, or user lacks membership in `X-Tenant-ID`.
  - `502 Bad Gateway`: AI microservice is offline, returned an unparseable response, or external LLM providers failed when in `AI_RESPONSE_MODE=llm`. Client receives sanitized message without stack traces.
  - `504 Gateway Timeout`: AI microservice exceeded the 15,000ms timeout threshold.
