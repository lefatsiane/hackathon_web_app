# Database setup

Use the migration files in order after the initial schema is already applied in Supabase:

1. `001_initial_schema.sql`
2. `002_backend_foundation.sql`
3. `003_backend_hardening.sql`

Run them in Supabase Dashboard > **SQL Editor** before importing or updating data.

## Intended migration flow

The application is an employability marketplace for students and employers:

1. A student profile stores academic, availability, and skill information.
2. An employer profile stores company, verification, and contact details.
3. A published opportunity describes work, required skills, and application details.
4. Match scores are generated against the current skill arrays and saved to `matches`.
5. Public listings hide archived, closed, and expired opportunities.

## Initial schema notes

`001_initial_schema.sql` creates:

- `public.students`
- `public.employers`
- `public.opportunities`
- `public.matches`

The tables are set up with public read access through Supabase RLS and keep the server-only service-role client for writes.

## New foundation fields

The second migration adds the additional columns required for a workable backend foundation.

The third migration adds database-maintained `updated_at` timestamps, normalizes
legacy student and opportunity skill arrays, adds a non-negative salary check,
and adds a public listing index.

### Student fields

- `updated_at`, `archived_at`, `location`
- `qualification`, `graduation_year`, `availability`
- `linkedin_url`, `portfolio_url`, `work_experience_summary`
- `certifications`, `projects`
- `preferred_opportunity_type`, `preferred_industry`, `preferred_location`
- `remote_work_preference`

### Employer fields

- `updated_at`, `archived_at`, `industry`, `location`
- `contact_person_name`, `contact_email`, `contact_phone`
- `company_size`, `company_description`, `benefits`
- `website`, `verification_status`, `verification_timestamp`

### Opportunity fields

- `updated_at`, `archived_at`, `status`
- `application_deadline`, `external_application_url`, `location`
- `opportunity_type`, `qualification_requirement`, `preferred_skills`
- `work_arrangement`, `duration`, `salary_min`, `salary_max`, `salary_currency`
- `industry`, `vacancies`, `contact_email`, `closing_reason`, `featured`, `published_at`

## Validation and constraints

The second migration adds practical safeguards:

- valid URL checks for website, LinkedIn, portfolio, and external applications
- valid email checks for contact and profile fields where practical
- score range constraints remain enforced on `matches`
- salary range checks avoid invalid minimum/maximum combinations
- allowed status values for opportunities
- sensible date and year bounds
- non-empty required content checks for core profile and title fields
- default arrays are kept as empty `{}` values so the existing text-array approach remains intact

## Indexes and moderation

Useful indexes are included for:

- student and employer updates and archive state
- opportunity status, deadlines, and feature flags
- public listing filters by location, industry, and opportunity type
- GIN indexes for `text[]` skill arrays
- verification checks for employers

## Running migrations

In Supabase SQL editor, run the files in this exact order:

```sql
-- 1
database/001_initial_schema.sql

-- 2
database/002_backend_foundation.sql

-- 3
database/003_backend_hardening.sql
```

If you are applying the schema outside of Supabase, keep the same order and run each file as a separate migration transaction.

## Protected admin usage

Admin actions run from server-side scripts only. The script is protected by an environment secret and should be run from the server or CI environment, not from the browser:

```bash
ADMIN_API_KEY="your-secret" node scripts/admin.js list-pending
ADMIN_API_KEY="your-secret" node scripts/admin.js approve-opportunity <opportunity-id>
ADMIN_API_KEY="your-secret" node scripts/admin.js export-csv
```

The admin tool supports moderation, duplicate detection, expired opportunity detection, and featured-opportunity toggling.

## API and query parameter notes

The server now supports the following patterns without changing the current front-end contract:

- keyword search via `?keyword=python`
- skill filtering via `?skills=python,sql`
- location filter via `?location=Johannesburg`
- industry filter via `?industry=Technology`
- opportunity type filter via `?type=Internship`
- work-arrangement filter via `?workArrangement=remote`
- deadline filter via `?deadline=2026-12-31`
- sorting via `?sort=updated_at` or `?sort=published_at`
- pagination via `?page=1&limit=20`

The listing endpoint hides archived and expired items by default.

## Excluded features

These remain intentionally unimplemented in this foundation:

- authentication and user ownership
- file uploads and CV storage
- company logo uploads
- internal applications workflow
- saved jobs and messaging features
- employer candidate profile pages
- background worker pipelines for matching
- public admin interfaces
