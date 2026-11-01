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
    "database": {
      "status": "connected",
      "latencyMs": 2
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
    "tenantName": "Engineering",
    "tenantSlug": "engineering"
  }
  ```
- **Response `201 Created`:** Returns user profile, organization, default tenant, and JWT token.

### `POST /api/v1/auth/login`
- **Description:** Authenticates user via bcrypt password check; returns JWT token and memberships.
- **Body:** `{ "email": "alice@acme.com", "password": "password123" }`
- **Response `200 OK`:** Returns `{ token, user, memberships }`.

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

### `POST /api/v1/organizations/:orgId/tenants`
- **Description:** Create a new tenant workspace in the organization (Org Admin only).
- **Body:** `{ "name": "Marketing", "slug": "marketing" }`

### `GET /api/v1/tenants/:tenantId`
- **Description:** View specific tenant details.

### `PATCH /api/v1/tenants/:tenantId`
- **Description:** Update tenant name/slug (Tenant Admin or Org Admin).

### `DELETE /api/v1/tenants/:tenantId`
- **Description:** Delete tenant workspace and cascade delete all boards, columns, and tasks (Org Admin only).

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
- **Headers:** `Authorization`, `X-Tenant-ID`
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
- **Headers:** `Authorization`, `X-Tenant-ID`
- **Roles:** `ORG_ADMIN`, `TENANT_ADMIN`, or the user who created the task (`createdByUserId === req.user.id`).
- **Response `200 OK`:** Deletes task and closes contiguous gap in the column.

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
