<!-- This document explains how the Express server, static browser client, Supabase database, and Groq matching service fit together. -->

# GraduRat

## Deploy with Vercel

In Vercel, import the repository and set the project **Root Directory** to
`main`. Vercel will use `api/index.js` as the serverless entrypoint.

Add these environment variables in the Vercel project settings:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GROQ_API_KEY`
- `GROQ_MODEL` (optional)

Deploy from `main/` with `npx vercel`, or deploy to production with
`npx vercel --prod`. The `vercel` plugin command is not required for this
project; the Vercel CLI and the included configuration are sufficient.

# GraduRat Full Stack App

GraduRat is served by an Express backend that hosts the static `GraduRat` frontend and exposes Supabase-backed API routes.

<!-- package.json and package-lock.json are strict JSON; JSON has no comment
syntax, so their technology and dependency rationale is documented here. -->

The project uses Node.js with ES modules, Express for HTTP/static serving, Supabase JavaScript clients for PostgreSQL access, and Groq for narrowly scoped semantic skill scoring. The lockfile records exact dependency resolution and intentionally remains machine-readable.

## Setup

1. Install Node.js 18 or newer.
2. In `main/`, install dependencies:
   ```bash
   npm install
   ```
3. Copy `.env.example` to `.env` and fill in the required keys.
4. Run the migration files in order in the Supabase SQL editor:
   ```sql
   database/001_initial_schema.sql
   database/002_backend_foundation.sql
   database/003_backend_hardening.sql
   ```
5. Set the required values in `.env`:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `GROQ_API_KEY`
   - `GROQ_MODEL` (optional, default `llama-3.1-8b-instant`)
   - `ADMIN_API_KEY` for protected admin scripts
   - `PORT` (optional, default `3000`)
6. Start the app:
   ```bash
   npm start
   ```
7. Test the API:
   ```bash
   curl http://localhost:3000/api/health
   ```

## Migration order

The project adds new schema in versioned migration files after the applied initial schema:

- `database/001_initial_schema.sql` – original schema
- `database/002_backend_foundation.sql` – profile fields, validation, status, archiving, and index additions
- `database/003_backend_hardening.sql` – update timestamp triggers, legacy skill normalization, and public listing indexes

Do not edit the already-applied initial migration. Create fresh migrations instead.

## Database schema changes

The new migration adds the following foundation fields:

Students:

- `updated_at`, `archived_at`, `location`
- `qualification`, `graduation_year`, `availability`
- `linkedin_url`, `portfolio_url`, `work_experience_summary`
- `certifications`, `projects`
- `preferred_opportunity_type`, `preferred_industry`, `preferred_location`, `remote_work_preference`

Employers:

- `updated_at`, `archived_at`, `industry`, `location`
- `contact_person_name`, `contact_email`, `contact_phone`
- `company_size`, `company_description`, `benefits`
- `website`, `verification_status`, `verification_timestamp`

Opportunities:

- `updated_at`, `archived_at`, `status`
- `application_deadline`, `external_application_url`, `location`
- `opportunity_type`, `qualification_requirement`, `preferred_skills`
- `work_arrangement`, `duration`, `salary_min`, `salary_max`, `salary_currency`
- `industry`, `vacancies`, `contact_email`, `closing_reason`, `featured`, `published_at`

The migration includes sanity checks for valid URLs, email formats, salary ranges, status values, score ranges, and date ranges. It also creates useful indexes for filtering, searching, and moderation work.

## API behavior

The backend keeps the existing public API shape while extending it with validation and compatibility helpers:

- `GET /api/health` – verifies the DB can be reached
- `POST /api/students` – creates a profile and normalizes skills
- `GET /api/students/:studentId` and `PATCH /api/students/:studentId` – fetch or update a student profile
- `POST /api/employers` and `PATCH /api/employers/:employerId` – create or update an employer profile
- `GET /api/opportunities` – public listings with keyword, skill, location, industry, type, work-arrangement, deadline, sort, and pagination filters
- `GET /api/opportunities/:opportunityId` – single opportunity lookup
- `PATCH /api/opportunities/:opportunityId` – update an opportunity
- `POST /api/opportunities/:opportunityId/close` – close an opportunity
- `POST /api/opportunities/:opportunityId/archive` – soft archive an opportunity
- `POST /api/opportunities/:opportunityId/reopen` – reopen a valid opportunity
- `POST /api/matches/refresh` – manual score refresh for a student/opportunity pair

Public opportunity listings and detail responses exclude archived, closed, draft,
and expired opportunities. Listing filters use `keyword`, `skills`, `location`,
`industry`, `type`, `workArrangement`, and `deadline`; `sort`, `page`, and
`limit` control ordering and pagination. External application links are stored
as validated URLs only; the backend does not track application status.

Skill values are normalized before storage: trimmed, deduplicated case-insensitively, and kept in a consistent lowercase format.

## Protected admin scripts

Scripts live under `main/scripts/` and must be executed with a server-side secret. They are not public routes and are not exposed in the browser.

Usage:

```bash
ADMIN_API_KEY="your-secret" node scripts/admin.js list-pending
ADMIN_API_KEY="your-secret" node scripts/admin.js approve-opportunity <opportunity-id>
ADMIN_API_KEY="your-secret" node scripts/admin.js mark-employer-verified <employer-id>
ADMIN_API_KEY="your-secret" node scripts/admin.js export-csv
```

Available commands:

- `list-pending`
- `approve-opportunity`
- `reject-opportunity`
- `archive-opportunity`
- `mark-employer-verified`
- `export-csv`
- `detect-duplicates`
- `detect-expired`
- `toggle-featured`

## Excluded features

The following remain intentionally unimplemented in this backend foundation:

- Authentication and authorization
- User ownership checks
- Passwords or login flows
- CV or file uploads
- Company logo uploads
- Internal applications workflow
- Saved-jobs persistence
- Messaging or notifications
- Employer candidate profile pages
- Match-generation worker queues
- Public admin pages or unauthenticated admin endpoints

## Important notes

- The Supabase service-role key stays on the server and is never exposed to browser code.
- The current Groq scoring still happens when dashboard routes load, and matches can be refreshed manually.
- Match responses include `matching_skills` and `missing_skills` alongside the existing score and reasoning.
- Opportunities are filtered out of public listings when they are archived or expired.
- External applications should use an `external_application_url` field rather than an internal application tracker.
