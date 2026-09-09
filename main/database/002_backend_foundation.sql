BEGIN;

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS location text,
  ADD COLUMN IF NOT EXISTS qualification text,
  ADD COLUMN IF NOT EXISTS graduation_year integer,
  ADD COLUMN IF NOT EXISTS availability text,
  ADD COLUMN IF NOT EXISTS linkedin_url text,
  ADD COLUMN IF NOT EXISTS portfolio_url text,
  ADD COLUMN IF NOT EXISTS work_experience_summary text,
  ADD COLUMN IF NOT EXISTS certifications text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS projects text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS preferred_opportunity_type text,
  ADD COLUMN IF NOT EXISTS preferred_industry text,
  ADD COLUMN IF NOT EXISTS preferred_location text,
  ADD COLUMN IF NOT EXISTS remote_work_preference text;

ALTER TABLE public.employers
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS industry text,
  ADD COLUMN IF NOT EXISTS location text,
  ADD COLUMN IF NOT EXISTS contact_person_name text,
  ADD COLUMN IF NOT EXISTS contact_email text,
  ADD COLUMN IF NOT EXISTS contact_phone text,
  ADD COLUMN IF NOT EXISTS company_size text,
  ADD COLUMN IF NOT EXISTS company_description text,
  ADD COLUMN IF NOT EXISTS benefits text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS website text,
  ADD COLUMN IF NOT EXISTS verification_status text NOT NULL DEFAULT 'unverified',
  ADD COLUMN IF NOT EXISTS verification_timestamp timestamptz;

ALTER TABLE public.opportunities
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS application_deadline date,
  ADD COLUMN IF NOT EXISTS external_application_url text,
  ADD COLUMN IF NOT EXISTS location text,
  ADD COLUMN IF NOT EXISTS opportunity_type text,
  ADD COLUMN IF NOT EXISTS qualification_requirement text,
  ADD COLUMN IF NOT EXISTS preferred_skills text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS work_arrangement text,
  ADD COLUMN IF NOT EXISTS duration text,
  ADD COLUMN IF NOT EXISTS salary_min numeric(12,2),
  ADD COLUMN IF NOT EXISTS salary_max numeric(12,2),
  ADD COLUMN IF NOT EXISTS salary_currency text,
  ADD COLUMN IF NOT EXISTS industry text,
  ADD COLUMN IF NOT EXISTS vacancies integer,
  ADD COLUMN IF NOT EXISTS contact_email text,
  ADD COLUMN IF NOT EXISTS closing_reason text,
  ADD COLUMN IF NOT EXISTS featured boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS published_at timestamptz;

UPDATE public.students
SET updated_at = COALESCE(updated_at, created_at)
WHERE updated_at IS NULL;

UPDATE public.employers
SET updated_at = COALESCE(updated_at, created_at)
WHERE updated_at IS NULL;

UPDATE public.opportunities
SET updated_at = COALESCE(updated_at, created_at)
WHERE updated_at IS NULL;

ALTER TABLE public.students
  ALTER COLUMN updated_at SET DEFAULT now(),
  ALTER COLUMN archived_at DROP NOT NULL,
  ADD CONSTRAINT students_graduation_year_check
    CHECK (graduation_year IS NULL OR graduation_year BETWEEN 1900 AND 2100),
  ADD CONSTRAINT students_remote_work_preference_check
    CHECK (remote_work_preference IS NULL OR remote_work_preference IN ('remote', 'hybrid', 'onsite', 'flexible')),
  ADD CONSTRAINT students_linkedin_url_check
    CHECK (linkedin_url IS NULL OR linkedin_url ~* '^https?://.+'),
  ADD CONSTRAINT students_portfolio_url_check
    CHECK (portfolio_url IS NULL OR portfolio_url ~* '^https?://.+');

ALTER TABLE public.employers
  ADD CONSTRAINT employers_verification_status_check
    CHECK (verification_status IN ('unverified', 'pending', 'verified', 'rejected')),
  ADD CONSTRAINT employers_website_check
    CHECK (website IS NULL OR website ~* '^https?://.+'),
  ADD CONSTRAINT employers_contact_email_check
    CHECK (contact_email IS NULL OR contact_email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$');

ALTER TABLE public.opportunities
  ADD CONSTRAINT opportunities_status_check
    CHECK (status IN ('draft', 'published', 'closed', 'archived')),
  ADD CONSTRAINT opportunities_external_application_url_check
    CHECK (external_application_url IS NULL OR external_application_url ~* '^https?://.+'),
  ADD CONSTRAINT opportunities_salary_range_check
    CHECK (
      (salary_min IS NULL AND salary_max IS NULL)
      OR (salary_min IS NOT NULL AND salary_max IS NOT NULL AND salary_min <= salary_max)
      OR (salary_min IS NOT NULL AND salary_max IS NULL)
      OR (salary_min IS NULL AND salary_max IS NOT NULL)
    ),
  ADD CONSTRAINT opportunities_application_deadline_check
    CHECK (application_deadline IS NULL OR application_deadline >= DATE '2000-01-01'),
  ADD CONSTRAINT opportunities_contact_email_check
    CHECK (contact_email IS NULL OR contact_email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
  ADD CONSTRAINT opportunities_vacancies_check
    CHECK (vacancies IS NULL OR vacancies > 0),
  ADD CONSTRAINT opportunities_featured_flag_check
    CHECK (featured IN (true, false)),
  ADD CONSTRAINT opportunities_salary_currency_check
    CHECK (salary_currency IS NULL OR salary_currency ~* '^[A-Z]{3}$');

ALTER TABLE public.students
  ADD CONSTRAINT students_email_not_blank
    CHECK (email IS NOT NULL AND btrim(email) <> '');

ALTER TABLE public.employers
  ADD CONSTRAINT employers_company_name_not_blank
    CHECK (company_name IS NOT NULL AND btrim(company_name) <> ''),
  ADD CONSTRAINT employers_email_not_blank
    CHECK (email IS NOT NULL AND btrim(email) <> '');

ALTER TABLE public.opportunities
  ADD CONSTRAINT opportunities_title_not_blank
    CHECK (title IS NOT NULL AND btrim(title) <> ''),
  ADD CONSTRAINT opportunities_employer_not_blank
    CHECK (employer_id IS NOT NULL),
  ADD CONSTRAINT opportunities_required_skills_not_blank
    CHECK (required_skills IS NOT NULL);

CREATE INDEX IF NOT EXISTS students_updated_at_idx ON public.students (updated_at DESC);
CREATE INDEX IF NOT EXISTS students_archived_at_idx ON public.students (archived_at);
CREATE INDEX IF NOT EXISTS students_location_idx ON public.students (location);
CREATE INDEX IF NOT EXISTS students_qualification_idx ON public.students (qualification);
CREATE INDEX IF NOT EXISTS students_graduation_year_idx ON public.students (graduation_year);
CREATE INDEX IF NOT EXISTS students_remote_work_preference_idx ON public.students (remote_work_preference);

CREATE INDEX IF NOT EXISTS employers_updated_at_idx ON public.employers (updated_at DESC);
CREATE INDEX IF NOT EXISTS employers_archived_at_idx ON public.employers (archived_at);
CREATE INDEX IF NOT EXISTS employers_industry_idx ON public.employers (industry);
CREATE INDEX IF NOT EXISTS employers_verification_status_idx ON public.employers (verification_status);
CREATE INDEX IF NOT EXISTS employers_verified_idx ON public.employers (verification_status, verification_timestamp DESC);

CREATE INDEX IF NOT EXISTS opportunities_updated_at_idx ON public.opportunities (updated_at DESC);
CREATE INDEX IF NOT EXISTS opportunities_archived_at_idx ON public.opportunities (archived_at);
CREATE INDEX IF NOT EXISTS opportunities_status_idx ON public.opportunities (status);
CREATE INDEX IF NOT EXISTS opportunities_application_deadline_idx ON public.opportunities (application_deadline);
CREATE INDEX IF NOT EXISTS opportunities_featured_idx ON public.opportunities (featured, published_at DESC);
CREATE INDEX IF NOT EXISTS opportunities_location_idx ON public.opportunities (location);
CREATE INDEX IF NOT EXISTS opportunities_opportunity_type_idx ON public.opportunities (opportunity_type);
CREATE INDEX IF NOT EXISTS opportunities_employer_id_idx ON public.opportunities (employer_id);
CREATE INDEX IF NOT EXISTS opportunities_salary_min_idx ON public.opportunities (salary_min);
CREATE INDEX IF NOT EXISTS opportunities_salary_max_idx ON public.opportunities (salary_max);
CREATE INDEX IF NOT EXISTS opportunities_required_skills_gin_idx ON public.opportunities USING GIN (required_skills);
CREATE INDEX IF NOT EXISTS opportunities_preferred_skills_gin_idx ON public.opportunities USING GIN (preferred_skills);
CREATE INDEX IF NOT EXISTS opportunities_featured_status_idx ON public.opportunities (featured, status, archived_at);

CREATE INDEX IF NOT EXISTS matches_scored_at_idx ON public.matches (created_at DESC);

COMMIT;
