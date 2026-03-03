create extension if not exists "pg_trgm";

create index if not exists idx_students_full_name_trgm
  on students using gin (full_name gin_trgm_ops);
