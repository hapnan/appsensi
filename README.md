# Appsensi

**English** | [Bahasa Indonesia](./README.ind.md)

Campus classroom attendance web application powered by WebAuthn passkeys, room & session date scheduling, and live student roster check-in.

## Features

- **Passwordless Passkey Auth** — Student passkey registration (`/register`) and classroom check-in (`/attendance/$roomId`) via `@simplewebauthn/browser`.
- **Room & Session Selector** — Interactive classroom and date picker on `/` with schedule previews (defaults to room `H.2.4`).
- **Live Pending Roster** — Instant search (`⌘K` / `Ctrl+K`), multi-session switcher for rooms with multiple classes per day, and live background updates.

## Tech Stack

- **Framework**: [TanStack Start](https://tanstack.com/start), [TanStack Router](https://tanstack.com/router), [TanStack Query](https://tanstack.com/query), React 19, Vite 8
- **API & Validation**: [tRPC v11](https://trpc.io), SuperJSON, Zod v4, T3 Env (`@t3-oss/env-core`)
- **Database**: PostgreSQL, [Drizzle ORM](https://orm.drizzle.team) & Drizzle Kit
- **Authentication**: [`@simplewebauthn/browser`](https://simplewebauthn.dev) + [`appsensi-server`](https://github.com/hapnan/appsensi-server) (`go-webauthn`)
- **UI & Tooling**: Tailwind CSS v4, Shadcn UI / Radix UI, Lucide Icons, [Bun](https://bun.sh), [Biome](https://biomejs.dev)

## Prerequisites

- **[Bun](https://bun.sh)** `>= 1.0`
- **PostgreSQL 18+** (uses native `uuidv7()` on `credentials.id`)
- **[`appsensi-server`](https://github.com/hapnan/appsensi-server)** — Companion Go (`go-webauthn`) backend running by default on `http://localhost:8080` with CORS enabled for `http://localhost:3000`:
  - **Endpoints used**:
    - `POST /register/begin` & `POST /register/finish` — Passkey registration ceremony (`{ email, username }`, where `username` matches `students.student_id`, e.g. `STU-FCS-001`)
    - `POST /login/begin` & `POST /login/finish` — Passkey verification ceremony (`{ username }`) before recording attendance via `trpc.attendance.checkIn`
  - **Shared PostgreSQL tables**:
    - `users` — WebAuthn user accounts (linked to `students.user_id`)
    - `webauthn_users` — Relying Party (`rp_id`) user handles
    - `credentials` — Stored passkey public keys, AAGUID, attestation data, and sign counts

## Environment Variables

Create a `.env.local` (or `.env`) file in the project root:

```dotenv
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/appsensi"
VITE_WEBAUTHN_SERVER_URL="http://localhost:8080"
```

| Variable | Scope | Required | Default | Description |
| :--- | :--- | :---: | :--- | :--- |
| `DATABASE_URL` | Server | Yes | — | PostgreSQL connection URL (shared with [`appsensi-server`](https://github.com/hapnan/appsensi-server)) |
| `SERVER_URL` | Server | No | — | Optional application server base URL |
| `VITE_WEBAUTHN_SERVER_URL` | Client | No | `http://localhost:8080` | Base URL of [`appsensi-server`](https://github.com/hapnan/appsensi-server) |
| `VITE_APP_TITLE` | Client | No | — | Optional custom application title |

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
| `bun --bun run preview` | Preview the production build locally |
| `bun run generate-routes` | Regenerate TanStack Router route tree (`tsr generate`) |
| `bun --bun run check` | Run Biome formatting and lint checks |
| `bun --bun run lint` | Run Biome linter |
| `bun --bun run format` | Format source files with Biome |
| `bun run db:push` | Push `src/db/schema.ts` directly to PostgreSQL |
| `bun run db:generate` | Generate SQL migration files with Drizzle Kit |
| `bun run db:migrate` | Apply generated Drizzle migrations |
| `bun run db:pull` | Introspect schema from PostgreSQL |
| `bun run db:studio` | Open Drizzle Studio to browse database tables |
| `bun run db:seed` | Seed campus buildings, rooms, courses, schedules, and demo students |
