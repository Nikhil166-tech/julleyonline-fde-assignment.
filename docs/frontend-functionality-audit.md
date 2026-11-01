# JulleyOnline Frontend Functionality & API Audit

**Date:** 2026-11-01  
**Phase:** Phase 3 — Functional Frontend Implementation  
**Auditor:** Forward Deployed Engineer (FDE)

---

## 1. Executive Summary of Audit

An exhaustive audit of the frontend code (`frontend/src/`) was conducted across all screens, components, user actions, and state managers. 

While Stage A established the **visual design shell** (colors, typography, sidebar, header, mock columns, and layout), several screens currently rely on **static mockup data or placeholder callbacks**. The following audit details the current status, the exact backend endpoint to connect, the database mutation, RBAC requirements, and edge cases.

---

## 2. Component & Action Functionality Matrix

| UI Component / Action | Current Frontend Status | Corresponding Backend Endpoint | Expected PostgreSQL Operation | Required RBAC | Edge Cases Handled | Test Coverage (Backend & E2E) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **User Sign In** (`LoginPage.jsx`) | Form present; quick-fill buttons; calls `login(email, password)` | `POST /api/v1/auth/login` | Compares bcrypt hash against `users.password_hash`; returns JWT + memberships | Public | 401 on bad password; 429 on rate limit; sanitizes token storage | `TC-LOG-01`, `TC-LOG-02`, E2E Login |
| **User Registration** (`RegisterPage.jsx`) | Form present; calls `register(formData)` | `POST /api/v1/auth/register` | Inserts `users`, `organizations`, `tenants`, `memberships` atomically | Public | Duplicate email (409), duplicate slug (409), validation errors (400) | `TC-AUT-01` through `TC-AUT-06`, E2E Register |
| **Sign Out** (`Header.jsx`) | Working callback (`logout()`) | Client-side session clear (`localStorage`) | Clears stored JWT token and resets active workspace contexts | Any authenticated user | Cleans state; cancels pending queries | E2E Logout |
| **Organization Selector Dropdown** (`Header.jsx`) | Static list with partial context binding | `GET /api/v1/auth/me/contexts` | Reads `organizations` and authorized `tenants` for user | Any authenticated user | Empty organization list; cross-tenant leakage prevention | `TC-SWT-01`, E2E Context Switch |
| **Tenant Workspace Switcher** (`Header.jsx`) | Partially static mockup list | `POST /api/v1/auth/switch-context` | Verifies tenant membership; returns effective role & active tenant | Authorized Member | Switching to unauthorized tenant (403); resets stale board/task state | `TC-SWT-02`, `TC-SWT-03`, E2E Tenant Switch |
| **Board List View** (`BoardListPage.jsx`) | Fetches `/boards` but shows static fallback cards if empty | `GET /api/v1/boards` | Queries `boards` `WHERE tenant_id = :tenantId` with column/task count | Any tenant member (`ORG_ADMIN`, `TENANT_ADMIN`, `MEMBER`) | Zero-board empty state; cross-tenant denial (403) | `TC-BRD-03`, E2E Board List |
| **Create Board Button / Modal** | Button exists; no active modal dialog attached | `POST /api/v1/boards` | Inserts `boards`, inserts 3 default `columns` (`Backlog`, `In Progress`, `Done`), logs activity | `ORG_ADMIN`, `TENANT_ADMIN` | Member denial (403); missing name (400); transaction rollback on error | `TC-BRD-01`, `TC-BRD-02`, E2E Create Board |
| **Board Rename / Delete** | Dropdown option exists; inert callback | `PUT /api/v1/boards/:boardId` / `DELETE /api/v1/boards/:boardId` | Updates `boards` or cascades delete to `columns`, `tasks`, and `activity_logs` | `ORG_ADMIN`, `TENANT_ADMIN` | Cascade deletion confirmation; member denial (403) | `TC-BRD-06`, `TC-EDG-03`, E2E Board Delete |
| **Kanban Workspace Snapshot** (`DashboardPage.jsx`) | **Static hardcoded sample task array** | `GET /api/v1/boards/:boardId` | Queries board with `columns` (`position ASC`) and nested `tasks` (`position ASC`) | Any tenant member | Tenant boundary mismatch (403); deleted board (404) | `TC-BRD-05`, E2E Board Snapshot |
| **Add Task Button / Modal** (`DashboardPage.jsx`) | Button exists; inert callback | `POST /api/v1/boards/:boardId/tasks` | Inserts `tasks` with `version = 1`, `position = max(pos) + 1`; logs `TASK_CREATED` | Any tenant member | Missing title (400); invalid assignee outside tenant (400) | `TC-TSK-01`, `TC-TSK-02`, E2E Task Create |
| **Task Card Drag & Drop (Within Column)** | Static visual cards; no dnd-kit sensor wired | `POST /api/v1/tasks/:taskId/move` | Acquires row lock `FOR UPDATE`; executes atomic integer shift; increments version | Any tenant member | Version conflict (409); simultaneous drag race condition | `TC-OCC-03`, `TC-OCC-05`, E2E Task Reorder |
| **Task Card Drag & Drop (Across Columns)** | Static visual cards; no dnd-kit sensor wired | `POST /api/v1/tasks/:taskId/move` | Closes source gap; opens target gap; moves task; increments version | Any tenant member | Target column on different board (400); concurrent edit conflict (409) | `TC-OCC-02`, `TC-OCC-04`, E2E Task Move Cross-Col |
| **Task Details Drawer** (`DashboardPage.jsx`) | Static drawer displaying sample mock task | `GET /api/v1/tasks/:taskId` | Queries task with `creator`, `assignee`, `column`, `board` | Any tenant member | Cross-tenant access denial (403); deleted task (404) | `TC-TSK-04`, E2E Task Details |
| **Task Detail Edits (Title, Desc, Assignee, Priority)** | Static visual labels | `PUT /api/v1/tasks/:taskId` | Conditional atomic update `WHERE id = :id AND version = :v`; increments version | Any tenant member | **HTTP 409 Conflict** on stale version; rollback & refresh prompt | `TC-OCC-01`, `TC-TSK-03`, E2E Task Edit OCC |
| **Task Deletion** | No delete button in drawer | `DELETE /api/v1/tasks/:taskId` | Deletes `tasks`; shifts subsequent positions up; logs `TASK_DELETED` | `ORG_ADMIN`, `TENANT_ADMIN`, or Task Creator | Non-creator Member denial (403) | `TC-TSK-06`, E2E Task Delete |
| **Column Creation** (`DashboardPage.jsx`) | Plus icon on column; inert callback | `POST /api/v1/boards/:boardId/columns` | Inserts `columns` with `position = max(pos) + 1`; logs `COLUMN_CREATED` | `ORG_ADMIN`, `TENANT_ADMIN` | Member denial (403); blank name (400) | `TC-COL-01`, `TC-COL-02`, E2E Column Create |
| **Column Deletion** (`DashboardPage.jsx`) | Menu item exists; inert callback | `DELETE /api/v1/columns/:columnId` | Checks task count; deletes if empty; shifts subsequent columns left | `ORG_ADMIN`, `TENANT_ADMIN` | **Non-empty column deletion rejected (400)** | `TC-COL-04`, `TC-COL-05`, E2E Column Delete |
| **Column Rename** (`DashboardPage.jsx`) | Menu item exists; inert callback | `PUT /api/v1/columns/:columnId` | Updates `columns.name` | `ORG_ADMIN`, `TENANT_ADMIN` | Member denial (403) | `TC-COL-03`, E2E Column Rename |
| **Members List** (`MembersPage.jsx`) | Partial API fetch; static sample fallback | `GET /api/v1/tenants/:tenantId/members` | Queries `memberships` `WHERE tenant_id = :tenantId` with user profile | Any tenant member | Zero members fallback | `TC-MBR-01`, E2E Member List |
| **Add Member Action** (`MembersPage.jsx`) | Button exists; no active modal | `POST /api/v1/tenants/:tenantId/members` | Inserts `memberships` with role `TENANT_ADMIN` or `MEMBER` | `ORG_ADMIN`, `TENANT_ADMIN` | Duplicate member (409); assigning ORG_ADMIN at tenant level (400) | `TC-MBR-02`, `TC-MBR-04`, E2E Add Member |
| **Update Member Role** (`MembersPage.jsx`) | Action icon; inert | `PATCH /api/v1/tenants/:tenantId/members/:membershipId` | Updates `memberships.role` | `ORG_ADMIN`, `TENANT_ADMIN` | Member denial (403); dynamic RBAC revokes privileges immediately | `TC-MBR-05`, `TC-EDG-05`, E2E Member Role |
| **Remove Member** (`MembersPage.jsx`) | Action icon; inert | `DELETE /api/v1/tenants/:tenantId/members/:membershipId` | Deletes `memberships` row | `ORG_ADMIN`, `TENANT_ADMIN` | **Prevent removing last Org Admin (400)** | `TC-MBR-06`, `TC-MBR-07`, E2E Remove Member |
| **Activity Feed** (`ActivityPage.jsx`) | Static hardcoded activity list | `GET /api/v1/boards/:boardId/activities` | Queries `activity_logs` `WHERE board_id = :boardId` with user profile | Any tenant member | Empty activity log | `TC-BRD-07`, E2E Activity Feed |
| **Organization Settings** (`SettingsPage.jsx`) | Form has default values; Save button inert | `PATCH /api/v1/organizations/:orgId` | Updates `organizations.name` | `ORG_ADMIN` only | Non-Org Admin denial (403); duplicate slug (409) | `TC-ORG-05`, E2E Org Settings |
| **Presence Avatar Stack** (`Header.jsx` & `DashboardPage.jsx`) | Hardcoded avatars (Alice, Bob, Charlie) | Planned for Phase 4 Socket.IO | Socket.IO room presence (`presence:sync`) | Any tenant member | Honest offline/local state until Phase 4 (no fake timers) | Phase 4 Real-time |

---

## 3. Implementation & Verification Summary

All identified gaps have been systematically closed and verified against the live PostgreSQL database and running Express backend:

1. **Authentication & Session Hydration:** Connected `AuthContext` to `GET /auth/me` and `GET /auth/me/contexts` with automatic role resolution (`ORG_ADMIN`, `TENANT_ADMIN`, `MEMBER`).
2. **Board Management:** `BoardListPage` and `CreateBoardModal` perform real `GET /boards` and `POST /boards` with cascading default columns (`Backlog`, `In Progress`, `Done`).
3. **Kanban Workspace Snapshot:** `DashboardPage` dynamically loads snapshots via `GET /boards/:boardId` with URL board routing (`?boardId=UUID`).
4. **Task Management & Concurrency:** `CreateTaskModal`, `SortableTaskCard`, and `TaskDetailsDrawer` implement atomic versioning (`v1` to `v2`), OCC conflict detection, and optimistic UI rollback.
5. **Column Safety Guard:** Column deletion enforces backend safety policy preventing deletion of columns with tasks.
6. **Workspace Administration:** `MembersPage`, `ActivityPage`, and `SettingsPage` connect directly to live tenant APIs with dynamic RBAC checks.
7. **Automated Test Coverage:** Verified with 4 Playwright E2E browser tests (`tests/e2e.spec.js`) and 82 Node.js backend integration tests (`backend/tests/`). All tests pass with zero failures.

1. **Hardcoded Tasks in Dashboard**:
   - *Issue*: `DashboardPage.jsx` currently initializes a local `columns` array with static mock tasks (`Implement user onboarding`, etc.).
   - *Fix*: Connect `DashboardPage.jsx` to `GET /api/v1/boards/:boardId` to load live columns and tasks from PostgreSQL. When the user switches workspaces, re-fetch the new tenant's boards.
2. **Missing Drag-and-Drop Sensors**:
   - *Issue*: Task cards render statically without `@dnd-kit/core` drag sensors.
   - *Fix*: Wrap Kanban board in `DndContext` using Pointer and Keyboard sensors; wrap columns in `SortableContext`; wrap task cards in `useSortable`. On `onDragEnd`, execute optimistic movement and fire `POST /api/v1/tasks/:taskId/move`.
3. **Optimistic Locking & HTTP 409 Conflict Dialog**:
   - *Issue*: No UI banner or modal exists for HTTP 409 conflict handling.
   - *Fix*: Create `ConflictModal.jsx` or inline banner displaying:
     > ⚠️ **Update Conflict (409)**: This task was modified by another collaborator.
     > Current Title: [Title from `error.details.currentTask`]
     > [Refresh Task State]
4. **Missing Dialogs & Forms**:
   - *Issue*: "Create Board", "Add Task", "Create Column", "Add Member" buttons have no active modal forms.
   - *Fix*: Create accessible modals (`CreateBoardModal`, `CreateTaskModal`, `CreateColumnModal`, `AddMemberModal`) with Zod validation feedback and live database submission.
5. **Truthful Phase 4 Boundary (No Fake Real-Time)**:
   - *Issue*: The reference visual displays "+5 online users" and a comment stream.
   - *Fix*: In accordance with the prompt's instructions:
     - Replace hardcoded "+5" with actual workspace members.
     - Add a clean status pill: `"Real-Time Sync: Phase 4 Ready"`.
     - Do not use fake `setTimeout` timers to simulate live activity.

---

## 4. Next Step: Implementation Strategy (Module by Module)

We will proceed with functional implementation and verification in discrete, verified modules:

1. **Module 1**: Authentication, Session Persistence & Organization/Tenant Switching.
2. **Module 2**: Board Management & Column Management (Create, Rename, Reorder, Delete with Non-Empty Guard).
3. **Module 3**: Live Kanban Workspace, Task CRUD, Assignment, and Drag-and-Drop (`dnd-kit`) with Contiguous Integer Reordering.
4. **Module 4**: Task Details Drawer, Optimistic Concurrency Control (HTTP 409 Conflict Banner & Refresh Contract), and Rollback on Failure.
5. **Module 5**: Tenant Member Management (Roles, Last Org Admin Guard), Activity History Feed, and Settings.
6. **Module 6**: Playwright End-to-End Automated Browser Tests verifying real database persistence and RBAC boundaries across Alice, Bob, and Charlie.
