# Tutor Intelligence Dashboard

A multi-tenant dashboard for tutors and small learning centers. Keeps student notes structured and time-stamped, enables fast recall across sessions, and surfaces AI-generated summaries — without adding operational overhead.

**Design principles**

- **Note-first** — every insight derives from real notes, never invented
- **AI-secondary** — AI assists recall; it does not drive workflow
- **Operationally simple** — no infra to manage beyond Supabase and Vercel
- **Low visual noise** — fast, scannable UI over feature density

---

## Features

| Area | Detail |
|---|---|
| **Dashboard** | Grade / academic year / batch filters, sortable by last note or name, inactivity indicators |
| **Student detail** | Reverse-chronological notes, optimistic add, timed inline edit window |
| **AI summaries** | Weekly (2–4 sentence, fact-based), stored deterministically by `student_id + week_start` |
| **Monthly reports** | Structured output (overview, strengths, areas to monitor), editable before export |
| **CSV import** | Upload, validate, deduplicate by `teacher_id + name + academic_year`, row-level error reporting |
| **Analytics** | Notes per week, tag distribution, inactivity detection — derived from notes only |

**Out of scope:** payments, attendance automation, messaging, predictive scoring.

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                     Browser                         │
│  Next.js App Router (React 19, TypeScript)          │
│  SWR client-side cache · Optimistic mutations        │
└────────────────────┬────────────────────────────────┘
                     │ HTTPS
┌────────────────────▼────────────────────────────────┐
│              Next.js Route Handlers                 │
│  /api/v1/students  /api/v1/notes  /api/v1/summaries │
│                                                     │
│  withRoute() wrapper                                │
│  · JWT validation (Supabase header auth)            │
│  · Request ID propagation                           │
│  · Structured request logging                       │
│  · Rate limiting via Upstash Redis                  │
└──────────┬──────────────────────────┬───────────────┘
           │                          │
┌──────────▼──────────┐   ┌──────────▼──────────────┐
│   Supabase Postgres  │   │   Google Gemini API      │
│                      │   │   (weekly summaries &    │
│  RLS on every table  │   │    monthly reports)      │
│  teacher_id scoping  │   │                          │
│  pg_trgm full-text   │   │  Deterministic prompts   │
│  Denorm last_note_at │   │  Low temperature         │
└──────────────────────┘   └──────────────────────────┘
```

### Key architectural decisions

**All API routes are Next.js Route Handlers** — no separate backend process. Each handler is wrapped with `withRoute()`, which enforces environment validation, extracts the authenticated `teacher_id` from the Supabase JWT, logs every request with a stable `x-request-id`, and surfaces structured `ApiError` responses.

**Multi-tenancy via Row-Level Security** — every table carries a `teacher_id` column. Supabase RLS policies ensure queries are always scoped to the authenticated teacher, at the database layer, regardless of application logic.

**Denormalized `last_note_at`** — `students.last_note_at` is updated on every note insert via a Postgres trigger. The student list query therefore requires no aggregation join, keeping dashboard load times under 500 ms for 200+ students.

**Rate limiting on AI routes** — Upstash Redis fixed-window rate limiting is applied to summary generation endpoints, preventing abuse and controlling Gemini API costs.

**SWR caching on the client** — student lists and note feeds are cached in SWR. Navigation between pages is instant; background revalidation keeps data fresh.

---

## Database Schema (key tables)

```sql
teachers       (id, email, created_at)
students       (id, teacher_id, full_name, current_grade,
                academic_year, batch_name, last_note_at, created_at)
student_notes  (id, student_id, teacher_id, content, tag, created_at)
weekly_summaries (id, student_id, teacher_id, week_start,
                  summary_text, generated_at)
```

Indexes: `teacher_id`, `student_id`, `created_at`, `academic_year`, `current_grade`, `batch_name`. Full-text search via `pg_trgm`.

A Postgres trigger auto-provisions a `teachers` row on `auth.users` insert, so new signups immediately see an empty dashboard with no manual DB operations.

---

## Project Structure

```
tutor-dashboard/
├── web/                        # Next.js application
│   ├── app/
│   │   ├── api/
│   │   │   ├── _lib/           # Shared middleware & utilities
│   │   │   │   ├── with-route.ts   # Handler wrapper (auth, logging, errors)
│   │   │   │   ├── auth.ts         # JWT extraction helpers
│   │   │   │   ├── gemini.ts       # AI client
│   │   │   │   ├── ratelimit.ts    # Upstash rate limiting
│   │   │   │   └── logging.ts      # Structured request logs
│   │   │   └── v1/
│   │   │       ├── students/       # CRUD + import
│   │   │       ├── notes/          # Note CRUD
│   │   │       └── summaries/      # Weekly summary generation
│   │   ├── dashboard/          # Main teacher dashboard
│   │   ├── students/[studentId]/ # Student detail + notes
│   │   ├── login/              # Auth pages
│   │   └── auth/callback/      # Supabase OAuth callback
│   ├── lib/
│   │   ├── apiClient.ts        # Typed fetch wrappers
│   │   └── supabaseClient.ts   # Browser Supabase client
│   └── scripts/
│       └── integration.test.mjs  # End-to-end API tests
└── supabase/
    └── migrations/             # Ordered SQL migrations
```

---

## Getting Started

### Prerequisites

- Node.js 20+
- A [Supabase](https://supabase.com) project
- A [Google AI Studio](https://aistudio.google.com) API key (for summaries)
- An [Upstash Redis](https://upstash.com) database (for rate limiting)

### Local setup

```bash
cd web
npm install
cp .env.local.example .env.local   # then fill in values below
npm run dev
```

### Environment variables

Create `web/.env.local`:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
# (server-side fallbacks — can mirror the public values)
SUPABASE_URL=
SUPABASE_ANON_KEY=

# Google Gemini (AI summaries)
GEMINI_API_KEY=

# Upstash Redis (rate limiting)
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=

# Optional — defaults to same-origin /api/v1
NEXT_PUBLIC_API_BASE_URL=
```

### Running integration tests

```bash
cd web
npm run test:integration
```

The integration suite spins up against a live server and exercises the full API surface including auth, student CRUD, note operations, and summary generation.

---

## Deployment

The project deploys to Vercel with the root `vercel.json` pointing at the `web/` subdirectory:

```json
{
  "framework": "nextjs",
  "buildCommand": "npm --prefix web run build",
  "installCommand": "npm --prefix web install",
  "outputDirectory": "web/.next"
}
```

Set all environment variables from the section above in your Vercel project settings.

---

## Security

- **Authentication** — Supabase Auth (email + password). JWTs validated on every API request; `teacher_id` is always derived from the verified token, never from the request body.
- **Authorization** — Supabase RLS enforces tenant isolation at the database layer. No cross-tenant reads are possible even if application logic is bypassed.
- **Rate limiting** — AI summary endpoints are rate-limited per user via Upstash Redis to prevent abuse.
- **No service role usage** — all queries use the anon key scoped by RLS, not the Supabase service role key.

---

## Performance targets

| Page | Target |
|---|---|
| Dashboard (200 students) | < 500 ms |
| Student detail page | < 500 ms |
| Mobile initial load | < 1 s |

---

## License

[MIT](LICENSE)
