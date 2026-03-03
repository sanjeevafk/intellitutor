# Tutor Intelligence Dashboard

An open-source, multi-tenant dashboard for tutors and small learning centers. It keeps student notes structured and time-stamped, enables fast recall, and offers AI-assisted summaries without adding operational noise.

**Principles**
- Note-first
- AI-secondary
- Operationally simple
- Low visual noise

## Product Scope

Core objectives:
- Structured, time-stamped student notes
- AI-generated weekly summaries and monthly reports
- Grade-based filtering across academic years
- Fast recall with low visual noise

Non-goals:
- Payments
- Attendance automation
- Messaging
- Predictive scoring

## Architecture

- Frontend + API: Next.js (App Router), TypeScript, React
  - Route handlers provide `/api/v1/*` with header-only Supabase auth
  - Client components for note input and edits
- Legacy backend: Go API (kept for migration, decommission after cutover)
- Database: Supabase Postgres with RLS
  - Multi-tenant via `teacher_id`

## Core Features

- Multi-tenant dashboard with grade/year/batch filters
- Student detail page with reverse-chronological notes
- Optimistic note add, inline edit (short window)
- Weekly summaries (2–4 sentences, fact-based)
- Monthly reports with structured output and edit-before-export
- Import students via CSV/Excel with validation and dedupe
- Analytics: notes per week, tag distribution, inactivity detection

## Who This Is For

- Tutors managing many students across grades
- Small learning centers that need fast recall without extra overhead
- Teams that want an auditable, simple data model

## Performance Targets

- Student page: <500ms
- Dashboard: <500ms (200 students)
- Mobile load: <1s

## Security Model

- Supabase Auth for signup/login/reset
- Row-level security (RLS) with `teacher_id` scoping
- Backend validates JWT and enforces tenant boundaries

## Project Structure

- `frontend/`: Next.js frontend
- `backend/`: Go API
- `supabase/`: Supabase configuration/migrations

## Getting Started

### Prerequisites

- Node.js and npm
- Go
- Docker (for Supabase)

### Setup

1. **Frontend**
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

2. **Backend**
   ```bash
   cd backend
   go run ./cmd/api
   ```

### Environment Variables

Frontend + API (`frontend/.env.local` from `frontend/.env.local.example`):
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_URL` (server fallback to `NEXT_PUBLIC_*`)
- `SUPABASE_ANON_KEY`
- `GEMINI_API_KEY`
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `NEXT_PUBLIC_API_BASE_URL` (optional, default is same-origin `/api/v1/*`)

Legacy backend (`backend/.env` from `backend/.env.example`):
- `DATABASE_URL`
- `SUPABASE_URL`
- `SUPABASE_ISSUER`
- `SUPABASE_AUDIENCE`
- `SUPABASE_JWT_SECRET`
- `PORT`

## Open Source

This repository is intended for public use and community contributions. If you’re evaluating this for your organization, start with the sections above and open an issue for questions or feature proposals that align with the stated constraints.

## Contributing

- Keep changes aligned with the product constraints in this README
- Prefer small, reviewable pull requests
- Add tests for any new domain logic or data processing

## Roadmap (PRD-Aligned)

- Student import with CSV/Excel validation and partial success
- Weekly summary job runner + manual refresh
- Monthly report editor and export
- Grade/year filters with fast server-rendered dashboards

## Data Model (High Level)

- Teacher
- Student (grade, academic_year, optional batch)
- StudentNote (tagged, time-stamped)
- WeeklySummary (student_id + week_start)
- MonthlyReport (student_id + month)
- ScheduleSlot (teacher timetable)

## Testing Expectations

- Unit: domain logic, AI input validation, grade filter correctness
- Integration: note → summary pipeline, CSV import edge cases
- E2E: signup, import, add note, generate summary, filter by grade

## Constraints

This system must remain:
- Note-first
- AI-secondary
- Operationally simple
- Low visual noise

## License

MIT
