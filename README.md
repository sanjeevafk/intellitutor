# Tutor Intelligence Dashboard

A multi-tenant dashboard for tutors and small learning centers. Keeps student notes structured and time-stamped, enables fast recall across sessions, and surfaces AI-generated summaries — without adding operational overhead.

> This is a personal portfolio project designed to solve a tutor's real-world challenge of managing context, tracking progress, and synthesizing updates across multiple students.

**Design principles**


- **Note-first** — every insight derives from real notes, never invented
- **AI-secondary** — AI assists recall; it does not drive workflow
- **Operationally simple** — light, high-performance edge database (SQLite/Turso) and Vercel hosting
- **Low visual noise** — fast, scannable UI over feature density

---

## Features

| Area | Detail |
|---|---|
| **Dashboard** | Grade / academic year / batch filters, sortable by last note or name, inactivity indicators |
| **Student detail** | Reverse-chronological notes, optimistic add, timed inline edit window (15 mins) |
| **AI summaries** | Weekly (2–4 sentence, fact-based), stored deterministically by `student_id + week_start` |
| **Monthly reports** | Structured output (overview, strengths, areas to monitor), editable before export |
| **CSV import** | Stream-parsed upload, deduplicate by `teacher_id + name + academic_year`, row-level error reporting |
| **Analytics** | Notes per week, tag distribution, inactivity detection — derived from notes only |
| **Authentication** | Custom Google OAuth 2.0 with cookie-based CSRF protection and stateless JWT sessions |

**Out of scope:** payments, attendance automation, messaging, predictive scoring.

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                     Browser                         │
│  Next.js App Router (React 19, TypeScript)          │
│  SWR client-side cache · Optimistic mutations        │
└────────────────────┬────────────────────────────────┘
                     │ HTTPS (Bearer JWT / Cookies)
┌────────────────────▼────────────────────────────────┐
│              Next.js Route Handlers                 │
│  /api/v1/students  /api/v1/notes  /api/v1/summaries │
│                                                     │
│  withRoute() wrapper                                │
│  · Custom JWT Verification (jose)                   │
│  · Google OAuth 2.0 with CSRF state validation      │
│  · Request ID propagation                           │
│  · Structured request logging                       │
│  · Rate limiting via Upstash Redis                  │
└──────────┬──────────────────────────┬───────────────┘
           │                          │
┌──────────▼──────────┐   ┌──────────▼──────────────┐
│  Libsql (Turso DB)  │   │   Google Gemini API      │
│                     │   │   (weekly summaries &    │
│  Scoped SQL queries │   │    monthly reports)      │
│  Atomic db.batch()  │   │                          │
│  Local/Edge SQLite  │   │  Deterministic prompts   │
│  Denorm last_note_at│   │  Low temperature         │
└──────────────────────┘   └──────────────────────────┘
```

### Key architectural decisions

**All API routes are Next.js Route Handlers** — no separate backend process. Each handler is wrapped with `withRoute()`, which enforces environment validation, extracts the authenticated `teacher_id` from the custom JWT, logs every request with a stable `x-request-id`, and surfaces structured `ApiError` responses.

**Custom Google OAuth 2.0 & JWT** — Built directly into Next.js Route Handlers. Replaces heavy third-party identity management with lightweight, custom token exchanges, stateless signing via `jose`, and secure automatic user provisioning in SQLite.

**CSRF Protection on Redirects** — Integrates robust Cross-Site Request Forgery validation. During authorization initiation, a secure `HttpOnly` Lax cookie (`oauth_state`) is set with a randomized UUID state, which is verified and immediately purged upon redirect callback.

**Multi-tenancy via SQLite Scoped Queries** — Every table contains a `teacher_id` foreign key. The backend queries guarantee data isolation by filtering all select, insert, and delete commands at the API router level, matching the user ID stored securely in the client's JWT session.

**Denormalized `last_note_at` via Batch Transactions** — `students.last_note_at` is updated on every note insert. Rather than database triggers, the system utilizes application-level transactions (`db.batch`) to guarantee that updates to the notes table and student indexes are written atomically. The student list query therefore requires no aggregation join, keeping dashboard load times under 100 ms.

**Rate limiting on AI routes** — Upstash Redis fixed-window rate limiting is applied to summary generation endpoints, preventing abuse and controlling Gemini API costs.

**SWR caching on the client** — Student lists and note feeds are cached in SWR. Navigation between pages is instant; background revalidation keeps data fresh.

---

## Database Schema (SQLite)

The database schema is defined in `web/lib/schema.sql` and initialized dynamically at runtime:

```sql
teachers (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

students (
  id TEXT PRIMARY KEY,
  teacher_id TEXT NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  current_grade INTEGER NOT NULL,
  academic_year TEXT NOT NULL,
  batch_name TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_note_at TEXT
);

student_notes (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  teacher_id TEXT NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  tag TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

weekly_summaries (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  teacher_id TEXT NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  week_start TEXT NOT NULL,
  summary_text TEXT NOT NULL,
  generated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE(student_id, week_start)
);

monthly_reports (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  teacher_id TEXT NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  month_start TEXT NOT NULL,
  overview TEXT NOT NULL,
  strengths TEXT NOT NULL,
  areas_to_monitor TEXT NOT NULL,
  generated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE(student_id, month_start)
);
```

Indexes are established on foreign keys (`teacher_id`, `student_id`) and sorting fields (`last_note_at`, `batch_name`) to optimize query planning.

---

## Project Structure

```
tutor-dashboard/
├── web/                        # Next.js application
│   ├── app/
│   │   ├── api/
│   │   │   ├── _lib/           # Shared middleware & utilities
│   │   │   │   ├── with-route.ts   # Handler wrapper (auth, logging, errors)
│   │   │   │   ├── auth.ts         # JWT validation & user context helpers
│   │   │   │   ├── gemini.ts       # AI client
│   │   │   │   ├── ratelimit.ts    # Upstash rate limiting
│   │   │   │   └── logging.ts      # Structured request logs
│   │   │   └── v1/
│   │   │       ├── students/       # CRUD + CSV import
│   │   │       ├── notes/          # Note CRUD
│   │   │       └── summaries/      # Weekly summary generation
│   │   ├── dashboard/          # Main teacher dashboard UI
│   │   ├── students/[studentId]/ # Student detail + notes feed UI
│   │   ├── login/              # Login interface
│   │   └── auth/callback/      # OAuth callback page
│   ├── lib/
│   │   ├── apiClient.ts        # Typed fetch wrappers
│   │   ├── db.ts               # Libsql (Turso/SQLite) client & schema injector
│   │   └── supabaseClient.ts   # Mocked client helper for localStorage sessions
│   └── scripts/
│       └── integration.test.mjs  # End-to-end API verification suite
```

---

## Getting Started

### Prerequisites

- Node.js 20+
- A [Turso](https://turso.tech) Database (or a local `.db` file path for local development)
- A [Google AI Studio](https://aistudio.google.com) API key (for summaries and reports)
- An [Upstash Redis](https://upstash.com) database (for rate limiting)

### Local setup

```bash
cd web
npm install
cp .env.local.example .env.local   # Fill in variables as described below
npm run dev
```

### Running with Docker

You can build and run the application locally using Docker and Docker Compose:

1. **Configure Environment Variables:**
   Ensure you have created `web/.env.local` and filled in all required values (such as `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `JWT_SECRET`).

2. **Start the Containers:**
   From the project root directory, run:
   ```bash
   docker compose up --build
   ```
   This compiles the optimized Next.js production image in standalone mode and exposes the server on `http://localhost:3000`.

3. **SQLite Database Persistence:**
   By default, `docker-compose.yml` mounts a persistent Docker volume (`tutor_dashboard_sqlite_data`) and overrides `TURSO_DATABASE_URL` to point to `/app/data/local.db`. This keeps database writes safe across container builds and updates.


### Environment variables

Create `web/.env.local`:

```env
# Gemini API Configuration
GEMINI_API_KEY=your-gemini-api-key
GEMINI_MODEL=gemini-2.5-flash

# Upstash Redis Configuration (Rate Limiting)
UPSTASH_REDIS_REST_URL=https://your-upstash-url.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-token-string

# Google OAuth 2.0 Credentials
GOOGLE_CLIENT_ID=your-google-oauth-client-id
GOOGLE_CLIENT_SECRET=your-google-oauth-client-secret

# Turso SQLite DB Configuration
# Use file:local.db for local file-based database
TURSO_DATABASE_URL=file:local.db
TURSO_AUTH_TOKEN=

# Custom JWT Authentication Secret (Minimum 32 characters)
JWT_SECRET=your-secure-jwt-secret-min-32-characters

# Public App Landing URL
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### Running integration tests

The integration suite spins up a local database connection and exercises the full API surface including OAuth callbacks, student validation, notes batching, and summary requests:

```bash
cd web
npm run test:integration
```

---

## Deployment

The project is configured for serverless deployment (e.g. to Vercel) with the root `vercel.json` routing build and install tasks to the `web/` subdirectory:

```json
{
  "framework": "nextjs",
  "buildCommand": "npm --prefix web run build",
  "installCommand": "npm --prefix web install",
  "outputDirectory": "web/.next"
}
```

Make sure to set all the environment variables listed in `web/.env.local.example` inside your Vercel deployment settings dashboard. In production, configure `TURSO_DATABASE_URL` to point to your cloud-managed Turso instance (`libsql://...`) and provide your `TURSO_AUTH_TOKEN`.

---

## Security

- **Authentication** — Custom Google OAuth 2.0. Verified at the callback endpoint using cryptographically secure CSRF state token cookie checking, then signed into stateless custom JWT sessions (`jose`).
- **Authorization** — Tenant boundaries are enforced in the API layer on every database query. No cross-tenant reads or writes are possible.
- **Rate limiting** — AI summary generation is rate-limited per user via Upstash Redis to control API usage costs.

---

## Performance targets

| Page | Target |
|---|---|
| Dashboard (200 students) | < 250 ms |
| Student detail page | < 250 ms |
| Mobile initial load | < 1 s |

---

## License

[MIT](LICENSE)
