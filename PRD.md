# Tutor Intelligence Dashboard

Version 2.0
Multi-User SaaS-Scoped
Go + Next.js + Supabase

---

# 1. Product Scope

Core objective:

Structured, time-stamped student notes
AI-generated summaries
Grade-based filtering
Fast recall
Zero unnecessary features

Non-goals remain strict:
No payments
No attendance automation
No messaging
No predictive scoring

---

# 2. System Architecture

Frontend

* Next.js (App Router)
* TypeScript
* React
* Server components for read-heavy pages
* Client components for note input

Backend

* Go API (Gin or Fiber)
* Stateless REST endpoints
* JWT validation via Supabase Auth
* Deployed on Fly.io or similar

Database

* Supabase Postgres
* Row-level security enabled
* Multi-tenant via teacher_id

AI

* LLM API integration from backend only
* Deterministic prompts
* Low temperature
* Strict output formatting

Deployment

* Frontend on Vercel
* Edge caching for read routes
* Backend region aligned with Supabase

---

# 3. Multi-Tenant Model

Every domain entity includes:

teacher_id (required)

Row Level Security enforced in Supabase.

Backend verifies:

JWT
teacher_id from token
All queries scoped

No cross-tenant reads possible.

---

# 4. Core Domain Entities

Teacher

* id
* email
* created_at

Student

* id
* teacher_id
* full_name
* current_grade
* academic_year
* batch_name (optional)
* created_at

StudentNote

* id
* student_id
* teacher_id
* content
* tag
* created_at

WeeklySummary

* id
* student_id
* teacher_id
* week_start
* summary_text
* generated_at

MonthlyReport

* id
* student_id
* teacher_id
* month
* report_text
* generated_at

ScheduleSlot

* id
* teacher_id
* day_of_week
* start_time
* end_time
* batch_or_student_label

Indexes required:

student_id
teacher_id
created_at
academic_year
current_grade

---

# 5. Authentication

Supabase Auth handles:

Signup
Login
Password reset
JWT issuance

Backend validates JWT via Supabase public key.

No custom password logic.

---

# 6. Student Import

Requirement:

CSV and Excel upload supported.

Process:

* Upload file

* Parse in backend

* Validate required columns:

  * full_name
  * current_grade
  * academic_year
  * optional batch

* Deduplicate by:

  * teacher_id + full_name + academic_year

* Bulk insert transactionally

Error reporting:

* Row-level validation feedback
* Reject invalid rows
* Allow partial success

---

# 7. Dashboard Requirements

Student Dashboard must support:

Filters:

* Academic Year
* Grade
* Batch
* Inactivity (no notes in X days)
* Search by name

Sorting:

* Alphabetical
* Last note date
* Note frequency

Displayed columns:

Name
Grade
Academic Year
Batch
Last Note Date
Weekly Summary Preview

Performance requirement:

<500ms load time for 200 students

Server-rendered initial load.
Edge cached if possible.

---

# 8. Student Detail Page

Must include:

Header:
Name
Grade
Academic Year
Batch

Primary action:
Add note

Notes:
Reverse chronological
Optimistic UI
Inline edit allowed within short window

Right panel:

* Notes per week
* Tag distribution
* Inactivity indicator

Pagination required after 100 notes.

---

# 9. AI Requirements

Weekly Summary

Trigger:
Scheduled job (weekly)
Manual refresh allowed

Input:
Last 7 days of notes

Constraints:
2–4 sentences
Fact-based
No speculation
No personality labeling
No invented claims

Stored deterministically by:
student_id + week_start

Monthly Report

Trigger:
Manual or scheduled

Structured output:
Overview
Strengths
Areas to monitor
Focus suggestions

Editable before export.

AI failure must not block UI.

---

# 10. Analytics Requirements

Derived only from notes.

Metrics:
Notes per week
Rolling 4-week delta
Tag distribution
Inactivity detection

Displayed minimally.
No composite scores.
No predictive flags.

---

# 11. Grade-Based Filtering

Grade is structural, not metadata.

Must support:

Viewing all Grade 6 students within academic year
Viewing Grade 7 next year without data conflict

Academic year required for correct filtering.

Grade change requires update per academic year.

---

# 12. Timetable

Visual weekly grid.

No automation beyond optional local notifications.

Stored per teacher.

No attendance linkage.

---

# 13. Performance

Target:

Student page <500ms
Dashboard <500ms
Mobile load <1s

Strategies:

Server components for read-heavy pages
Edge caching for dashboards
Optimistic UI for writes
Precomputed summaries
Database indexes on filter fields

No live AI calls during page load.

---

# 14. State Management

Minimal global state.

Per-page data fetching.

Optimistic note append.

No Redux unless future complexity demands it.

---

# 15. Security

Row-level security enforced.

All queries require teacher_id.

Rate limit login attempts handled by Supabase.

AI requests contain only teacher-owned data.

Full export capability required.

---

# 16. Testing Requirements

Unit tests:
Domain logic
AI input validation
Grade filter correctness

Integration tests:
Note → summary pipeline
CSV import edge cases

E2E:
Signup
Import
Add note
Generate summary
Filter by grade

CI runs on every PR.

---

# 17. Deployment & Optimization

Frontend:
Vercel
Edge caching for GET routes

Backend:
Low-latency region near Supabase

Database:
Connection pooling
Prepared statements

Zero unnecessary round-trips.

---

# 18. Explicit Constraints

System must remain:

Note-first
AI-secondary
Operationally simple
Low visual noise

If a feature increases cognitive load without improving recall speed, reject it.

