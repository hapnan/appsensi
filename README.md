# Appsensi

**English** | [Bahasa Indonesia](./README.ind.md)

Campus classroom attendance web application powered by WebAuthn passkeys, room & session date scheduling, and live student roster check-in.

## Features

- **Passwordless Passkey Auth** — Student passkey registration (`/register`) and classroom check-in (`/attendance/$roomId`) via `@simplewebauthn/browser`.
- **Room & Session Selector** — Interactive classroom and date picker on `/` with schedule previews (defaults to room `H.2.4`).
- **Live Pending Roster** — Instant search (`⌘K` / `Ctrl+K`), multi-session switcher for rooms with multiple classes per day, and live background updates.

## Tech Stack

- **Framework**: [TanStack Start](https://tanstack.com/start), [TanStack Router](https://tanstack.com/router), [TanStack Query](https://tanstack.com/query), React 19, Vite 8
- **API & Validation**: [tRPC v11](https://trpc.io) (type-safe BFF wrapper over `appsensi-server`), SuperJSON, Zod v4, T3 Env (`@t3-oss/env-core`)
- **Database Schema & Seeding**: PostgreSQL, [Drizzle ORM](https://orm.drizzle.team) & Drizzle Kit
- **Backend & Authentication**: [`@simplewebauthn/browser`](https://simplewebauthn.dev) + [`appsensi-server`](https://github.com/hapnan/appsensi-server) (Go, Gin, GORM, `go-webauthn`)
- **UI & Tooling**: Tailwind CSS v4, Shadcn UI / Radix UI, Lucide Icons, [Bun](https://bun.sh), [Biome](https://biomejs.dev)

## Documentation

Comprehensive project documentation, sequence diagrams, and architecture specifications are available in the [`docs/`](./docs) folder:

- **[Documentation Hub](./docs/README.md)** — Complete index of all technical documentation.
- **[System Architecture Guide](./docs/ARCHITECTURE.md)** — Runtime design, Bun asset preloading, performance optimizations, and security guarantees.
- **[Entity Relationship Diagram (ERD)](./docs/ERD.md)** ([Visual SVG](./docs/ERD.svg)) — Complete data dictionary for all 11 database tables, UUIDv7 indexing, and foreign key cascade rules.
- **[Attendance Flow Diagram](./docs/Flow_Diagram_Attendance.md)** ([Visual SVG](./docs/Flow_Diagram_Attendance.svg)) — Step-by-step passkey verification and attendance recording ceremony.
- **[Registration Flow Diagram](./docs/Flow_Diagram_Register.md)** ([Visual SVG](./docs/Flow_Diagram_Register.svg)) — Student onboarding and WebAuthn credential creation ceremony.
- **[API Reference & Contracts](./docs/API.md)** — Complete specifications for tRPC procedures and companion WebAuthn endpoints.

## Prerequisites

- **[Bun](https://bun.sh)** `>= 1.0`
- **PostgreSQL 18+** (uses native `uuidv7()` on `credentials.id`)
- **[`appsensi-server`](https://github.com/hapnan/appsensi-server)** — Backend Go (`Gin` + `GORM` + `go-webauthn`) service running by default on `http://localhost:8080` with CORS enabled for `http://localhost:3000`:
  - **WebAuthn ceremony endpoints (called directly from the browser)**:
    - `POST /register/begin` & `POST /register/finish` — Passkey registration ceremony (`{ email, username }`, where `username` matches `students.student_id`, e.g. `STU-FCS-001`)
    - `POST /login/begin` & `POST /login/finish` — Passkey verification ceremony (`{ username }`) before recording attendance via `trpc.attendance.checkIn`
  - **Attendance & registration REST endpoints (wrapped by tRPC for end-to-end type safety)**:
    - `GET /attendance/demo-catalog`, `GET /attendance/roster`, `POST /attendance/check-in`
    - `GET /registration/list`, `POST /registration/link-student`, `POST /registration/cleanup-incomplete`

## Environment Variables

Create a `.env.local` (or `.env`) file in the project root:

```dotenv
VITE_WEBAUTHN_SERVER_URL="http://localhost:8080"
# Required only when running Drizzle CLI scripts (db:push, db:migrate, db:seed)
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/appsensi"
```

| Variable | Scope | Required | Default | Description |
| :--- | :--- | :---: | :--- | :--- |
| `VITE_WEBAUTHN_SERVER_URL` | Client & Server | No | `http://localhost:8080` | Base URL of [`appsensi-server`](https://github.com/hapnan/appsensi-server) used by browser WebAuthn ceremonies and server-side tRPC procedures |
| `DATABASE_URL` | CLI / DB Tools | For `db:*` | — | PostgreSQL connection URL used by Drizzle schema migration & seed scripts (`db:push`, `db:migrate`, `db:seed`) |
| `SERVER_URL` | Server | No | — | Optional application server base URL |
| `VITE_APP_TITLE` | Client | No | — | Optional custom application title |
| `PORT` | Server | No | `3000` | Production Bun server port (`server.ts`) |
| `HOST` | Server | No | `0.0.0.0` | Production Bun server bind address (`server.ts`) |
| `ASSET_PRELOAD_MAX_SIZE` | Server | No | `5242880` | Max file size in bytes to preload into memory (5 MB default) |
| `ASSET_PRELOAD_INCLUDE_PATTERNS` | Server | No | — | Comma-separated glob patterns of filenames to preload (e.g. `*.js,*.css`) |
| `ASSET_PRELOAD_EXCLUDE_PATTERNS` | Server | No | — | Comma-separated glob patterns of filenames to exclude from preloading |
| `ASSET_PRELOAD_VERBOSE_LOGGING` | Server | No | `false` | Log detailed preloaded and on-demand static asset tables at startup |
| `ASSET_PRELOAD_ENABLE_ETAG` | Server | No | `true` | Compute weak ETags (`W/"..."`) and handle `304 Not Modified` responses |
| `ASSET_PRELOAD_ENABLE_GZIP` | Server | No | `true` | Pre-compress eligible preloaded static assets with Gzip |
| `ASSET_PRELOAD_GZIP_MIN_SIZE` | Server | No | `1024` | Minimum file size in bytes required for Gzip compression |
| `ASSET_PRELOAD_GZIP_MIME_TYPES` | Server | No | `text/,application/javascript,...` | Comma-separated MIME types/prefixes eligible for Gzip compression |

## Quick Start

```bash
# 1. Install dependencies
bun install

# 2. Push the Drizzle schema to PostgreSQL
bun run db:push

# 3. Seed campus buildings (A–I), classrooms, 6 faculties, 60 courses, schedules, and 60 demo students
bun run db:seed

# 4. Ensure appsensi-server is running on http://localhost:8080, then start the dev server
bun --bun run dev
```

Open `http://localhost:3000` in your browser:

- `/` — Select a classroom and session date (defaults to `H.2.4` today).
- `/register` — Register a passkey for a student (`student_id` as username).
- `/attendance/h.2.4` — Verify a student's passkey to record attendance.

## Available Scripts

| Command | Description |
| :--- | :--- |
| `bun --bun run dev` | Start the Vite development server on port `3000` |
| `bun --bun run build` | Build the application for production |
| `bun run start` | Start the Bun production server (`server.ts`) |
| `bun --bun run preview` | Preview the production build locally |
| `bun run generate-routes` | Regenerate TanStack Router route tree (`tsr generate`) |
| `bun test` | Run unit and tRPC-to-REST integration tests |
| `bun --bun run check` | Run Biome formatting and lint checks |
| `bun --bun run lint` | Run Biome linter |
| `bun --bun run format` | Format source files with Biome |
| `bun run db:push` | Push `src/db/schema.ts` directly to PostgreSQL |
| `bun run db:generate` | Generate SQL migration files with Drizzle Kit |
| `bun run db:migrate` | Apply generated Drizzle migrations |
| `bun run db:pull` | Introspect schema from PostgreSQL |
| `bun run db:studio` | Open Drizzle Studio to browse database tables |
| `bun run db:seed` | Seed campus buildings, rooms, courses, schedules, and demo students |
