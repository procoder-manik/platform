# White-label website platform

One codebase, deployed once per client. Every feature group is a module the owner switches on or off in the admin, and every client-specific value lives in the database or in environment variables, never in code.

This repository is at **Phase 10 (editable email templates and SMTP)** of the build specification. See `CHANGELOG.md` for what exists and `docs/DECISIONS.md` for the choices made along the way.

## Quick start

```bash
nvm use                      # Node 22
npm install -g npm@11.21.0   # npm 10 crashes on this dependency tree
npm ci
cp .env.example .env.local   # fill in DATABASE_URL, DIRECT_URL, AUTH_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD
cp .env.local .env           # Prisma's CLI reads .env
npx prisma migrate deploy
SEED_PRESET=freelancer npm run db:seed   # first administrator plus starting content
npm run dev
```

Open http://localhost:3000 for the site and http://localhost:3000/admin for the admin. Full steps are in `docs/SETUP.md`.

## Scripts

| Script | Does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build and server |
| `npm run typecheck` | TypeScript, strict |
| `npm run lint` | ESLint, including the token-only and no-long-dash rules |
| `npm run test` | Unit tests, plus integration tests when `DATABASE_URL` is set |
| `npm run test:e2e` | Render and end-to-end tests (Playwright, needs a seeded database) |
| `npm run check` | Typecheck, lint, tests and build together |
| `npm run db:seed` | Creates the first administrator from the environment |
| `npm run render-check` | Signs in and opens every admin screen on a running server |
| `npm run gen-docs` | Regenerates `docs/reference` from the registries |

## Where things live

| Path | Contents |
| --- | --- |
| `src/modules/<id>/manifest.ts` | One manifest per module: routes, menu items, settings, dependencies |
| `src/modules/registry.ts` | The only list of modules |
| `src/lib/modules` | Pure switch logic, `isOn`, `requireModule`, proxy state |
| `src/lib/admin` | Field types, resource registry, validation, generic repository, actions |
| `src/components/admin` | Admin UI: fields, list, editor, media library |
| `src/lib/theme` | Brand settings, presets, fonts, CSS variable builder |
| `src/lib/blocks` | Block catalogue, validation, Markdown, sanitising, page templates |
| `src/components/site` | Public header, footer, block renderers, carousel and other client parts |
| `src/lib/richtext` | Rich text renderer, Markdown import and export, editor extensions |
| `src/lib/seo` | Score engine, content extraction, schema graph, sitemaps, llms.txt, IndexNow, SEO settings |
| `src/lib/checkout` | Pricing, order engine, statuses, payment settings, public and staff actions |
| `src/lib/adapters/payments` | Stripe, PayPal, SSLCommerz and manual payment adapters |
| `src/lib/mail` | Email templates, overrides, the branded renderer, sending and logging |
| `src/lib/accounts` | Customer sign-up and sign-in, one-time links, addresses, wishlist, data export and deletion |
| `src/lib/growth` | Coupon rules, the discount and commission engine, referral rewards, affiliate payouts, settings |
| `src/lib/store` | Variants, tax, shipping, cart and address rules (pure), the stock and order engine, cart actions, settings |
| `src/lib/subscriptions` | Dates and the daily plan (pure), the renewal engine, customer and staff actions, settings |
| `src/lib/mail` | Transactional email templates, branded layout, sending and logging |
| `src/lib/data` | Cached public readers with fallbacks |
| `src/lib/media` | Upload signing, byte checks, usage scan |
| `src/lib/settings` | Settings groups, merge over defaults, cached reads with fallback |
| `src/lib/auth` | Auth.js config, roles and areas, guards |
| `src/lib/adapters` | Storage, mail, payments, AI, rate limit and cache interfaces |
| `src/lib/security` | Encryption of saved API keys |
| `src/proxy.ts` | Sends routes of switched-off modules to the 404 page; maintenance mode |
| `prisma/` | Schema, migrations, seed |
| `eslint-rules/` | Local lint rules that keep components on brand tokens |
| `docs/` | Setup guide, admin manual, decisions, generated reference |
