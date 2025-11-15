Deploying to Vercel — quick checklist

This project uses Next.js + Prisma. For reliable production builds on Vercel you should use a hosted SQL database (Postgres). SQLite is not recommended in serverless environments.

Steps

1) Create a production database (recommended providers: Supabase, Render Postgres, PlanetScale with the compatible Prisma connector, or any managed Postgres).

2) In your Vercel project > Settings > Environment Variables add:
   - DATABASE_URL = your database connection string (example in `.env.example`). Set it for the "Production" environment at minimum.

3) Ensure Prisma migrations exist (we have a `prisma/migrations` folder if you ran `prisma migrate dev`). On Vercel we'll run `prisma migrate deploy` during the build if `DATABASE_URL` is set.

4) Build settings (Vercel auto-detects Next.js): our `package.json` build script runs:

   prisma generate && node ./scripts/maybe-migrate.js && next build

   - `prisma generate` will always run.
   - `node ./scripts/maybe-migrate.js` runs `prisma migrate deploy` only when `DATABASE_URL` is present.

5) Deploy
   - Push to your repo (main). Vercel will build. If DATABASE_URL is configured, migrations will run during the build step. If the DB is missing or migrations fail, the build will fail — inspect build logs to fix.

If you can't or don't want to provide a DB at deploy time

- The app will still build if you leave DATABASE_URL unset (the script skips migrations). However runtime API routes that require DB will return `503 { error: "db_unavailable" }` until a DB is provided and migrations are applied. This prevents build-time failures and keeps the site deployable for static-only content.

Recommended production improvements (post-deploy)

- Use Postgres (not SQLite) in production.
- Move in-memory rate-limit / idempotency to Redis or a managed cache for multi-instance correctness.
- Add monitoring and retries for DB outages.

If you'd like, I can:
- Add a Vercel Git integration-ready deploy script or a GitHub Action that runs migrations post-deploy.
- Help provision a free Postgres (Supabase) and wire it into Vercel.
