# Bihar Slap Meter — Prototype

This is a small Next.js + TypeScript + Tailwind + Prisma (SQLite) prototype for a playful "+1 slap" meter.

Quick start (macOS / zsh):

1. Install dependencies

```bash
npm install
```

2. Generate Prisma client and migrate the SQLite DB

```bash
npm run prisma:generate
npm run prisma:migrate
```

3. Run dev server

```bash
npm run dev
```

After the DB is created you'll want to add at least one `Person` row (via Prisma Studio or a seed script) so the UI shows content.

Notes
- This is a minimal scaffold. Next steps: seed script, rate limiting, create-person UI, auth, tests.
