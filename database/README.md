# Database

This folder is the **database deliverables entry point** for the `collaborative-kanban/` assignment structure.

JulleyOnline uses PostgreSQL and Prisma. The **single source of truth** for the live application remains:

- [Prisma schema](../backend/prisma/schema.prisma) — models, relationships, indexes, constraints and database mappings.
- [Prisma migration history](../backend/prisma/migrations/) — the migrations applied by the backend.
- [Database architecture and design decisions](../docs/database-design.md).
- [Entity relationship diagram](../docs/er-diagram.md) — the assignment's ERD deliverable.

## Running migrations

Run database commands **from `backend/`**, where Prisma is configured:

```bash
cd backend
pnpm install
npx prisma migrate deploy
```

**Do not copy or move** the actual Prisma schema or migration files into this folder. Duplicating them would create conflicting sources of truth and risk breaking the tested backend and migration commands.
