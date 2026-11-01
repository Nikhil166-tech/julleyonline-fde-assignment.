# JulleyOnline — Approved Frontend Implementation Specification

**Status:** UI design approved by the project owner; implement in existing `julleyonline-fde-assignment/frontend`.
**Deadline:** 2026-11-02.
**Design source:** `julleyonline_approved_ui_reference.png` (attached). The visual mockup is the aesthetic/layout reference; its example dates, task counts, filler text, people, and icons are not production data. Use the actual database and correct names.
**Scope:** All JulleyOnline assignment functionality and meaningful edge cases, except optional Agentic AI. Do not mock an API that already exists. Do not ship inert UI controls or claim a feature works unless it does.

## 1. Visual system: reproduce the approved reference faithfully

- A desktop-first enterprise SaaS shell: deep navy/indigo vertical left sidebar and a clean, airy white main content surface.
- Brand mark/name `JulleyOnline` at the top of the left sidebar; clear navigation items with a vivid violet selected state.
- Top bar with **two distinct authorized selectors**: Organization and Tenant/Workspace; search only if truly implemented, notifications only if backed by real state, and authenticated user menu with sign-out.
- Primary accent: vivid violet/indigo; subtle violet selection backgrounds, pale blue-gray panel surfaces, green success, amber warning, red destructive/error. Derive exact visual tokens from reference and centralize them in a theme/CSS file. Use consistent typography such as Inter, accessible contrast, an 8px spacing grid, 10–14px card radii, restrained shadows, consistent Lucide icons, and predictable focus/hover/pressed/disabled states.
- Main board: breadcrumb and project heading, description, compact avatar/presence cluster, primary **Add Task** action, board toolbar, and four default columns **To Do**, **In Progress**, **Review**, **Done**. User-created columns can supplement or replace defaults via API.
- Columns: soft-tinted header, count badge, actions (where authorized), scrollable vertical card stack and visually obvious drag target. Task cards: short clear title, optional description, priority badge, assignee avatar/name, indicators of supported metadata, hover and keyboard focus states. Never hard-code task counts; derive from API responses.
- Right side **Task Details** drawer: editable title, description, status, assignee, priority (if supported by backend), activity history and actions. Must reflect actual backend contract. If mockup shows comments, attachments, labels or checklists but backend has no corresponding API/storage, do not display fake interactive functionality: either implement verified persistence end to end with documented schema/API change and tests, or omit those unsupported UI elements while preserving panel layout.
- Desktop board workspace should be the primary focus. Add a compact **Recent Activity** strip/panel sourced from activity-logs API when available.
- Visual references may include an 'Analytics', 'Timeline', 'Reports', 'Comments', 'Notifications' or other embellishment. Only provide them as active routes/components if independently implemented and tested. No dead tabs/buttons/placeholders masquerading as shipped features.

## 2. Screens and functional contracts

### Authentication
- Login, account registration, authorized organization bootstrap and sign-out, matching the light/purple visual language.
- JWT session handling with the existing backend; handle 401, expired token, 429 throttling, validation errors, and logout accurately. No client-side role claims.
- Form validation, password visibility, loading and disabled submit, safe error messaging, responsive form layout.
- Forgot password only if a working backend flow exists. Otherwise do not provide a misleading link.

### Organization selector
- Show only organizations returned by authorized backend API. Selecting an organization updates tenant options and clears stale board/task state.
- Show empty state when the user belongs to none. Create organization only via actual authorized API.

### Organization and tenant management
- List, create, rename/update, delete tenants as authorized; confirm destructive operations and show consequences for existing boards/users.
- Organization settings fields and slug are populated from backend. Slug uniqueness and validation errors must be shown clearly.
- Membership list and role management are subject to the actual permission matrix. Protect against role escalation, last-org-admin removal, duplicate memberships.

### Board list and board management
- Cards/rows for authorized boards with name, optional description and real task count/last updated metadata if available.
- Create/edit/delete boards with confirm dialogs, server validation, zero-board empty state.

### Kanban workspace
- Default layout: four columns in horizontal scrolling container on desktop (maintain min widths). Drag-and-drop via dnd-kit, keyboard support where feasible.
- Task create, edit, assign, delete, move and reorder; column create/edit/reorder/delete. All mutations use live REST endpoints with JWT and active authorized tenant context.
- Show optimistic movement then commit, or rollback/refetch on failure. For HTTP 409 version conflict, show explanatory banner/dialog and **Refresh latest task/board** action. Do not automatically merge; follow preparation guide.
- Server is authoritative for the current task version, ordering, and role/membership state. Do not send fabricated tenant or board ownership.
- Clear loading skeletons, no-task and no-board states, toasts for success/errors, confirmation dialogs, request-in-flight prevention, reconciliation of late API results after switches.

### Members and roles
- Table/cards listing tenant members, role badges and permitted management actions. Organization admin has organization-level scope only within their own organization; tenant admin has authorized tenant scope; member has only permitted task actions.
- Render controls according to role **and enforce restrictions on backend**; server always decides. Cover revoked membership and current role changes.

### Activity history
- Search/filter only when supported in frontend or API; list actual activity records with actor, action, task, time and tenant/board scope. Never expose other tenant logs.

### Settings
- Organization profile, tenant settings, and membership/role configuration from existing backend APIs; ensure authorized access. Avoid fabricated billing/notification settings without persistence.

### Collaboration and resilience (wired later if Socket.IO not yet implemented)
- Presence avatars/count; task:created, task:updated, task:moved, task:deleted, presence:sync and authorized board join/leave events.
- When board changes, leave old room, authorize the new one, and refetch authoritative data.
- Recover after disconnect by reauthenticating/rejoining authorized rooms and re-fetching the full board; never assume missed events are replayed.
- De-duplicate events; ignore older versions; avoid cross-tenant UI leakage. Multiple tabs should not incorrectly display the user offline if presence is connection-count-based.

### Undo / redo
- User-facing controls enabled only for supported reversible actions. Use server-authoritative/current-version checks when undo/redo can conflict. Do not undo other users' newer work. Indicate impossible/stale undo explicitly.

### Responsive behavior
- Desktop: fixed-width sidebar + wide horizontal board + optional right details drawer.
- Tablet: collapsible left sidebar; right details drawer overlay or modal.
- Mobile: compact top bar/organization and tenant switcher, board columns horizontally scrollable or accessible column selector; task details full-screen drawer. Avoid unreadable miniature columns.
- All modal/drawer states accessible with focus management, Escape, label connections, keyboard nav and contrast.

## 3. Required implementation architecture

- React + Vite + React Router + Tailwind CSS, dnd-kit, central API client; components should be modular and reusable.
- Inspect existing `backend/src` route definitions and `docs/api-documentation.md` first; do not invent endpoints or payload fields. Backend is source of truth. For missing endpoint functionality required by assignment, document the gap and implement backend endpoint with tests, rather than silently simulating it.
- Suggested layout: `src/app/`, `src/components/layout/`, `src/components/ui/`, `src/features/auth/`, `src/features/organizations/`, `src/features/tenants/`, `src/features/boards/`, `src/features/tasks/`, `src/features/members/`, `src/features/activities/`, `src/features/settings/`, `src/lib/api/`, `src/hooks/`, `src/styles/`.
- Use route guards for UX, plus server authorization (route guards do not secure data).
- State/query handling should prevent a response for tenant A from being rendered after switching to tenant B. Keys must include tenant/board context. Abort in-flight requests or ignore stale responses.
- Design tokens must be centralized. No repeated ad hoc CSS values; ensure consistent spacing, typography, colors and icon sizing across all routes.

## 4. Build workflow in Antigravity

1. Review screenshot and this specification; inspect frontend folder, all actual backend APIs, Prisma schema and existing tests.
2. Provide a route map, component hierarchy, real API mapping and design tokens **before editing**.
3. Implement app shell and authentication pages, run/verify.
4. Implement org selection, tenant management, board list and members/settings/activity screens, run/verify.
5. Implement Kanban, tasks, drawer and drag-and-drop with actual API, run/verify.
6. Implement error/empty/loading/409, undo/redo and responsive states, run/verify.
7. Add Socket.IO only in the real-time phase if it does not yet exist; ensure UI displays a truthful offline/pending state rather than fake live features.
8. Test keyboard/viewport/accessibility and complete integrated scenarios. Capture actual screenshots for desktop and mobile, and compare to screenshot reference, iterating until close.
9. Maintain the requirements-to-tests matrix and a documented gap list; do not mark untested features as complete. Git commit at verified checkpoints.

## 5. Acceptance tests / definition of done

- User can log in and out; protected routes deny unauthenticated access; invalid sessions safely recover.
- Alice/Bob/Charlie roles and organization/tenant permission matrix match validated backend behavior.
- Organization/tenant switch does not expose or briefly display data from the previous workspace.
- Board, column and task mutations persist to PostgreSQL and survive reload; invalid/forbidden operations are rejected cleanly.
- Drag-and-drop moves correctly within/across columns; keyboard and touch behaviors are usable; rollback after server failure works.
- HTTP 409 shows latest-state refresh and does not silently overwrite an updated task.
- If socket server is implemented: Bob and Charlie see committed events in separate sessions; foreign-tenant user never receives events; reconnect refetches current board; presence reflects actual connections.
- Undo/redo does not corrupt shared state or erase another user's newer work.
- Desktop, tablet, phone layout tested; no clipping, dead links, decorative buttons masquerading as working features or fabricated status metrics.
- `npm run build` / `pnpm build`, lint, tests, actual browser automation, and backend regression suite executed and results recorded with dates/screenshots.
- Design screenshot fidelity reviewed against approved reference; report deviations with reasons.

## 6. Source-of-truth priority and limits

1. Original assignment requirements and the user-approved full-scope decision (everything except AI).
2. Actual implemented backend API contracts and database schema (must be verified by inspecting repo).
3. The approved visual reference screenshot for appearance and navigation pattern.
4. This specification for interaction details, failure handling and evaluation criteria.

The screenshot is concept art, not a functional specification for invented features or a guarantee of accessibility. Preserve the exact design direction while making controls truthful, secure and usable.
