# Project Guidelines

## Project Layout

- The runnable Node project is under [`main/`](main/).
- Express setup, static serving, API routes, and the fallback page live in [`main/src/server.js`](main/src/server.js).
- The browser frontend is plain HTML, CSS, and JavaScript under [`main/GraduRat/`](main/GraduRat/); [`main/GraduRat/app.js`](main/GraduRat/app.js) is shared by the forms and dashboards.
- Supabase schema and import guidance are documented in [`main/database/README.md`](main/database/README.md) and [`main/database/001_initial_schema.sql`](main/database/001_initial_schema.sql).

## Build and Verify

Run commands from `main/`:

- `npm install` installs dependencies.
- `npm start` runs the server on port 3000, or `PORT` when set.
- `npm run dev` runs the server with Node watch mode.
- `npm run check:supabase` checks the client Supabase configuration.
- There is currently no automated test, lint, or TypeScript script. For API changes, exercise `GET /api/health` and the affected endpoint manually when Supabase credentials and the schema are available.

Read [`main/README.md`](main/README.md) for the complete environment and database setup sequence.

## Architecture And Contracts

- Keep browser code dependent on the public API only. The Supabase service-role client belongs exclusively in [`main/src/lib/supabase-server.js`](main/src/lib/supabase-server.js) and must never be imported into frontend code or exposed to the browser.
- API routes cover health, student and employer creation, opportunity listing and creation, plus graduate and employer dashboard data with deterministic skill-match scores. Preserve their JSON response shapes and HTTP status behavior unless the frontend is updated with the same change.
- Form pages use `data-api-form`, HTML field `name` values, and `FormData`; treat those names as the request contract. Opportunity publishing requires the employer ID stored in `localStorage` under `graduRatEmployerId`; student and employer registration store their returned IDs there as well.
- Database writes use the server client and the tables defined by the initial migration. Follow the foreign keys and import order documented in the database README.

## Security And Scope

- Never commit `.env`, credentials, database passwords, or Supabase service-role keys. Use [`main/.env.example`](main/.env.example) only as a variable-name reference and verify its values before running checks.
- Authentication, authorization, matching generation, applications, and file uploads are not implemented yet. Do not imply that current profile or opportunity endpoints enforce user ownership.
- Keep changes focused on the prototype's existing plain HTML/CSS/JavaScript and Express/Supabase architecture unless the task explicitly calls for a migration.
