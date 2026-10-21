# Setup guide

This guide sets up a development copy. Phase 13 adds the `new-client` CLI and the in-browser setup wizard that replace most of these steps for client sites.

## 1. Requirements

- Node 22.12 or later and npm 11.21 or later (`npm install -g npm@11.21.0`).
- A PostgreSQL database. Neon or Supabase free plans work. Locally, any PostgreSQL 15 or later.

## 2. Environment

Copy `.env.example` to `.env.local` and fill in:

- `DATABASE_URL`: the pooled address (on Neon, the one with `-pooler` in the host).
- `DIRECT_URL`: the direct address. Migrations use it.
- `AUTH_SECRET`: 32 or more random characters. Run `openssl rand -base64 32`. It also protects saved API keys, so if you change it later you must enter those keys again.
- `SITE_URL`: the public address, for example `https://example.com`.
- `ADMIN_EMAIL` and `ADMIN_PASSWORD`: the first administrator. The password needs 12 or more characters.

Copy the file to `.env` as well, because the Prisma command line reads `.env`.

## 3. Database

```bash
npx prisma migrate deploy
npm run db:seed
```

The seed only creates the administrator. Settings are not seeded: the code holds the defaults and saved values are merged over them when read.

## 4. Media storage

In development, uploads go to a local `.uploads/` folder with no setup. For a live site pick one provider:

**Cloudinary** (resizes images on the fly): set `STORAGE_PROVIDER=cloudinary`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY` and `CLOUDINARY_API_SECRET`.

**Cloudflare R2** (or any S3-compatible bucket): set `STORAGE_PROVIDER=s3`, `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` and `S3_PUBLIC_URL`. Make the bucket public (or attach a custom domain) and add a CORS rule that allows `PUT` from the site address with the `Content-Type` header.

## 5. Payments

Open **Settings > API keys** in the admin (or use environment variables of the same names) and add the keys of the gateways you use, then **Settings > Payments** to switch the methods on. Webhook addresses to register are listed in the Admin manual under "Getting paid". Test each gateway once with its sandbox keys before going live. Set `ALLOWED_HOSTS` if the site is also reached on a preview domain, so links in emails point to the right address.

## 6. Run

```bash
npm run dev
```

Sign in at `/admin/login`. Open **Settings > Modules** to switch modules. In development the **Demo** module owns `/demo`: switch it off and `/demo` returns the 404 page within a few seconds.

## 7. Deploy to Vercel

1. Create a Vercel project from the repository.
2. Add the environment variables from step 2. Leave out `ADMIN_EMAIL` and `ADMIN_PASSWORD` after the first seed.
3. Set the build command to `npx prisma migrate deploy && npm run build`, or run migrations from your machine before each deploy.
4. Set `CRON_SECRET` (16 or more characters). The repository's `vercel.json` already schedules four daily jobs: `/api/cron/cleanup` (Trash and sessions), `/api/cron/store` (cancels unpaid store orders and returns their stock), `/api/cron/growth` (makes affiliate commission ready to pay and gives back discount codes held by unpaid orders) and `/api/cron/subscriptions` (renewal invoices, reminders, expiry). On another host, call all four daily with `Authorization: Bearer <CRON_SECRET>`. The subscriptions job is safe to run more than once a day.
5. Check `/api/health`. It answers yes or no for each dependency and never shows secret values.

## Troubleshooting

| Problem | Fix |
| --- | --- |
| `npm ci` stops with "Cannot read properties of null (reading 'edgesOut')" | Use npm 11.21 or later. |
| The admin says it cannot reach the database | Check `DATABASE_URL`. Some networks block the DNS lookup some providers need; try a provider with a plain hostname. |
| Public pages show "Your company" | That is the default site name. It changes once the Site settings screen arrives in Phase 1, or by saving the `site` setting. |
| Uploads fail with "The storage provider refused the file" | Add the CORS rule from step 4 to the bucket. |
| A module switch takes a few seconds to affect a page | The proxy keeps switches in memory for 3 seconds (`MODULE_PROXY_TTL_MS`). Route handlers check at once. |
